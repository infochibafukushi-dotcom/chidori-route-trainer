'use strict';
/** Fetch exactly one sample trip per route-23 direction for gate/build pipeline. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const OUT_PATH = path.join(OUT, '_navi_deep_raw.json');
const RAW = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));

const TRIPS = [
  {
    label: '23-maihama-sogo',
    url: 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020617&course-sequence=0008200303-1&datetime=2026-07-27T05:00',
    sampleTrip: 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81120000/stops?departure-busstop=00020617-3&course=0008200303&datetime=2026-08-02T10:38:00%2B09:00',
    terminal: '舞浜駅', berth: '3', course: '0008200303',
  },
  {
    label: '23-sogo-maihama',
    url: 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020745&course-sequence=0008200302-1&datetime=2026-07-27T05:00',
    sampleTrip: 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81110000/stops?departure-busstop=00020745-1&course=0008200302&datetime=2026-07-27T06:15:00%2B09:00',
    terminal: '総合公園', berth: '01', course: '0008200302',
  },
];

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
  for (const s of stops) if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  return names;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'ja-JP' });
  const report = {
    scrapedAt: new Date().toISOString(),
    routeNumber: '23',
    lineName: '浦安東団地線',
    note: 'Minimal 2-trip scrape for route-23 maihama↔sogo.',
    timetables: [],
    signatures: {},
    trips: [],
    discoveredBusstopIds: { ...(RAW.knownIds || {}) },
  };

  for (const t of TRIPS) {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    const legend = await page.evaluate(() => {
      const out = [];
      document.body.innerText.split(/\n/).forEach((line) => {
        const s = line.trim();
        if (/【\s*[０-９0-9]+\s*系統\s*】/.test(s) || (/\[\d{1,2}\]/.test(s) && /行き|経由/.test(s))) out.push(s);
        if (/…/.test(s) && /系統/.test(s)) out.push(s);
      });
      return [...new Set(out)].slice(0, 40);
    });
    report.timetables.push({ terminal: t.terminal, berth: t.berth, url: t.url, legend, courseText: t.label });

    await page.goto(t.sampleTrip, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(500);
    const body = await page.evaluate(() => document.body.innerText);
    const stopNames = uniqueNames(parseStopSequence(body));
    const sigKey = stopNames.join('>');
    report.signatures[sigKey] = {
      stopNames, stopCount: stopNames.length, count: 1, courses: [t.course],
      berths: [t.berth], sampleUrls: [t.sampleTrip], terminal: t.terminal, cellTexts: ['sample'],
    };
    report.trips.push({
      url: t.sampleTrip, stopNames, course: t.course, legend, terminal: t.terminal, berth: t.berth, courseText: t.label,
    });
    console.log(t.label, stopNames.length, stopNames[0], '->', stopNames[stopNames.length - 1]);
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('wrote', OUT_PATH);
}

main().catch((e) => { console.error(e); process.exit(1); });
