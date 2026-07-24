'use strict';
/**
 * Scrape route-4 富岡線 trip stop sequences from Keisei Bus Navi.
 * Uses a[href*="/stops?"] links (same as route-3 scraper).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

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
  return stops;
}

function uniqueNames(stops) {
  const names = [];
  for (const s of stops) {
    if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  }
  return names;
}

function classifyOutbound(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  if (/ち/.test(cell) || /千鳥車庫/.test(last)) return '4-chidori';
  if (/ランド|ディズニーランド|TDL|東京ディズニー/.test(cell) || /ディズニーランド/.test(last)) return '4-tdl';
  if (/舞浜駅/.test(last) && !/ディズニー/.test(last)) return '4-maihama';
  // unmarked = 舞浜駅行き per legend
  if (!/ランド|ち|ホ/.test(cell) && /舞浜/.test(last)) return '4-maihama';
  return null;
}

async function scrapeTrip(page, url, meta) {
  const out = {
    url,
    meta,
    stops: [],
    stopNames: [],
    heading: null,
    errors: [],
  };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => {
      const body = document.body.innerText;
      const h = document.querySelector('h1, h2');
      return {
        title: document.title,
        heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
        body,
      };
    });
    out.heading = data.heading;
    out.title = data.title;
    out.stops = parseStopSequence(data.body);
    out.stopNames = uniqueNames(out.stops);
    out.bodySnippet = data.body.slice(0, 2000);
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function scrapeTimetable(page, timetableUrl, label) {
  const result = {
    label,
    timetableUrl,
    legend: [],
    tripLinks: [],
    sampled: {},
  };
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (/【\s*[０-９4]+\s*系統\s*】|無印…|ランド…|ち…|ホ…/.test(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 60) };
    });
    return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 3500) };
  });
  result.legend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  // Score links for route-4 marks
  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    if (/ランド/.test(c)) score += 5;
    if (/ち/.test(c) && !/ランド/.test(c)) score += 5;
    if (/ホ/.test(c)) score -= 10; // system 12
    if (/^\d{1,2}:\d{2}$/.test(l.text) || /^\d{1,2}$/.test(l.text)) score += 1;
    // unmarked weekday morning likely 舞浜
    if (!/ランド|ち|ホ/.test(c)) score += 2;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = [];
  const seenClass = new Set();
  for (const l of scored) {
    if (picks.length >= 18) break;
    picks.push(l);
  }

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;
    const cls = classifyOutbound(link.cellText, trip.stopNames);
    const key = cls || `other:${trip.stopNames[0]}→${trip.stopNames.at(-1)}`;
    if (!result.sampled[key]) {
      result.sampled[key] = {
        class: cls,
        cellText: link.cellText,
        sampleUrl: link.absHref,
        stopNames: trip.stopNames,
        stopCount: trip.stopNames.length,
        stops: trip.stops,
        heading: trip.heading,
      };
      console.log('GOT', key, trip.stopNames.length, trip.stopNames.join(' → '));
      seenClass.add(cls);
    }
    // ensure we have all 3 outbound classes
    if (seenClass.has('4-maihama') && seenClass.has('4-tdl') && seenClass.has('4-chidori')) {
      // still collect a few more if needed for reverse later
    }
  }
  return result;
}

async function findBusstopId(page, word) {
  const url = `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`;
  const alt = `${BASE}/busstops?name=${encodeURIComponent(word)}`;
  for (const u of [url, alt, `${BASE}/pc/search?word=${encodeURIComponent(word)}`]) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
      const hits = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="busstop="]')].map((a) => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/busstop=(\d+)/);
          return { id: m && m[1], text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), href };
        }).filter((x) => x.id);
      });
      if (hits.length) return { searchUrl: u, hits };
    } catch (_) {}
  }
  return { searchUrl: null, hits: [] };
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    outbound: null,
    inbound: {},
    errors: [],
  };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // Outbound from 浦安駅入口 berth D (course-sequence with [4])
    const ttUrl =
      `${BASE}/courses/timetables?busstop=00020739&course-sequence=0008200222-1`;
    report.outbound = await scrapeTimetable(page, ttUrl, '浦安駅入口 D / course 0008200222-1');

    // Known / discover reverse terminals
    const terminals = [
      { key: '舞浜駅', preferId: null },
      { key: '東京ディズニーランド', preferId: null },
      { key: '千鳥車庫', preferId: null },
    ];
    // From route-3 scrape, 総合公園 was 00020619 — try map from ekitan or navi map links
    // Also try opening map from timetable "地図" near destinations — fallback IDs from prior knowledge
    const knownIds = {
      舞浜駅: ['00020648', '00020619', '00020755', '00020650'],
      東京ディズニーランド: ['00020812', '00020690', '00020700', '00020800'],
      千鳥車庫: ['00020780', '00020680', '00020770', '00020820'],
    };

    for (const term of terminals) {
      const found = await findBusstopId(page, term.key);
      const ids = [...new Set([...(found.hits || []).map((h) => h.id), ...(knownIds[term.key] || [])])];
      console.log('IDS', term.key, ids.slice(0, 6));
      report.inbound[term.key] = { search: found, tried: [] };

      for (const id of ids.slice(0, 6)) {
        const coursesUrl = `${BASE}/courses?busstop=${id}`;
        await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);
        const title = await page.title();
        const r4 = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('a[href*="course-sequence"]').forEach((a) => {
            const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
            if (!/\[4\]|\b4\s*\[4\]/.test(text) && !/富岡/.test(text)) return;
            // keep if mentions 4
            if (!/\[4\]/.test(text) && !/\b4\s*\[/.test(text)) return;
            out.push({ href: a.getAttribute('href'), text: text.slice(0, 300) });
          });
          // broader: any timetable mentioning 浦安駅入口 and 4
          if (!out.length) {
            document.querySelectorAll('a[href*="course-sequence"]').forEach((a) => {
              const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
              if (/浦安駅入口/.test(text) && /\[4\]/.test(text)) {
                out.push({ href: a.getAttribute('href'), text: text.slice(0, 300) });
              }
            });
          }
          return { title: document.title, stopName: (document.querySelector('h1,h2')?.innerText || '').slice(0, 80), links: out };
        });
        const entry = { id, title, coursesUrl, ...r4 };
        report.inbound[term.key].tried.push(entry);
        console.log('TRY', term.key, id, title.slice(0, 40), 'links', r4.links.length);

        if (!r4.links.length) continue;

        for (const course of r4.links.slice(0, 2)) {
          const abs = absUrl(course.href);
          const sampled = await scrapeTimetable(page, abs, `${term.key}/${id}`);
          // Keep trips that end at 浦安駅入口
          for (const [k, v] of Object.entries(sampled.sampled || {})) {
            const last = v.stopNames?.at(-1) || '';
            const first = v.stopNames?.[0] || '';
            if (!/浦安駅入口/.test(last)) continue;
            let sys = null;
            if (/ディズニー/.test(first)) sys = '4-urayasu-tdl';
            else if (/千鳥/.test(first)) sys = '4-urayasu-chidori';
            else if (/舞浜/.test(first)) sys = '4-urayasu-maihama';
            const sk = sys || `inbound:${first}→${last}`;
            if (!report.inbound[term.key].systems) report.inbound[term.key].systems = {};
            if (!report.inbound[term.key].systems[sk]) {
              report.inbound[term.key].systems[sk] = v;
              console.log('IN', sk, v.stopNames.join(' → '));
            }
          }
          report.inbound[term.key].lastTimetable = {
            url: abs,
            legend: sampled.legend,
            sampleKeys: Object.keys(sampled.sampled || {}),
          };
        }
        if (report.inbound[term.key].systems && Object.keys(report.inbound[term.key].systems).length) break;
      }
    }
  } catch (e) {
    report.errors.push(String(e.stack || e));
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT_DIR, '_navi_trips_raw.json'), JSON.stringify(report, null, 2));
  console.log('\n=== OUTBOUND CLASSES ===');
  console.log(Object.keys(report.outbound?.sampled || {}));
  console.log('=== INBOUND ===');
  for (const [k, v] of Object.entries(report.inbound)) {
    console.log(k, Object.keys(v.systems || {}));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
