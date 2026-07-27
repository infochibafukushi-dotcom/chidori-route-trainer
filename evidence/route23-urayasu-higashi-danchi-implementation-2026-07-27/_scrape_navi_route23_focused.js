'use strict';
/** Focused deep scrape: only the 4 route-23 course timetables from _navi_scrape_raw.json */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const RAW = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const OUT_PATH = path.join(OUT, '_navi_deep_raw.json');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const ROUTE_NUM = '23';

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

async function scrapeTrip(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(450);
  const data = await page.evaluate(() => ({
    body: document.body.innerText,
    href: location.href,
    title: document.title,
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
  return { url, title: data.title, stops, stopNames, course, departureBusstopId, bodySnippet: data.body.slice(0, 2000) };
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
    return { legend, tripLinks, bodySnippet: body.slice(0, 4000) };
  });
}

function courseJobsFromRaw() {
  const jobs = [];
  for (const [termKey, data] of Object.entries(RAW.terminals || {})) {
    for (const c of data.route23 || []) {
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
    lineName: '浦安東団地線',
    note: 'Focused scrape of 4 route-23 course timetables only.',
    courses: jobs,
    timetables: [],
    signatures: {},
    trips: [],
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
      if (opened >= 8) break;
      const abs = absUrl(link.href);
      if (!abs || seenTrip.has(abs)) continue;
      seenTrip.add(abs);
      const trip = await scrapeTrip(page, abs);
      const sigKey = trip.stopNames.join('>');
      if (!sigKey || seenSig.has(sigKey)) continue;
      seenSig.add(sigKey);
      opened++;
      const entry = {
        stopNames: trip.stopNames,
        stopCount: trip.stopNames.length,
        count: 1,
        courses: trip.course ? [trip.course] : [],
        berths: [job.berth],
        sampleUrls: [trip.url],
        cellTexts: [cellSymbol(link.cellText)],
        terminal: job.terminal,
      };
      report.signatures[sigKey] = entry;
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

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('done', Object.keys(report.signatures).length, 'signatures');
}

main().catch((e) => { console.error(e); process.exit(1); });
