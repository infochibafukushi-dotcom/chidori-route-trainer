'use strict';
/** Fetch sogo-maihama inbound (course 0008200307, symbol ◇ま) missed by mixed-cell filter. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '_navi_deep_raw.json');
const DEEP = JSON.parse(fs.readFileSync(OUT, 'utf8'));

const TRIP_URLS = [
  'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81040000/stops?departure-busstop=00020745-1&course=0008200307&datetime=2026-07-27T07:25:00%2B09:00',
  'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81040001/stops?departure-busstop=00020745-1&course=0008200307&datetime=2026-07-27T16:15:00%2B09:00',
  'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81040002/stops?departure-busstop=00020745-1&course=0008200307&datetime=2026-07-27T12:04:00%2B09:00',
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
  for (const url of TRIP_URLS) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(500);
    const data = await page.evaluate(() => ({ body: document.body.innerText, href: location.href, title: document.title }));
    const stopNames = uniqueNames(parseStopSequence(data.body));
    let course = null;
    try { course = new URL(data.href).searchParams.get('course'); } catch (_) {}
    const sigKey = stopNames.join('>');
    console.log('SIG', stopNames.length, stopNames[0], '->', stopNames[stopNames.length - 1], 'course', course);
    if (!DEEP.signatures[sigKey]) {
      DEEP.signatures[sigKey] = {
        stopNames, stopCount: stopNames.length, count: 0, courses: [], berths: ['04'],
        sampleUrls: [], cellTexts: ['25◇ま'], terminal: '総合公園',
      };
    }
    const sig = DEEP.signatures[sigKey];
    sig.count += 1;
    if (course && !sig.courses.includes(course)) sig.courses.push(course);
    if (sig.sampleUrls.length < 6) sig.sampleUrls.push(url);
    DEEP.trips.push({
      url, title: data.title, stopNames, stops: parseStopSequence(data.body), course,
      departureBusstopId: '00020745-1', terminal: '総合公園', berth: '04',
      cellText: '25◇ま', courseText: '25 [25] 総合公園発 舞浜駅行',
      legend: ['◇ま…【２５系統】高洲四丁目経由　舞浜駅行き'],
    });
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(DEEP, null, 2));
  console.log('patched', Object.keys(DEEP.signatures).length, 'signatures');
}

main().catch((e) => { console.error(e); process.exit(1); });
