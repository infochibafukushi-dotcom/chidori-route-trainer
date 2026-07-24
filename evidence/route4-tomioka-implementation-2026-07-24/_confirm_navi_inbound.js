'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const targets = new Map([
  ['舞浜駅', '4-urayasu-maihama'],
  ['千鳥車庫', '4-urayasu-chidori'],
  ['東京ディズニーランド', '4-urayasu-tdl'],
]);

function absolute(href) {
  return new URL(href, 'https://transfer-cloud.navitime.biz').href;
}

function namesFromText(text) {
  const result = [];
  for (const match of text.matchAll(/(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g)) {
    const name = match[3].replace(/\s+/g, ' ').trim();
    if (name && !/系統・時刻表|通過時刻表|ページの先頭/.test(name) &&
      result.at(-1) !== name) result.push(name);
  }
  return result;
}

function isRequestedRoute(key, stopNames) {
  if (!/浦安駅入口/.test(stopNames.at(-1) || '')) return false;
  // 千鳥車庫 has a shared timetable page for systems 2/4/6/14. System 4 is
  // specifically the 市役所入口・郵便局前 / 日生研修センター branch.
  if (key === '4-urayasu-chidori') {
    return stopNames.includes('日生研修センター') &&
      stopNames.includes('市役所入口・郵便局前') &&
      !stopNames.includes('若潮公園');
  }
  return true;
}

async function getStopInfo(page, busstop) {
  const response = await page.goto(`${BASE}/courses?busstop=${busstop}`, {
    waitUntil: 'domcontentloaded', timeout: 45000,
  });
  if (!response || response.status() >= 400) return null;
  return page.evaluate(() => ({
    title: document.title,
    name: (document.querySelector('h1')?.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const found = {};

  // The outbound trip shows a contiguous local stop-id range. Resolve all valid
  // stops in that range, including the opposite-side terminal IDs.
  for (let n = 20600; n <= 20950 && Object.keys(found).length < targets.size; n++) {
    const busstop = String(n).padStart(8, '0');
    try {
      const info = await getStopInfo(page, busstop);
      if (!info) continue;
      for (const [needle, key] of targets) {
        if (info.name.includes(needle) && !found[key]) {
          found[key] = { busstop, displayedName: info.name };
          console.log('FOUND', key, busstop, info.name);
        }
      }
    } catch {}
  }

  const report = {
    scrapedAt: new Date().toISOString(),
    source: 'Keisei Bus Navi',
    stopIds: found,
    inbound: {},
    unresolved: [],
  };

  for (const [key, info] of Object.entries(found)) {
    try {
      await page.goto(`${BASE}/courses?busstop=${info.busstop}`, {
        waitUntil: 'networkidle', timeout: 60000,
      });
      const courses = await page.evaluate(() => [...document.querySelectorAll('a[href*="course-sequence"]')].map(a => ({
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
      })));
      const route4 = courses.filter(c => /(^|\s)4\s|\[4\]|富岡/.test(c.text));
      report.inbound[key] = { ...info, courses: route4, triedTrips: [] };

      for (const course of route4) {
        await page.goto(absolute(course.href), { waitUntil: 'networkidle', timeout: 90000 });
        const trips = await page.evaluate(() => [...document.querySelectorAll('a[href*="/stops?"]')].map(a => ({
          href: a.getAttribute('href'),
          cell: (a.closest('td,li,div') || a.parentElement).innerText.replace(/\s+/g, ' ').trim(),
        })));
        for (const trip of trips) {
          const url = absolute(trip.href);
          await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
          const stopNames = namesFromText(await page.locator('body').innerText());
          report.inbound[key].triedTrips.push({ url, stopNames });
          if (stopNames.length >= 2 && isRequestedRoute(key, stopNames)) {
            report.inbound[key].sample = { url, course, stopNames, stopCount: stopNames.length };
            console.log('CONFIRMED', key, stopNames.join(' → '));
            break;
          }
        }
        if (report.inbound[key].sample) break;
      }
      if (!report.inbound[key].sample) report.unresolved.push(key);
    } catch (error) {
      report.inbound[key].error = String(error.message || error);
      report.unresolved.push(key);
    }
  }

  for (const key of targets.values()) if (!found[key]) report.unresolved.push(key);
  fs.writeFileSync(path.join(OUT, '_navi_inbound_confirmed.json'), JSON.stringify(report, null, 2));
  if (Object.values(report.inbound).every(item => item.sample)) {
    const official = {
      source: 'Keisei Bus Navi trip stop lists',
      scrapedAt: report.scrapedAt,
      systems: Object.fromEntries(Object.entries(report.inbound).map(([key, item]) => [
        key, { busstop: item.busstop, sourceUrl: item.sample.url, stops: item.sample.stopNames },
      ])),
    };
    fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(official, null, 2));
  }
  await browser.close();
}
main().catch(error => { console.error(error); process.exit(1); });
