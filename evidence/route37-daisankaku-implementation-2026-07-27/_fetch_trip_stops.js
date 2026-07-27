'use strict';
/** Fetch verified trip stop lists for route-37 signatures. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '_navi_trip_stops.json');

const TRIPS = [
  { key: '37-minamigyotoku-tds', course: '0008200310', dep: '00020650-1', label: '南行徳→TDS full' },
  { key: '37-minamigyotoku-maihama', course: '0008200312', dep: '00020650-1', label: '南行徳→舞浜止まり' },
  { key: '37-tds-minamigyotoku', course: '0008200309', dep: '00020627-1', label: 'TDS→南行徳' },
  { key: '37-maihama-minamigyotoku', course: '0008200311', dep: '00020617-1', label: '舞浜→南行徳' },
  { key: '37-maihama-tds', course: '0008200310', dep: '00020617-1', label: '舞浜→TDS short' },
  { key: '37-tds-horie6', course: '0008200313', dep: '00020627-1', label: 'TDS→堀江六丁目 short' },
  { key: '37-horie6-tds', course: '0008200314', dep: '00020617-1', label: '堀江六丁目→TDS short' },
  { key: '37-fujimi3-tds', course: '0008200315', dep: '00020617-1', label: '富士見三丁目→TDS short' },
];

function parseStops(body) {
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  const stops = []; let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表一覧|通過時刻表|ページの先頭/.test(name)) continue;
    stops.push(name);
  }
  const names = [];
  for (const s of stops) if (!names.length || names[names.length - 1] !== s) names.push(s);
  return names;
}

async function fetchOne(page, t) {
  const url = `https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/8113000c/stops?departure-busstop=${t.dep}&course=${t.course}&datetime=2026-08-02T08:00:00%2B09:00`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(600);
  const body = await page.evaluate(() => document.body.innerText);
  const stopNames = parseStops(body);
  return { ...t, url, stopNames, stopCount: stopNames.length };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'ja-JP' });
  const results = [];
  for (const t of TRIPS) {
    try {
      console.log('fetch', t.key);
      const r = await fetchOne(page, t);
      console.log(' ', r.stopCount, r.stopNames[0], '->', r.stopNames[r.stopNames.length - 1]);
      results.push(r);
      await page.waitForTimeout(800);
    } catch (e) {
      results.push({ ...t, error: String(e.message || e) });
      console.error('fail', t.key, e.message);
    }
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), trips: results }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
