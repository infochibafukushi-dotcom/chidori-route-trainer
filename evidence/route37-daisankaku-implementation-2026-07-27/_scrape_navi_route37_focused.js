'use strict';
/** Scrape all route-37 signatures via timetable trip links. Saves incrementally. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const RAW = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const OUT_PATH = path.join(OUT, '_navi_deep_raw.json');
const HOST = 'https://transfer-cloud.navitime.biz';

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

function normalizeStopName(n) {
  return String(n || '')
    .replace(/®/g, '')
    .replace(/（Ｒ）/g, '')
    .replace(/\(R\)/gi, '')
    .replace(/\s+/g, '')
    .trim();
}

function hasRoute37Mark(t) {
  const s = toAscii(String(t || ''));
  return /\[37\]|【\s*37\s*系統\s*】|^37\s*\[37\]/.test(s);
}

async function scrapeTrip(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(500);
  const data = await page.evaluate(() => ({
    body: document.body.innerText,
    href: location.href,
  }));
  const stops = parseStopSequence(data.body);
  const stopNames = uniqueNames(stops);
  let course = null;
  try {
    course = new URL(data.href || url).searchParams.get('course');
  } catch (_) {}
  const legend37 = /【\s*37\s*系統\s*】|\[37\]|大三角/.test(toAscii(data.body));
  return { url: data.href || url, stopNames, course, legend37, bodySnippet: data.body.slice(0, 1500) };
}

async function collectTripLinks(page, timetableUrl) {
  await page.goto(timetableUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由/.test(t) && !legend.includes(t)) legend.push(t);
    });
    return {
      legend: [...new Set(legend)].slice(0, 80),
      tripLinks: [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
        const href = a.getAttribute('href');
        const cell = a.closest('td, li, div') || a.parentElement;
        return {
          href,
          cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 120),
        };
      }),
    };
  });
  return info;
}

function courseJobsFromRaw() {
  const jobs = [];
  for (const [termKey, data] of Object.entries(RAW.terminals || {})) {
    for (const c of data.route37 || []) {
      jobs.push({
        terminal: data.label || termKey,
        terminalKey: termKey,
        terminalId: data.busstopId,
        berth: c.berthLetter || c.berth,
        courseText: c.text,
        absHref: c.absHref,
        mixedCell: (c.siblingsInCell || []).length > 0,
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
    routeNumber: '37',
    lineName: '大三角線',
    signatures: {},
    trips: [],
    rejected: [],
  };
  const seenSig = new Set();

  for (const job of jobs) {
    const ttUrl = `${job.absHref}${job.absHref.includes('?') ? '&' : '?'}datetime=2026-07-27T05:00`;
    console.log('TT', job.terminal, job.berth);
    let info;
    try {
      info = await collectTripLinks(page, ttUrl);
    } catch (e) {
      report.rejected.push({ job, reason: 'timetable-fail', error: String(e.message) });
      continue;
    }

    const seenTrip = new Set();
    let opened = 0;
    for (const link of info.tripLinks) {
      if (opened >= 12) break;
      const abs = absUrl(link.href);
      if (!abs || seenTrip.has(abs)) continue;
      seenTrip.add(abs);

      if (job.mixedCell && !hasRoute37Mark(link.cellText)) {
        report.rejected.push({ url: abs, cellText: link.cellText, reason: 'mixed-not-37-symbol' });
        continue;
      }

      try {
        const trip = await scrapeTrip(page, abs);
        if (!trip.stopNames.length) continue;
        if (job.mixedCell && !trip.legend37) {
          report.rejected.push({ url: abs, cellText: link.cellText, reason: 'mixed-trip-not-37-legend' });
          continue;
        }

        const sigKey = trip.stopNames.map(normalizeStopName).join('>');
        if (!sigKey) continue;
        const displayKey = trip.stopNames.join('>');

        if (!report.signatures[sigKey]) {
          report.signatures[sigKey] = {
            stopNames: trip.stopNames,
            normalizedKey: sigKey,
            stopCount: trip.stopNames.length,
            count: 0,
            courses: [],
            terminals: [],
            berths: [],
            sampleUrls: [],
          };
        }
        const sig = report.signatures[sigKey];
        sig.count += 1;
        if (trip.course && !sig.courses.includes(trip.course)) sig.courses.push(trip.course);
        if (!sig.terminals.includes(job.terminal)) sig.terminals.push(job.terminal);
        if (job.berth && !sig.berths.includes(String(job.berth))) sig.berths.push(String(job.berth));
        if (sig.sampleUrls.length < 4) sig.sampleUrls.push(trip.url);

        if (!seenSig.has(sigKey)) {
          seenSig.add(sigKey);
          opened++;
          report.trips.push({
            ...trip,
            terminal: job.terminal,
            terminalKey: job.terminalKey,
            berth: job.berth,
            courseText: job.courseText,
            cellText: link.cellText,
            legend: info.legend,
            mixedCell: job.mixedCell,
          });
          console.log('SIG', trip.stopNames.length, trip.stopNames[0], '->', trip.stopNames[trip.stopNames.length - 1], 'course', trip.course);
        }
        await page.waitForTimeout(400);
      } catch (e) {
        report.rejected.push({ url: abs, reason: 'trip-fail', error: String(e.message) });
      }
    }
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('done', Object.keys(report.signatures).length, 'signatures');
  for (const sig of Object.values(report.signatures)) {
    console.log(sig.stopCount, sig.stopNames[0], '->', sig.stopNames[sig.stopNames.length - 1], 'courses', sig.courses.join(','));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
