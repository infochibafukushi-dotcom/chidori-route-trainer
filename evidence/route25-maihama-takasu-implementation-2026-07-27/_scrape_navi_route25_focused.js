'use strict';
/** Focused deep scrape: route-25 course timetables from _navi_scrape_raw.json */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const RAW = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const OUT_PATH = path.join(OUT, '_navi_deep_raw.json');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const ROUTE_NUM = '25';

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

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

function cellSymbol(cellText) {
  const t = String(cellText || '').trim();
  const m = t.match(/^\d{1,2}\s*(.*)$/);
  return m ? m[1].trim() : t.slice(0, 20);
}

function hasRoute25Mark(t) {
  const s = toAscii(String(t || ''));
  return /\[25\]|【\s*25\s*系統\s*】|^25\s*\[25\]/.test(s);
}

async function scrapeTrip(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(450);
  const data = await page.evaluate(() => ({
    body: document.body.innerText,
    href: location.href,
    title: document.title,
    heading: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }));
  const stops = parseStopSequence(data.body);
  const stopNames = uniqueNames(stops);
  let course = null;
  let departureBusstopId = null;
  try {
    const u = new URL(data.href || url);
    course = u.searchParams.get('course');
    departureBusstopId = u.searchParams.get('departure-busstop') || u.searchParams.get('busstop');
  } catch (_) {}
  return { url, title: data.title, heading: data.heading, stops, stopNames, course, departureBusstopId, bodySnippet: data.body.slice(0, 2000) };
}

async function collectTripLinks(page, timetableUrl) {
  await page.goto(timetableUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
      if (/\[\d{1,2}\]/.test(t) && !legend.includes(t)) legend.push(t);
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const cell = a.closest('td, li, div') || a.parentElement;
      return {
        href,
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
        cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 120),
      };
    });
    return { legend: [...new Set(legend)].slice(0, 80), tripLinks, bodySnippet: body.slice(0, 4000) };
  });
}

function courseJobsFromRaw() {
  const jobs = [];
  for (const [termKey, data] of Object.entries(RAW.terminals || {})) {
    for (const c of data.route25 || []) {
      jobs.push({
        terminal: data.label || termKey,
        terminalId: data.busstopId,
        berth: c.berthLetter || c.berth,
        courseText: c.text,
        absHref: c.absHref,
      });
    }
  }
  return jobs;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'ja-JP' });
  const jobs = courseJobsFromRaw();
  const report = {
    scrapedAt: new Date().toISOString(),
    routeNumber: ROUTE_NUM,
    lineName: '舞浜・高洲線',
    note: 'Focused scrape of route-25 course timetables. Gate 【２５系統】 vs 10/15/18/19.',
    courses: jobs,
    timetables: [],
    signatures: {},
    trips: [],
    rejected: [],
    discoveredBusstopIds: { ...(RAW.knownIds || {}) },
  };

  const seenSig = new Set();
  for (const job of jobs) {
    const ttUrl = `${job.absHref}${job.absHref.includes('?') ? '&' : '?'}datetime=2026-07-27T05:00`;
    console.log('TT', job.terminal, job.berth, ttUrl.slice(0, 100));
    const info = await collectTripLinks(page, ttUrl);
    report.timetables.push({ ...job, url: ttUrl, legend: info.legend, tripLinkCount: info.tripLinks.length });

    const seenTrip = new Set();
    let opened = 0;
    for (const link of info.tripLinks) {
      if (opened >= 12) break;
      const abs = absUrl(link.href);
      if (!abs || seenTrip.has(abs)) continue;
      seenTrip.add(abs);

      const sym = cellSymbol(link.cellText);
      const is25Cell = hasRoute25Mark(link.cellText) || hasRoute25Mark(sym) || sym.includes('[25]');
      if (!is25Cell && job.terminal === '総合公園') {
        report.rejected.push({ url: abs, cellText: link.cellText, reason: 'mixed-cell-not-25' });
        continue;
      }

      const trip = await scrapeTrip(page, abs);
      if (!trip.stopNames.length) continue;
      const sigKey = trip.stopNames.join('>');
      if (!sigKey) continue;

      const isNew = !seenSig.has(sigKey);
      if (isNew) seenSig.add(sigKey);
      if (!report.signatures[sigKey]) {
        report.signatures[sigKey] = {
          stopNames: trip.stopNames,
          stopCount: trip.stopNames.length,
          count: 0,
          courses: [],
          berths: [],
          sampleUrls: [],
          cellTexts: [],
          terminal: job.terminal,
        };
      }
      const sig = report.signatures[sigKey];
      sig.count += 1;
      if (trip.course && !sig.courses.includes(trip.course)) sig.courses.push(trip.course);
      if (job.berth && !sig.berths.includes(job.berth)) sig.berths.push(job.berth);
      if (sig.sampleUrls.length < 6) sig.sampleUrls.push(trip.url);
      if (link.cellText && sig.cellTexts.length < 6) sig.cellTexts.push(link.cellText);

      if (isNew) {
        opened++;
        report.trips.push({
          ...trip,
          terminal: job.terminal,
          berth: job.berth,
          legend: info.legend,
          cellText: link.cellText,
          courseText: job.courseText,
        });
        console.log('SIG', trip.stopNames.length, trip.stopNames[0], '->', trip.stopNames[trip.stopNames.length - 1], 'course', trip.course);
      }
    }
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('done', Object.keys(report.signatures).length, 'signatures');
  for (const [k, v] of Object.entries(report.signatures)) {
    console.log(v.stopCount, v.stopNames[0], '->', v.stopNames[v.stopNames.length - 1]);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
