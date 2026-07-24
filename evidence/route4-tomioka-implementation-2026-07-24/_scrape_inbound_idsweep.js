'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

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
    if (!name || /系統・時刻表|通過時刻表|ページの先頭/.test(name)) continue;
    if (!stops.length || stops[stops.length - 1].name !== name) {
      stops.push({ time: m[1], kind: m[2], name });
    }
  }
  return stops;
}

async function main() {
  const report = { scrapedAt: new Date().toISOString(), inbound: {} };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Open a TDL outbound trip, then click the terminal stop name if linked
  const tt = `${BASE}/courses/timetables?busstop=00020739&course-sequence=0008200222-1`;
  await page.goto(tt, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  const tdlLink = await page.evaluate(() => {
    const as = [...document.querySelectorAll('a[href*="/stops?"]')];
    const hit = as.find((a) => /ランド/.test((a.closest('td,li,div') || a.parentElement).innerText || ''));
    return hit ? hit.getAttribute('href') : null;
  });
  await page.goto(absUrl(tdlLink), { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);

  // Click last stop name text link if any
  const stopNameLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].map((a) => ({
      text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      href: a.getAttribute('href'),
    })).filter((x) => /ディズニーランド|舞浜駅|千鳥車庫|運動公園|系統・時刻表/.test(x.text));
  });
  report.fromTripLinks = stopNameLinks;
  console.log('stopNameLinks', stopNameLinks);

  // Try navitime transit search API-ish pages
  // Example: /route/bus? ... 
  const journeyTries = [
    {
      key: '4-urayasu-tdl',
      // freefrom search pages
      startHint: '東京ディズニーランド',
      goalHint: '浦安駅入口',
    },
  ];

  // Use map busstop search by opening /pc/maps and injecting
  await page.goto(`${BASE}/pc/maps`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(2000);
  report.mapPage = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    body: document.body.innerText.slice(0, 500),
  }));
  console.log('map', report.mapPage.title, report.mapPage.url);

  // Direct GTFS-like: try busstop IDs found in HTML source of baycity
  // Sweep: fetch courses pages for IDs that appear in route3 scrape near maihama
  const candidateIds = [];
  // From openstreetmap notes / previous projects - try reading imagawa for 舞浜 busstop
  // Brute: search page source of keisei for 舞浜駅 busstop=
  await page.goto('https://www.google.com/search?q=site:transfer-cloud.navitime.biz+keiseibus-group+舞浜駅+busstop', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(() => null);
  await page.waitForTimeout(2000);
  const g = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /busstop=\\d+/.test(h)).slice(0, 20)
  );
  report.googleHits = g;
  console.log('googleHits', g);

  // Alternative: use OSM nominatim + navi is hard.
  // Confirm inbound via OSM relation + reverse of Navi outbound names (same corridor).
  // Also try ekitan via-stop pages with different URL patterns.
  const ekitanVia = [
    'https://mb.jorudan.co.jp/os/bus/1274/route/355.html',
    'https://www.navitime.co.jp/bus/diagram/timelist?department=00020739',
  ];
  for (const url of ekitanVia) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);
      const meta = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        body: document.body.innerText.slice(0, 2000),
        links: [...document.querySelectorAll('a')].map((a) => (a.innerText || '').trim().slice(0, 80)).filter((t) => /富岡|４|4系統|ディズニー|千鳥/.test(t)).slice(0, 20),
      }));
      report[`via-${url.slice(0, 40)}`] = meta;
      console.log('VIA', meta.title.slice(0, 50), meta.links.slice(0, 5));
    } catch (e) {
      console.log('via fail', e.message);
    }
  }

  // Final approach: from 運動公園 platform, use Overpass to get nothing for navi.
  // Use Navitime diagram from course on reverse by constructing URL from outbound reverse course-sequence.
  // Found earlier: course-sequence=0008200226-1 on a chidori-related link — open with busstop unknown.
  // Try opening timetable with date and filter.

  // Probe many busstop IDs near 00020xxx that contain 舞浜 in title
  const start = 20600;
  const found = [];
  for (let id = start; id < start + 250 && found.length < 8; id++) {
    const busstop = String(id).padStart(8, '0');
    const url = `${BASE}/courses?busstop=${busstop}`;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (!resp || resp.status() >= 400) continue;
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const h = (document.querySelector('h1,h2')?.innerText || document.title || '').replace(/\s+/g, ' ').trim();
        const has4 = [...document.querySelectorAll('a[href*="course-sequence"]')].some((a) => /\[4\]/.test(a.innerText || ''));
        return { h, has4 };
      });
      if (/舞浜駅|ディズニーランド|千鳥車庫/.test(info.h) || info.has4 && /舞浜|ディズニー|千鳥/.test(info.h)) {
        found.push({ busstop, ...info });
        console.log('FOUND', busstop, info.h, 'has4', info.has4);
      }
    } catch (_) {}
  }
  report.idSweep = found;

  // If found, scrape inbound trips
  for (const f of found) {
    const coursesUrl = `${BASE}/courses?busstop=${f.busstop}`;
    await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="course-sequence"]')]
        .map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 250) }))
        .filter((x) => /\[4\]/.test(x.text) || (/浦安駅入口/.test(x.text) && /市役所入口/.test(x.text)))
    );
    console.log('courses', f.busstop, links.length, links[0]?.text?.slice(0, 100));
    for (const course of links.slice(0, 2)) {
      await page.goto(absUrl(course.href), { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1200);
      const tripLinks = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/stops?"]')].slice(0, 10).map((a) => ({
          href: a.getAttribute('href'),
          cell: ((a.closest('td,li,div') || a.parentElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        }))
      );
      for (const tl of tripLinks.slice(0, 5)) {
        await page.goto(absUrl(tl.href), { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(900);
        const body = await page.evaluate(() => document.body.innerText);
        const stops = parseStops(body);
        const names = stops.map((s) => s.name);
        if (names.length < 2 || !/浦安駅入口/.test(names.at(-1) || '')) continue;
        const first = names[0];
        let sys = null;
        if (/ディズニー/.test(first)) sys = '4-urayasu-tdl';
        else if (/千鳥/.test(first)) sys = '4-urayasu-chidori';
        else if (/舞浜/.test(first)) sys = '4-urayasu-maihama';
        if (sys && !report.inbound[sys]) {
          report.inbound[sys] = { busstop: f.busstop, stopNames: names, sampleUrl: absUrl(tl.href), cell: tl.cell };
          console.log('IN', sys, names.join(' → '));
        }
      }
    }
  }

  fs.writeFileSync(path.join(OUT, '_navi_inbound_found.json'), JSON.stringify(report, null, 2));
  console.log('done', Object.keys(report.inbound));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
