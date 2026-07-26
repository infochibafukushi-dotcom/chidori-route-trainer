'use strict';
/**
 * Deep pass: open EVERY 通過時刻表 (/stops?) link on the two route-14 course timetables
 * across weekday / saturday / sunday, so 千鳥車庫行 variants (last trips of the day)
 * cannot be missed by sampling.
 *
 * Also discovers the 千鳥車庫 busstop id from accepted trips and scans its course list
 * for any [14] departures (千鳥車庫⇒新浦安駅).
 *
 * Input:  _navi_scrape_raw.json (course hrefs)
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

const ROUTE_NUM = '14';
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
const hasRoute14Mark = (t) => /\[14\]|【\s*14\s*系統\s*】/.test(toAsciiDigits(String(t || '')));

function detectOtherRouteNumber(text) {
  const t = toAsciiDigits(String(text || ''));
  const brackets = t.match(/\[(\d{1,2})\]/g);
  if (brackets) {
    for (const x of brackets) {
      const n = x.replace(/[[\]]/g, '');
      if (n !== ROUTE_NUM) return n;
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
      const plat = (href.match(/platform=([^&]+)/) || [])[1]
        || (a.closest('tr,li,div')?.innerText || '').match(/のりば\s*([A-Z0-9]+)/)?.[1] || null;
      return { text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), href, id: (href.match(/busstop=(\d+)/) || [])[1] || null, platform: plat };
    });
    return { title: document.title, heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null, body, busstopLinks, href: location.href };
  });
  const stops = parseStopSequence(data.body);
  const stopNames = uniqueNames(stops);
  const sysHit = (toAsciiDigits(data.body).match(/【\s*(\d{1,2})\s*系統\s*】/) || [])[1] || null;
  let course = null; let courseSequence = null; let departureBusstopId = null; let destinationBusstopId = null;
  try {
    const u = new URL(data.href || url);
    course = u.searchParams.get('course');
    courseSequence = u.searchParams.get('course-sequence');
    departureBusstopId = u.searchParams.get('departure-busstop') || u.searchParams.get('busstop');
    destinationBusstopId = u.searchParams.get('destination-busstop');
  } catch (_) {}
  return {
    url, title: data.title, heading: data.heading, bodySnippet: data.body.slice(0, 3000),
    stops, stopNames, busstopLinks: data.busstopLinks, systemNumberHint: sysHit || (hasRoute14Mark(data.body) ? ROUTE_NUM : null),
    course, courseSequence, departureBusstopId, destinationBusstopId,
  };
}

async function collectTripLinks(page, timetableUrl) {
  await page.goto(timetableUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
      if (/\[\d{1,2}\]/.test(t) && !legend.includes(t)) legend.push(t);
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由|車庫/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const cell = a.closest('td, li, div') || a.parentElement;
      return {
        href,
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
        cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 180),
      };
    });
    return { legend: [...new Set(legend)].slice(0, 80), tripLinks, bodySnippet: body.slice(0, 8000) };
  });
}

async function listCourses(page, busstopId) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({
    title: document.title,
    heading: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    links: [...document.querySelectorAll('a[href*="course-sequence"], a[href*="course="]')].map((a) => {
      const tr = a.closest('tr');
      const cell = tr && tr.querySelector('th, td');
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null,
      };
    }),
  }));
  const seen = new Set();
  const all = [];
  for (const c of info.links) {
    const abs = absUrl(c.href);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    all.push({ ...c, absHref: abs });
  }
  return { busstopId, coursesUrl, ...info, all, route14: all.filter((l) => hasRoute14Mark(l.text)) };
}

const out = {
  scrapedAt: new Date().toISOString(),
  source: BASE,
  routeNumber: ROUTE_NUM,
  lineName: '弁天・富岡線',
  note: 'Exhaustive per-course trip enumeration. Every /stops? link on each route-14 course timetable is opened.',
  courses: [],
  timetables: [],
  signatures: {},
  trips: [],
  rejected: [],
  discoveredBusstopIds: {},
  chidoriGarage: null,
  errors: [],
  stats: {},
};

function flush(reason) {
  out.stats = {
    uniqueSignatures: Object.keys(out.signatures).length,
    tripsOpened: out.trips.length,
    rejected: out.rejected.length,
    errors: out.errors.length,
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
  };
  out.partialReason = reason;
  fs.writeFileSync(PARTIAL_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('CHECKPOINT', reason, JSON.stringify(out.stats));
}

function recordSignature(trip, link, ttMeta) {
  const s = sigOf(trip.stopNames);
  if (!out.signatures[s]) {
    out.signatures[s] = {
      stopNames: trip.stopNames,
      stopCount: trip.stopNames.length,
      stopIds: trip.stopIds,
      platformIds: trip.platformIds,
      idComplete: trip.idComplete,
      count: 0,
      courses: [],
      berths: [],
      dayLabels: [],
      departureTimes: [],
      sampleUrls: [],
      terminal: ttMeta.terminal,
      cellTexts: [],
    };
  }
  const sig = out.signatures[s];
  sig.count += 1;
  if (trip.course && !sig.courses.includes(trip.course)) sig.courses.push(trip.course);
  if (ttMeta.berth && !sig.berths.includes(ttMeta.berth)) sig.berths.push(ttMeta.berth);
  if (ttMeta.dayLabel && !sig.dayLabels.includes(ttMeta.dayLabel)) sig.dayLabels.push(ttMeta.dayLabel);
  if (sig.sampleUrls.length < 6) sig.sampleUrls.push(link.absHref);
  const t = (trip.stops[0] || {}).time;
  if (t && !sig.departureTimes.includes(t)) sig.departureTimes.push(t);
  if (link.cellText && sig.cellTexts.length < 6 && !sig.cellTexts.includes(link.cellText)) sig.cellTexts.push(link.cellText);
}

async function processTimetable(page, ttMeta) {
  let meta;
  try {
    meta = await collectTripLinks(page, ttMeta.url);
  } catch (e) {
    out.errors.push({ url: ttMeta.url, error: String(e.message || e) });
    return;
  }
  const links = [];
  const seen = new Set();
  for (const l of meta.tripLinks) {
    const abs = absUrl(l.href);
    if (!abs) continue;
    const key = tripDedupeKey(l.href);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ ...l, absHref: abs, dedupeKey: key });
  }
  out.timetables.push({
    ...ttMeta, legend: meta.legend, tripLinkCount: links.length,
  });
  console.log('TT', ttMeta.terminal, ttMeta.dayLabel, 'links', links.length);

  for (let i = 0; i < links.length; i++) {
    if (pastHardTimeout()) { console.log('HARD_TIMEOUT'); return; }
    const link = links[i];
    if (globalSeenTrip.has(link.dedupeKey)) continue;
    globalSeenTrip.add(link.dedupeKey);

    const otherRoute = detectOtherRouteNumber(link.cellText);
    if (otherRoute && !hasRoute14Mark(link.cellText)) {
      out.rejected.push({ url: link.absHref, cellText: link.cellText, reason: `cell-route-${otherRoute}` });
      continue;
    }

    let raw;
    try {
      raw = await scrapeTrip(page, link.absHref);
    } catch (e) {
      out.errors.push({ url: link.absHref, error: String(e.message || e) });
      continue;
    }
    if (!raw.stopNames.length || raw.stopNames.length < 2) {
      out.errors.push({ url: link.absHref, error: 'too-few-stops' });
      continue;
    }
    if (raw.systemNumberHint && raw.systemNumberHint !== ROUTE_NUM) {
      out.rejected.push({ url: link.absHref, cellText: link.cellText, reason: `sys-${raw.systemNumberHint}`, stopNames: raw.stopNames });
      continue;
    }
    const confirmed = raw.systemNumberHint === ROUTE_NUM || hasRoute14Mark(link.cellText)
      || hasRoute14Mark(raw.heading) || hasRoute14Mark(raw.title) || hasRoute14Mark(raw.bodySnippet)
      || hasRoute14Mark(ttMeta.courseText);
    if (!confirmed) {
      out.rejected.push({ url: link.absHref, cellText: link.cellText, reason: 'no-14-evidence', stopNames: raw.stopNames });
      continue;
    }

    const paired = pairStopIds(raw.stopNames, raw.busstopLinks);
    const trip = { ...raw, ...paired, dayLabel: ttMeta.dayLabel, terminal: ttMeta.terminal, berth: ttMeta.berth };
    const s = sigOf(trip.stopNames);
    const isNew = !out.signatures[s];
    recordSignature(trip, link, ttMeta);
    if (isNew) {
      out.trips.push({
        sampleUrl: link.absHref, cellText: link.cellText, courseText: ttMeta.courseText,
        heading: trip.heading, title: trip.title, course: trip.course, courseSequence: trip.courseSequence,
        departureBusstopId: trip.departureBusstopId, destinationBusstopId: trip.destinationBusstopId,
        dayLabel: ttMeta.dayLabel, terminal: ttMeta.terminal, berth: ttMeta.berth,
        stopNames: trip.stopNames, stopIds: trip.stopIds, platformIds: trip.platformIds,
        idComplete: trip.idComplete, stops: trip.stops, legend: meta.legend,
      });
      console.log('NEW SIG', trip.stopNames.length, trip.stopNames[0], '->', trip.stopNames[trip.stopNames.length - 1], 'course', trip.course);
      flush('new-signature');
    }
    for (let k = 0; k < trip.stopNames.length; k++) {
      if (trip.stopIds[k]) out.discoveredBusstopIds[trip.stopNames[k]] = trip.stopIds[k];
    }
    if ((i + 1) % 15 === 0) flush(`progress-${ttMeta.dayLabel}-${i + 1}`);
  }
}

const globalSeenTrip = new Set();

async function main() {
  const prev = JSON.parse(fs.readFileSync(RAW_IN, 'utf8'));
  const courseJobs = [];
  for (const [key, term] of Object.entries(prev.terminals || {})) {
    for (const c of term.route14 || []) {
      courseJobs.push({ terminalKey: key, terminal: term.label, terminalId: term.busstopId, courseText: c.text, berth: c.berthLetter, absHref: c.absHref });
    }
  }
  out.courses = courseJobs;
  console.log('COURSE JOBS', courseJobs.length);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  try {
    for (const job of courseJobs) {
      for (const day of DATES) {
        if (pastHardTimeout()) break;
        await processTimetable(page, {
          terminal: job.terminal, terminalId: job.terminalId, berth: job.berth,
          courseText: job.courseText, dayLabel: day.label, dayIso: day.iso,
          url: withDatetime(job.absHref, day.iso, day.time),
        });
        flush(`after-${job.terminal}-${day.label}`);
      }
    }

    // 千鳥車庫 follow-up: does route 14 depart from the garage on the public timetable?
    const garageId = out.discoveredBusstopIds['千鳥車庫'] || null;
    out.chidoriGarage = { busstopId: garageId, courses: null, route14Courses: null, note: null };
    if (garageId) {
      console.log('CHIDORI GARAGE busstop', garageId);
      const c = await listCourses(page, garageId);
      out.chidoriGarage.courses = c.all.map((x) => ({ text: x.text, berth: x.berth, absHref: x.absHref }));
      out.chidoriGarage.route14Courses = c.route14.map((x) => ({ text: x.text, berth: x.berth, absHref: x.absHref }));
      out.chidoriGarage.coursesUrl = c.coursesUrl;
      for (const course of c.route14) {
        for (const day of DATES) {
          if (pastHardTimeout()) break;
          await processTimetable(page, {
            terminal: '千鳥車庫', terminalId: garageId, berth: course.berth,
            courseText: course.text, dayLabel: day.label, dayIso: day.iso,
            url: withDatetime(course.absHref, day.iso, day.time),
          });
        }
      }
      if (!c.route14.length) out.chidoriGarage.note = '千鳥車庫発の[14]公開便は見つからず（回送の可能性）。';
    } else {
      out.chidoriGarage.note = '千鳥車庫が確定便の停留所として出現しなかった。';
    }
  } catch (e) {
    out.errors.push({ fatal: String(e.message || e) });
    console.error('FATAL', e);
  } finally {
    flush('final');
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
    await browser.close();
  }

  console.log('=== UNIQUE SIGNATURES ===');
  for (const [, v] of Object.entries(out.signatures)) {
    console.log(v.stopCount, 'stops | count', v.count, '| courses', v.courses.join(','), '| days', v.dayLabels.join(','));
    console.log('   ', v.stopNames.join(' > '));
  }
  console.log(JSON.stringify(out.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
