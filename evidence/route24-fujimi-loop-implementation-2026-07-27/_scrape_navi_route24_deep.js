'use strict';
/**
 * Deep pass: open EVERY 通過時刻表 (/stops?) link on route-24 course timetables.
 * 新浦安駅 berth 24: 0008200304 富士見循環.
 *
 * Input:  _navi_scrape_raw.json
 * Output: _navi_deep_raw.json (+ _navi_deep_partial.json)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const RAW_IN = path.join(OUT_DIR, '_navi_scrape_raw.json');
const OUT_PATH = path.join(OUT_DIR, '_navi_deep_raw.json');
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_deep_partial.json');

const ROUTE_NUM = '24';
const SIBLING_ROUTES = ['3', '11', '14', '16', '17', '18', '20', '22', '23', '25', '38'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 45 * 60 * 1000;

const DATES = [
  { iso: '2026-07-27', label: 'weekday', time: '05:00' },
  { iso: '2026-08-01', label: 'saturday', time: '05:00' },
  { iso: '2026-08-02', label: 'sunday-holiday', time: '05:00' },
];

const startedAt = Date.now();
const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[24\]|【\s*24\s*系統\s*】|^24\s*\[24\]|富士見.*【\s*24\s*系統\s*】/.test(s);
};

function detectOtherRouteNumber(text) {
  const t = toAsciiDigits(String(text || ''));
  for (const n of SIBLING_ROUTES) {
    if (new RegExp(`\\[${n}\\]|【\\s*${n}\\s*系統\\s*】|^${n}\\s*\\[`).test(t)) return n;
  }
  const brackets = t.match(/\[(\d{1,2})\]/g);
  if (brackets) {
    for (const x of brackets) {
      const num = x.replace(/[[\]]/g, '');
      if (num !== ROUTE_NUM) return num;
    }
  }
  const sys = t.match(/【\s*(\d{1,2})\s*系統\s*】/);
  if (sys && sys[1] !== ROUTE_NUM) return sys[1];
  return null;
}

function withDatetime(url, dayIso, timeHHMM) {
  try {
    const u = new URL(absUrl(url));
    u.searchParams.set('datetime', `${dayIso}T${timeHHMM || '05:00'}`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function tripDedupeKey(href) {
  try {
    const u = new URL(absUrl(href));
    const keep = ['course', 'course-sequence', 'departure-busstop', 'destination-busstop', 'start', 'node', 'index', 'trip'];
    const next = new URL(u.origin + u.pathname);
    for (const k of keep) if (u.searchParams.has(k)) next.searchParams.set(k, u.searchParams.get(k));
    return [...next.searchParams.keys()].length ? next.toString() : u.origin + u.pathname;
  } catch (_) {
    return String(href).replace(/datetime=[^&]+/, '');
  }
}

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

const sigOf = (names) => (names || []).join('>');

function orderedBusstopSeq(links) {
  const seq = [];
  for (const b of links || []) {
    if (!b?.id) continue;
    if (seq.length && seq[seq.length - 1].id === b.id) continue;
    seq.push(b);
  }
  return seq;
}

function pairStopIds(stopNames, busstopLinks) {
  const names = stopNames || [];
  const seq = orderedBusstopSeq(busstopLinks);
  const ids = [];
  const platforms = [];
  if (seq.length === names.length && names.length > 0) {
    for (let i = 0; i < names.length; i++) {
      ids.push(seq[i].id || null);
      platforms.push(seq[i].platform || null);
    }
  } else {
    const used = new Set();
    for (const name of names) {
      let found = null;
      for (let i = 0; i < (busstopLinks || []).length; i++) {
        if (used.has(i)) continue;
        const b = busstopLinks[i];
        const text = (b.text || '').replace(/\s+/g, ' ').trim();
        if (!text || /系統・時刻表|時刻表一覧|のりば一覧/.test(text)) continue;
        if (text === name || text.includes(name) || name.includes(text)) { found = b; used.add(i); break; }
      }
      ids.push(found?.id || null);
      platforms.push(found?.platform || null);
    }
  }
  return { stopIds: ids, platformIds: platforms, idComplete: ids.length > 0 && ids.every(Boolean) };
}

async function scrapeTrip(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(450);
  const data = await page.evaluate(() => {
    const body = document.body.innerText;
    const h = document.querySelector('h1, h2');
    const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/busstop=(\d+)/);
      const plat = href.match(/platform=(\d+)/);
      return {
        id: m && m[1],
        platform: plat && plat[1],
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
        href,
      };
    });
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
    });
    return {
      title: document.title,
      heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim() : '',
      body,
      busstopLinks,
      legend,
    };
  });
  const stops = parseStopSequence(data.body);
  const stopNames = uniqueNames(stops);
  const { stopIds, platformIds, idComplete } = pairStopIds(stopNames, data.busstopLinks);
  return {
    url,
    title: data.title,
    heading: data.heading,
    legend: data.legend,
    stops,
    stopNames,
    stopIds,
    platformIds,
    idComplete,
    signature: sigOf(stopNames),
    otherRoute: detectOtherRouteNumber(data.heading + data.legend.join(' ')),
    has24Mark: hasRouteMark(data.heading + data.legend.join(' ')),
  };
}

async function collectTripLinks(page, timetableUrl, day) {
  const url = withDatetime(timetableUrl, day.iso, day.time);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(900);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/stops"]')]
      .map((a) => ({
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((l) => l.href && /\/stops/.test(l.href)));
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const abs = absUrl(l.href);
    const key = tripDedupeKey(abs);
    if (!abs || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...l, absHref: abs, dedupeKey: key });
  }
  return { url, day: day.label, tripLinkCount: out.length, tripLinks: out };
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_IN, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  const report = {
    scrapedAt: new Date().toISOString(),
    routeNumber: ROUTE_NUM,
    lineName: '富士見循環線',
    courses: {},
    trips: [],
    signatures: {},
    errors: [],
  };

  try {
    const courseUrls = new Set();
    for (const term of Object.values(raw.terminals || {})) {
      for (const l of term.route24 || []) {
        if (l.absHref) courseUrls.add(l.absHref);
      }
    }
    // Known course from prior probes
    courseUrls.add(`${BASE}/courses/timetables?busstop=00020619&course-sequence=0008200304-1`);

    console.log('course urls', courseUrls.size);
    for (const courseUrl of courseUrls) {
      if (pastHardTimeout()) break;
      const courseKey = (() => {
        try {
          const u = new URL(courseUrl);
          return u.searchParams.get('course-sequence') || u.searchParams.get('course') || courseUrl;
        } catch (_) { return courseUrl; }
      })();
      report.courses[courseKey] = { courseUrl, timetables: [] };
      for (const day of DATES) {
        if (pastHardTimeout()) break;
        console.log('TIMETABLE', courseKey, day.label);
        const tt = await collectTripLinks(page, courseUrl, day);
        report.courses[courseKey].timetables.push(tt);
        for (const tl of tt.tripLinks) {
          if (pastHardTimeout()) break;
          try {
            const trip = await scrapeTrip(page, tl.absHref);
            report.trips.push({ ...trip, courseKey, day: day.label, timetableUrl: tt.url });
            const sig = trip.signature;
            if (!report.signatures[sig]) {
              report.signatures[sig] = {
                stopNames: trip.stopNames,
                stopIds: trip.stopIds,
                count: 0,
                sampleUrls: [],
                legends: new Set(),
              };
            }
            report.signatures[sig].count += 1;
            if (report.signatures[sig].sampleUrls.length < 3) report.signatures[sig].sampleUrls.push(trip.url);
            for (const lg of trip.legend || []) report.signatures[sig].legends.add(lg);
          } catch (e) {
            report.errors.push({ url: tl.absHref, error: String(e.message || e) });
          }
        }
        fs.writeFileSync(PARTIAL_PATH, JSON.stringify(report, (k, v) => (v instanceof Set ? [...v] : v), 2), 'utf8');
      }
    }

    for (const sig of Object.values(report.signatures)) {
      if (sig.legends instanceof Set) sig.legends = [...sig.legends];
    }
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(PARTIAL_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log('DONE signatures', Object.keys(report.signatures).length, 'trips', report.trips.length);
    for (const [sig, meta] of Object.entries(report.signatures)) {
      console.log(`  ${meta.count}x | ${meta.stopNames.length} stops | ${meta.stopNames.join(' > ')}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
