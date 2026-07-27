'use strict';
/** Deep scrape route-38 berth 38 timetable — express boarding stops + weekday/sat/sun signatures. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const RAW = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const OUT_PATH = path.join(OUT, '_navi_deep_raw.json');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const ROUTE_NUM = '38';

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

function hasRoute38Mark(t) {
  const s = toAscii(String(t || ''));
  return /\[38\]|【\s*38\s*系統\s*】|^38\s*\[38\]|ク…【\s*38\s*系統\s*】/.test(s);
}

function dayKindFromUrl(url) {
  const m = String(url).match(/datetime=([^&]+)/);
  if (!m) return 'unknown';
  const d = decodeURIComponent(m[1]).slice(0, 10);
  const dow = new Date(d + 'T12:00:00+09:00').getDay();
  if (dow === 0) return 'sun';
  if (dow === 6) return 'sat';
  return 'weekday';
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
  return {
    url, title: data.title, heading: data.heading, stops, stopNames,
    course, departureBusstopId,
    dayKind: dayKindFromUrl(data.href || url),
    bodySnippet: data.body.slice(0, 2500),
  };
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
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由|急行|直通/.test(t) && !legend.includes(t)) legend.push(t);
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
    for (const c of data.route38 || []) {
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
    lineName: '明海クオン線',
    note: 'Deep scrape berth 38 express. Gate 【３８系統】 symbol ク. Boarding stops only.',
    courses: jobs,
    timetables: [],
    signatures: {},
    trips: [],
    rejected: [],
    discoveredBusstopIds: { ...(RAW.knownIds || {}) },
  };

  const seenSig = new Set();
  const daySamples = { weekday: null, sat: null, sun: null };

  for (const job of jobs) {
    for (const dayParam of [
      { label: 'weekday', dt: '2026-07-27T05:00' },
      { label: 'sat', dt: '2026-08-01T05:00' },
      { label: 'sun', dt: '2026-08-02T05:00' },
    ]) {
      const ttUrl = `${job.absHref}${job.absHref.includes('?') ? '&' : '?'}datetime=${encodeURIComponent(dayParam.dt)}`;
      console.log('TT', dayParam.label, job.berth, ttUrl.slice(0, 110));
      const info = await collectTripLinks(page, ttUrl);
      report.timetables.push({ ...job, dayKind: dayParam.label, url: ttUrl, legend: info.legend, tripLinkCount: info.tripLinks.length });

      const seenTrip = new Set();
      let opened = 0;
      for (const link of info.tripLinks) {
        if (opened >= 8) break;
        const abs = absUrl(link.href);
        if (!abs || seenTrip.has(abs)) continue;
        seenTrip.add(abs);

        const sym = cellSymbol(link.cellText);
        const is38Cell = hasRoute38Mark(link.cellText) || hasRoute38Mark(sym) || sym.includes('[38]') || sym.includes('ク');
        if (!is38Cell) {
          report.rejected.push({ url: abs, cellText: link.cellText, reason: 'not-38-cell' });
          continue;
        }

        const trip = await scrapeTrip(page, abs);
        if (!trip.stopNames.length) continue;
        const sigKey = trip.stopNames.join('>');
        if (!seenSig.has(sigKey)) {
          seenSig.add(sigKey);
          report.signatures[sigKey] = {
            stopNames: trip.stopNames,
            stopCount: trip.stopNames.length,
            course: trip.course,
            sampleUrl: trip.url,
            dayKinds: [dayParam.label],
          };
        } else {
          const sig = report.signatures[sigKey];
          if (!sig.dayKinds.includes(dayParam.label)) sig.dayKinds.push(dayParam.label);
        }
        report.trips.push({ ...trip, terminal: job.terminal, berth: job.berth, dayKind: dayParam.label, cellText: link.cellText });
        if (!daySamples[dayParam.label]) daySamples[dayParam.label] = trip;
        opened += 1;
      }
    }
  }

  report.daySamples = daySamples;
  report.signatureCount = Object.keys(report.signatures).length;
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('signatures', report.signatureCount);
  for (const [k, v] of Object.entries(report.signatures)) {
    console.log(' ', v.stopCount, 'stops', v.dayKinds.join(','), '::', v.stopNames.join(' > '));
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
