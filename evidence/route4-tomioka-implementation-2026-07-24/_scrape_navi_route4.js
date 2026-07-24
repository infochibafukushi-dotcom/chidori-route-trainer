'use strict';
/**
 * Scrape Keisei Bus Navi for 系統4 富岡線 official stop orders.
 * Evidence only — does not invent stop sequences.
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
    if (!name || /系統・時刻表一覧|通過時刻表/.test(name)) continue;
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

function uniqueOrderedNames(stops) {
  const names = [];
  for (const s of stops) {
    const n = s.name.replace(/（.*?）/g, '').replace(/\s+/g, '').trim() || s.name.trim();
    // keep official display as-is from page
    const display = s.name.trim();
    if (!names.length || names[names.length - 1] !== display) names.push(display);
  }
  return names;
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note: 'Transcribed only from page content; nothing invented.',
    urayasuCourses: null,
    route4Timetables: [],
    reverseStops: {},
    tripSamples: {},
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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
    report.urayasuCourses = {
      url: coursesUrl,
      all: courses.map((c) => ({ ...c, absHref: absUrl(c.href) })),
      route4: courses
        .filter((c) => /\[4\]|４系統|4系統|富岡/.test(c.text) || (/\[4\]/.test(c.text)))
        .map((c) => ({ ...c, absHref: absUrl(c.href) })),
    };
    // Broader filter: text contains "4 [" or "[4]"
    report.urayasuCourses.route4 = courses
      .filter((c) => /\b4\s*\[4\]|\[4\]/.test(c.text))
      .map((c) => ({ ...c, absHref: absUrl(c.href) }));

    console.log('route4 course links:', report.urayasuCourses.route4.length);
    for (const c of report.urayasuCourses.route4) {
      console.log(' -', c.berth, c.text.slice(0, 120));
    }

    // 2) Open each route-4 timetable and sample trips by destination
    for (const course of report.urayasuCourses.route4) {
      const tt = {
        courseText: course.text,
        berth: course.berth,
        timetableUrl: course.absHref,
        legend: [],
        destinationLabels: [],
        tripLinks: [],
        sampledByDest: {},
      };
      await page.goto(course.absHref, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(2000);
      const meta = await page.evaluate(() => {
        const body = document.body.innerText;
        const legend = [];
        body.split(/\n/).forEach((line) => {
          const t = line.trim();
          if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /行き|止まり|系統/.test(t)) legend.push(t);
        });
        const tripLinks = [];
        document.querySelectorAll('a[href*="diagram"]').forEach((a) => {
          const href = a.getAttribute('href');
          const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
          tripLinks.push({ href, text: text.slice(0, 80) });
        });
        // Also course-diagram / trip detail links
        document.querySelectorAll('a[href*="trip"], a[href*="diagram"], a[href*="course"]').forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (!/diagram|trip-detail|course-diagram|passing/.test(href)) return;
          const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
          if (text && !tripLinks.some((x) => x.href === href)) tripLinks.push({ href, text: text.slice(0, 80) });
        });
        return { legend, bodySnippet: body.slice(0, 2500), tripLinks: tripLinks.slice(0, 80) };
      });
      tt.legend = meta.legend;
      tt.bodySnippet = meta.bodySnippet;
      tt.tripLinks = meta.tripLinks.map((x) => ({ ...x, absHref: absUrl(x.href) }));

      // Prefer links that look like trip times (HH:MM)
      const timeLinks = tt.tripLinks.filter((x) => /^\d{1,2}:\d{2}/.test(x.text) || /\d{1,2}:\d{2}/.test(x.text));
      const candidates = (timeLinks.length ? timeLinks : tt.tripLinks).slice(0, 25);

      for (const link of candidates.slice(0, 12)) {
        try {
          await page.goto(link.absHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(1800);
          const trip = await page.evaluate(() => {
            const body = document.body.innerText;
            const title = document.title;
            const h1 = document.querySelector('h1, h2, .title')?.innerText || '';
            return { title, h1: (h1 || '').slice(0, 200), body };
          });
          const stops = parseStopSequence(trip.body);
          const names = uniqueOrderedNames(stops);
          const destHint =
            names[names.length - 1] ||
            (trip.h1.match(/行き|行\b|→/) ? trip.h1 : null) ||
            'unknown';
          const key = names.length
            ? `${names[0]}→${names[names.length - 1]}`
            : `raw:${link.text}`;
          if (!tt.sampledByDest[key]) {
            tt.sampledByDest[key] = {
              sampleUrl: link.absHref,
              sampleText: link.text,
              pageTitle: trip.title,
              heading: trip.h1,
              stopCount: names.length,
              stops: names,
              rawStops: stops,
              bodySnippet: trip.body.slice(0, 1500),
            };
            console.log('TRIP', key, 'stops=', names.length, names.slice(0, 3).join(','), '...', names.slice(-2).join(','));
          }
        } catch (e) {
          tt.errors = tt.errors || [];
          tt.errors.push(String(e.message || e));
        }
      }
      report.route4Timetables.push(tt);
    }

    // 3) Also check reverse from known terminals: 舞浜駅, TDL, 千鳥車庫
    const terminals = [
      { id: '00020755', name: '舞浜駅' },
      { id: '00020812', name: '東京ディズニーランド' }, // may need discovery
      { id: '00020780', name: '千鳥車庫' },
    ];
    // Discover busstop IDs via search if needed
    for (const term of ['舞浜駅', '東京ディズニーランド', '千鳥車庫']) {
      try {
        const searchUrl = `${BASE}/busstops?word=${encodeURIComponent(term)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);
        const hits = await page.evaluate((termName) => {
          const out = [];
          document.querySelectorAll('a[href*="busstop="]').forEach((a) => {
            const t = (a.innerText || '').replace(/\s+/g, ' ').trim();
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            if (m && t.includes(termName.slice(0, 4))) out.push({ id: m[1], text: t.slice(0, 80), href });
          });
          return out.slice(0, 8);
        }, term);
        report.reverseStops[term] = { searchUrl, hits };
        console.log('SEARCH', term, hits.map((h) => h.id + ':' + h.text).join(' | '));
      } catch (e) {
        report.errors.push(`search ${term}: ${e.message || e}`);
      }
    }

    // 4) For each discovered terminal, list [4] courses toward 浦安駅入口
    for (const [term, info] of Object.entries(report.reverseStops)) {
      const hit = (info.hits || [])[0];
      if (!hit) continue;
      const url = `${BASE}/courses?busstop=${hit.id}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      const r4 = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href*="course-sequence"]').forEach((a) => {
          const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
          if (!/\b4\s*\[4\]|\[4\]/.test(text)) return;
          out.push({ href: a.getAttribute('href'), text: text.slice(0, 250) });
        });
        return out;
      });
      info.route4Courses = r4.map((c) => ({ ...c, absHref: absUrl(c.href) }));
      console.log('TERM', term, 'route4 courses', r4.length);

      for (const course of (info.route4Courses || []).slice(0, 3)) {
        await page.goto(course.absHref, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(1800);
        const tripLinks = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('a[href*="diagram"], a[href*="trip"]').forEach((a) => {
            const href = a.getAttribute('href') || '';
            const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
            if (/\d{1,2}:\d{2}/.test(text) || /diagram|trip/.test(href)) out.push({ href, text: text.slice(0, 60) });
          });
          return out.slice(0, 15);
        });
        for (const link of tripLinks.slice(0, 6)) {
          const abs = absUrl(link.href);
          try {
            await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(1500);
            const trip = await page.evaluate(() => document.body.innerText);
            const stops = parseStopSequence(trip);
            const names = uniqueOrderedNames(stops);
            if (names.length < 2) continue;
            const key = `${term}|${names[0]}→${names[names.length - 1]}`;
            if (!report.tripSamples[key]) {
              report.tripSamples[key] = {
                from: term,
                sampleUrl: abs,
                stops: names,
                stopCount: names.length,
                rawStops: stops,
              };
              console.log('REV', key, names.length, names.join(' → '));
            }
          } catch (e) {
            report.errors.push(String(e.message || e));
          }
        }
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
  console.log('outbound samples:', report.route4Timetables.map((t) => Object.keys(t.sampledByDest || {})).flat());
  console.log('reverse samples:', Object.keys(report.tripSamples));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
