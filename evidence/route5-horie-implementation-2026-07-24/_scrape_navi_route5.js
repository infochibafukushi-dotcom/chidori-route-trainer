'use strict';
/**
 * Scrape Keisei Bus Navi for 系統5 堀江線 official stop orders.
 * Evidence only — does not invent stop sequences.
 * Prefers a[href*="/stops?"] trip pages (通過時刻表).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const URAYASU = '00020739';

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return 'https://transfer-cloud.navitime.biz' + href;
}

function parseStopSequence(bodyText) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(bodyText)) !== null) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表一覧|通過時刻表|ページの先頭/.test(name)) continue;
    stops.push({ time: m[1], kind: m[2], name });
  }
  if (stops.length === 0) {
    const compact = bodyText.replace(/\s+/g, ' ');
    const re2 = /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
    while ((m = re2.exec(compact)) !== null) {
      const name = m[3].replace(/系統.*$/, '').trim();
      if (name && name.length < 40) stops.push({ time: m[1], kind: m[2], name });
    }
  }
  return stops;
}

function uniqueNames(stops) {
  const names = [];
  for (const s of stops) {
    if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  }
  return names;
}

/** Classify outbound trip from 浦安駅入口 by cell mark + last stop. */
function classifyOutbound(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  // Reject non-route-5
  if (/\[4\]|\[9\]|\[37\]|\[14\]|\[6\]|【\s*[４９６]/.test(cell)) return null;
  // Ｎ mark → NTT short turn
  if (/Ｎ|N(?![A-Za-z])|ＮＴＴ/.test(cell) || /^ＮＴＴ浦安前$/.test(last)) {
    if (/ＮＴＴ浦安前/.test(last)) return '5-ntt';
  }
  // unmarked → 新浦安駅
  if (/新浦安駅/.test(last) && !/Ｎ|と|中央/.test(cell.replace(/新浦安|東野中央/g, ''))) {
    return '5-shinurayasu';
  }
  if (/新浦安駅/.test(last)) return '5-shinurayasu';
  if (/ＮＴＴ浦安前/.test(last)) return '5-ntt';
  return null;
}

/** Classify inbound from 新浦安駅. */
function classifyInbound(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  const first = stopNames[0] || '';
  if (!/新浦安/.test(first)) return null;
  // と → 東海大浦安高校前
  if (/と/.test(cell) || /東海大浦安高校前/.test(last)) {
    if (/東海大/.test(last)) return '5-tokai';
  }
  // 中央 → 東野中央
  if (/中央/.test(cell) || /^東野中央$/.test(last)) {
    if (/東野中央/.test(last)) return '5-higashino-chuo';
  }
  // unmarked → 浦安駅入口
  if (/浦安駅入口/.test(last)) return '5-urayasu';
  return null;
}

function isRoute5Legend(line) {
  return /【\s*[５5]\s*系統\s*】|無印…|Ｎ…|と…|中央…/.test(line);
}

function isRoute5CourseText(text) {
  // Must mention [5] and not be clearly another system-only row
  if (!/\[5\]/.test(text)) return false;
  // Prefer 堀江
  if (/堀江/.test(text)) return true;
  // Or explicit 5 [5]
  if (/\b5\s*\[5\]/.test(text)) return true;
  return false;
}

async function scrapeTrip(page, url, meta) {
  const out = {
    url,
    meta,
    stops: [],
    stopNames: [],
    heading: null,
    title: null,
    bodySnippet: null,
    busstopLinks: [],
    errors: [],
  };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => {
      const body = document.body.innerText;
      const h = document.querySelector('h1, h2');
      const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => ({
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: a.getAttribute('href'),
        id: (a.getAttribute('href') || '').match(/busstop=(\d+)/)?.[1] || null,
      }));
      return {
        title: document.title,
        heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
        body,
        busstopLinks,
      };
    });
    out.heading = data.heading;
    out.title = data.title;
    out.stops = parseStopSequence(data.body);
    out.stopNames = uniqueNames(out.stops);
    out.bodySnippet = data.body.slice(0, 2500);
    out.busstopLinks = data.busstopLinks;
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function scrapeTimetable(page, timetableUrl, label, classifyFn) {
  const result = {
    label,
    timetableUrl,
    legend: [],
    tripLinks: [],
    sampled: {},
    bodySnippet: null,
    errors: [],
  };
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) legend.push(t);
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
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
  result.legend = meta.legend.filter((l) => isRoute5Legend(l) || /５系統|5系統|【５/.test(l) || meta.legend.length < 15);
  // Keep all legends for evidence; also store route5-filtered
  result.allLegend = meta.legend;
  result.legend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  // Score: prefer marks matching expected symbols, diversify
  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    const href = l.href || '';
    if (/Ｎ/.test(c)) score += 6;
    if (/と/.test(c)) score += 6;
    if (/中央/.test(c)) score += 6;
    if (!/Ｎ|と|中央|ランド|ち|ホ|あ|明|ひ|そ|ベ/.test(c)) score += 3; // unmarked
    if (/course=/.test(href)) score += 1;
    // deprioritize obvious non-5 course ids if mixed
    if (/\[4\]|\[9\]|\[37\]|\[14\]/.test(c)) score -= 20;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, 40);
  const seen = new Set();

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;
    const cls = classifyFn(link.cellText, trip.stopNames);
    const key = cls || `other:${trip.stopNames[0]}→${trip.stopNames[trip.stopNames.length - 1]}`;
    if (seen.has(key)) continue;
    // Only keep route-5 classified or interesting others for evidence
    result.sampled[key] = {
      class: cls,
      cellText: link.cellText,
      sampleUrl: link.absHref,
      stopNames: trip.stopNames,
      stopCount: trip.stopNames.length,
      stops: trip.stops,
      heading: trip.heading,
      title: trip.title,
      bodySnippet: trip.bodySnippet,
      busstopLinks: trip.busstopLinks,
    };
    seen.add(key);
    console.log('GOT', key, trip.stopNames.length, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
  }
  return result;
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            return {
              id: m && m[1],
              text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              href,
            };
          })
          .filter((x) => x.id)
      );
      if (hits.length) return { searchUrl: u, hits };
    } catch (_) {}
  }
  return { searchUrl: null, hits: [] };
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note: 'Transcribed only from Navi trip pages; nothing invented.',
    urayasuCourses: null,
    outbound: null,
    shinurayasuSearch: null,
    inbound: {},
    idMap: {},
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // 1) List courses from 浦安駅入口
    const coursesUrl = `${BASE}/courses?busstop=${URAYASU}`;
    await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const courses = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href*="course-sequence"]').forEach((a) => {
        const href = a.getAttribute('href');
        const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const tr = a.closest('tr');
        let berth = null;
        if (tr) {
          const cell = tr.querySelector('th, td');
          if (cell) berth = (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20);
        }
        out.push({ href, text, berth });
      });
      return out;
    });
    const route5 = courses
      .filter((c) => isRoute5CourseText(c.text))
      .map((c) => ({ ...c, absHref: absUrl(c.href) }));
    report.urayasuCourses = {
      url: coursesUrl,
      all: courses.map((c) => ({ ...c, absHref: absUrl(c.href) })),
      route5,
    };
    console.log('route5 course links:', route5.length);
    for (const c of route5) console.log(' -', c.berth, c.text.slice(0, 140));

    // 2) Outbound timetable(s)
    for (const course of route5.slice(0, 2)) {
      const sampled = await scrapeTimetable(page, course.absHref, `outbound/${course.berth}`, classifyOutbound);
      if (!report.outbound) report.outbound = sampled;
      else {
        // merge samples
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (!report.outbound.sampled[k]) report.outbound.sampled[k] = v;
        }
      }
    }

    // 3) Discover 新浦安駅 busstop id from outbound trip busstop links + search
    const shinSample =
      (report.outbound && report.outbound.sampled['5-shinurayasu']) ||
      Object.values((report.outbound && report.outbound.sampled) || {}).find((s) =>
        (s.stopNames || []).some((n) => /新浦安駅/.test(n))
      );

    if (shinSample && shinSample.busstopLinks) {
      const shinLinks = shinSample.busstopLinks.filter((b) => /新浦安駅/.test(b.text || ''));
      report.idMap.shinurayasuFromTrip = shinLinks;
      console.log('shinurayasu links from trip:', shinLinks.slice(0, 8));
    }

    const search = await findBusstopId(page, '新浦安駅');
    report.shinurayasuSearch = search;
    console.log(
      'SEARCH 新浦安駅',
      (search.hits || []).slice(0, 10).map((h) => h.id + ':' + h.text).join(' | ')
    );

    // Candidate IDs: from trip links first, then search
    const candidateIds = [];
    for (const b of report.idMap.shinurayasuFromTrip || []) {
      if (b.id && !candidateIds.includes(b.id)) candidateIds.push(b.id);
    }
    for (const h of search.hits || []) {
      if (h.id && /新浦安駅/.test(h.text) && !candidateIds.includes(h.id)) candidateIds.push(h.id);
    }
    // Also try IDs seen in prior project evidence if needed
    for (const id of ['00020618', '00020740', '00020650', '00020616', '00020750']) {
      if (!candidateIds.includes(id)) candidateIds.push(id);
    }

    // 4) For each candidate, find [5] courses and sample inbound trips
    for (const id of candidateIds.slice(0, 8)) {
      const coursesUrl2 = `${BASE}/courses?busstop=${id}`;
      await page.goto(coursesUrl2, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1500);
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        h: (document.querySelector('h1,h2')?.innerText || '').slice(0, 100),
        links: [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => ({
          href: a.getAttribute('href'),
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          berth: (() => {
            const tr = a.closest('tr');
            if (!tr) return null;
            const cell = tr.querySelector('th, td');
            return cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20) : null;
          })(),
        })),
      }));
      const r5 = pageInfo.links.filter((l) => isRoute5CourseText(l.text));
      const entry = {
        id,
        title: pageInfo.title,
        heading: pageInfo.h,
        coursesUrl: coursesUrl2,
        route5Courses: r5.map((c) => ({ ...c, absHref: absUrl(c.href) })),
        allCourseCount: pageInfo.links.length,
      };
      report.inbound[id] = entry;
      console.log('TRY', id, pageInfo.h || pageInfo.title, 'r5=', r5.length);

      if (!r5.length) continue;

      for (const course of r5.slice(0, 2)) {
        const sampled = await scrapeTimetable(
          page,
          absUrl(course.href),
          `inbound/${id}/${course.berth}`,
          classifyInbound
        );
        entry.lastTimetable = {
          url: absUrl(course.href),
          berth: course.berth,
          courseText: course.text,
          legend: sampled.legend,
          sampleKeys: Object.keys(sampled.sampled || {}),
        };
        entry.sampled = entry.sampled || {};
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (!entry.sampled[k]) entry.sampled[k] = v;
          // Also promote confirmed classes to top-level
          if (k.startsWith('5-')) {
            report.idMap.confirmedInbound = report.idMap.confirmedInbound || {};
            if (!report.idMap.confirmedInbound[k]) {
              report.idMap.confirmedInbound[k] = { ...v, terminalId: id, berth: course.berth };
              console.log('IN', k, v.stopCount, v.stopNames[0], '→', v.stopNames[v.stopNames.length - 1]);
            }
          }
        }
        // Stop early if we have all 3 inbound
        const got = report.idMap.confirmedInbound || {};
        if (got['5-urayasu'] && got['5-tokai'] && got['5-higashino-chuo']) break;
      }
      const got = report.idMap.confirmedInbound || {};
      if (got['5-urayasu'] && got['5-tokai'] && got['5-higashino-chuo']) {
        report.idMap.shinurayasuBusstop = id;
        break;
      }
      // If we got at least one inbound 5, remember id
      if (Object.keys(got).length && !report.idMap.shinurayasuBusstop) {
        report.idMap.shinurayasuBusstop = id;
      }
    }
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }

  const outPath = path.join(OUT_DIR, '_navi_scrape_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
  console.log('outbound classes:', Object.keys(report.outbound?.sampled || {}));
  console.log('inbound confirmed:', Object.keys(report.idMap.confirmedInbound || {}));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
