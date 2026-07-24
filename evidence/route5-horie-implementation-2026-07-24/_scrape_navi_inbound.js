'use strict';
/**
 * Scrape 系統5 堀江線 inbound patterns from 新浦安駅 (and related terminals).
 * Uses ordered busstop links from outbound trip to resolve IDs.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const RAW = path.join(OUT, '_navi_scrape_raw.json');

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return 'https://transfer-cloud.navitime.biz' + href;
}

function parseStops(body) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (name && !/系統・時刻表|通過時刻表|ページの先頭/.test(name)) {
      if (!stops.length || stops[stops.length - 1].name !== name) {
        stops.push({ time: m[1], kind: m[2], name });
      }
    }
  }
  return stops;
}

function uniqueNames(stops) {
  return stops.map((s) => s.name);
}

function classifyInbound(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  const first = stopNames[0] || '';
  // Must start at 新浦安駅 (or north exit if short variants exist)
  if (!/新浦安駅/.test(first)) return null;
  if (/と/.test(cell) && /東海大/.test(last)) return '5-tokai';
  if (/中央/.test(cell) && /東野中央/.test(last)) return '5-higashino-chuo';
  if (/東海大浦安高校前/.test(last) && !/浦安駅入口/.test(last)) return '5-tokai';
  if (/^東野中央$/.test(last)) return '5-higashino-chuo';
  if (/浦安駅入口/.test(last)) return '5-urayasu';
  return null;
}

function isRoute5CourseText(text) {
  if (!/\[5\]/.test(text)) return false;
  if (/堀江/.test(text)) return true;
  if (/\b5\s*\[5\]/.test(text)) return true;
  return false;
}

/** Map stop names → busstop ids from ordered 「系統・時刻表一覧」links on a trip page. */
function mapStopsToIds(stopNames, busstopLinks) {
  // Filter to generic 系統・時刻表一覧 links (skip breadcrumb / timetable title links)
  const listing = (busstopLinks || []).filter(
    (b) => b.text === '系統・時刻表一覧' && b.id
  );
  // Sometimes first listing duplicates departure; align by count
  const map = {};
  const n = Math.min(stopNames.length, listing.length);
  // If listing has one extra leading departure duplicate, try offset
  let offset = 0;
  if (listing.length === stopNames.length + 1) offset = 1;
  if (listing.length === stopNames.length) offset = 0;
  // Prefer: last listing id for last stop
  for (let i = 0; i < stopNames.length; i++) {
    const idx = i + offset;
    if (idx < listing.length) map[stopNames[i]] = listing[idx].id;
  }
  // Always bind last stop to last listing id if present
  if (stopNames.length && listing.length) {
    map[stopNames[stopNames.length - 1]] = listing[listing.length - 1].id;
  }
  return { map, listingIds: listing.map((l) => l.id) };
}

async function scrapeTimetable(page, timetableUrl, label) {
  const result = {
    label,
    timetableUrl,
    legend: [],
    tripLinks: [],
    sampled: {},
    bodySnippet: null,
  };
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1800);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 80) };
    });
    return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 4500) };
  });
  result.legend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  // Score for diversity of marks と / 中央 / unmarked
  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    if (/と/.test(c)) score += 8;
    if (/中央/.test(c)) score += 8;
    if (/Ｎ/.test(c)) score += 2;
    if (!/と|中央|Ｎ|ランド|ち|ホ|あ|明/.test(c)) score += 4;
    if (/\[4\]|\[9\]|\[37\]|\[14\]|\[6\]/.test(c)) score -= 20;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  for (const link of scored.slice(0, 45)) {
    try {
      await page.goto(link.absHref, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1000);
      const data = await page.evaluate(() => ({
        title: document.title,
        heading: (document.querySelector('h1,h2')?.innerText || '').slice(0, 200),
        body: document.body.innerText,
      }));
      const stops = parseStops(data.body);
      const names = uniqueNames(stops);
      if (names.length < 2) continue;
      const cls = classifyInbound(link.cellText, names);
      const key = cls || `other:${names[0]}→${names[names.length - 1]}`;
      if (seen.has(key)) continue;
      // Keep route-5 classified, or others that look like route 5 destinations
      const keep =
        cls ||
        (/新浦安/.test(names[0]) &&
          (/浦安駅入口|東海大|東野中央/.test(names[names.length - 1]) || /\[5\]/.test(data.title)));
      if (!keep) continue;
      result.sampled[key] = {
        class: cls,
        cellText: link.cellText,
        sampleUrl: link.absHref,
        stopNames: names,
        stopCount: names.length,
        stops,
        heading: data.heading,
        title: data.title,
        bodySnippet: data.body.slice(0, 2000),
      };
      seen.add(key);
      console.log('GOT', key, names.length, names[0], '→', names[names.length - 1]);
      if (
        seen.has('5-urayasu') &&
        seen.has('5-tokai') &&
        seen.has('5-higashino-chuo')
      ) {
        break;
      }
    } catch (e) {
      console.log('trip err', e.message || e);
    }
  }
  return result;
}

async function main() {
  const prior = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    stopIdMap: {},
    terminalsTried: {},
    confirmed: {},
    errors: [],
  };

  // Build ID map from outbound 5-shinurayasu sample
  const shin = prior.outbound?.sampled?.['5-shinurayasu'];
  if (shin) {
    const mapped = mapStopsToIds(shin.stopNames, shin.busstopLinks);
    report.stopIdMap = mapped.map;
    report.stopIdListing = mapped.listingIds;
    console.log('ID map:');
    for (const [name, id] of Object.entries(mapped.map)) {
      console.log(' ', name, id);
    }
  }

  const candidates = [];
  const shinId = report.stopIdMap['新浦安駅'];
  const northId = report.stopIdMap['新浦安駅北口'];
  if (shinId) candidates.push({ id: shinId, label: '新浦安駅' });
  if (northId) candidates.push({ id: northId, label: '新浦安駅北口' });
  // Also try known last-link id and a few nearby
  for (const id of ['00020619', '00020668']) {
    if (!candidates.some((c) => c.id === id)) candidates.push({ id, label: `probe-${id}` });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    for (const term of candidates) {
      const coursesUrl = `${BASE}/courses?busstop=${term.id}`;
      await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1500);
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        h: (document.querySelector('h1,h2')?.innerText || '').slice(0, 120),
        links: [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => {
          const tr = a.closest('tr');
          const cell = tr && tr.querySelector('th, td');
          return {
            href: a.getAttribute('href'),
            text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20) : null,
          };
        }),
      }));
      const r5 = pageInfo.links.filter((l) => isRoute5CourseText(l.text));
      const entry = {
        id: term.id,
        label: term.label,
        heading: pageInfo.h,
        title: pageInfo.title,
        coursesUrl,
        route5Courses: r5.map((c) => ({ ...c, absHref: absUrl(c.href) })),
        allCourseCount: pageInfo.links.length,
        allCourses: pageInfo.links.map((l) => ({
          text: l.text.slice(0, 120),
          berth: l.berth,
          absHref: absUrl(l.href),
        })),
      };
      report.terminalsTried[term.id] = entry;
      console.log('TRY', term.label, term.id, (pageInfo.h || '').split('\n')[0], 'r5=', r5.length);

      if (!r5.length) continue;

      for (const course of r5.slice(0, 3)) {
        const sampled = await scrapeTimetable(page, absUrl(course.href), `${term.label}/${course.berth}`);
        entry.lastTimetable = {
          url: absUrl(course.href),
          berth: course.berth,
          courseText: course.text,
          legend: sampled.legend,
          sampleKeys: Object.keys(sampled.sampled || {}),
        };
        entry.sampled = Object.assign(entry.sampled || {}, sampled.sampled);
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (k.startsWith('5-') && !report.confirmed[k]) {
            report.confirmed[k] = {
              ...v,
              terminalId: term.id,
              terminalLabel: term.label,
              berth: course.berth,
              timetableUrl: absUrl(course.href),
              legend: sampled.legend,
            };
          }
        }
        if (
          report.confirmed['5-urayasu'] &&
          report.confirmed['5-tokai'] &&
          report.confirmed['5-higashino-chuo']
        ) {
          break;
        }
      }
      if (
        report.confirmed['5-urayasu'] &&
        report.confirmed['5-tokai'] &&
        report.confirmed['5-higashino-chuo']
      ) {
        report.shinurayasuBusstop = term.id;
        break;
      }
    }

    // If still missing short-turns, also try departing from 東海大 / 東野中央 / NTT as evidence
    // (only if those appear as course destinations from 新浦安 — already covered by marks)

  } catch (e) {
    report.errors.push(String(e.stack || e));
  } finally {
    await browser.close();
  }

  const outPath = path.join(OUT, '_navi_inbound_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
  console.log('confirmed', Object.keys(report.confirmed));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
