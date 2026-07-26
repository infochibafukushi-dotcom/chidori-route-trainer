'use strict';
/**
 * Keisei Bus Navi (東京ベイシティ交通 included) audit scrape for 系統16 日の出線 (route-16).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent a stop order. Only accept sequences read from 個別便通過時刻表 (/stops?).
 *  - Require [16] / 【１６系統】 evidence on the trip page before accepting.
 *  - ★ 16 と 17 の分離が最重要。17系統（日の出東経由）も 日の出七丁目 発着で、
 *    新浦安駅のりばCに 16/17 が混載される。ここでは候補として拾い、系統確定は
 *    _verify_signatures.js の凡例ゲート（符号→【Ｎ系統】）で行う。
 *
 * Output: _navi_scrape_raw.json (+ _navi_scrape_partial.json checkpoints)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const ROUTE_NUM = '16';
const SIBLING_ROUTE = '17'; // 日の出東経由。同じ 日の出七丁目 行きだが別系統。
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 40 * 60 * 1000;
const CHECKPOINT_EVERY = 5;
const PER_TT_CAP = 14;
const UNIQUE_SIG_CAP = 40;

const KNOWN_IDS = {
  shinurayasu: '00020619', // 新浦安駅
};

const SEARCH_WORDS = [
  '新浦安駅', '日の出七丁目', 'プラウド新浦安パークマリーナ', 'ベイシティ浦安',
  '海風の街', '順天堂大学', '日の出中学校', '明海大学前', '日の出西', '入船中央エステート',
];

const SAMPLE_DATES = [
  { iso: '2026-07-27', label: 'weekday', time: '08:00' },
  { iso: '2026-07-27', label: 'weekday-midday', time: '13:00' },
  { iso: '2026-07-27', label: 'weekday-evening', time: '19:00' },
  { iso: '2026-08-01', label: 'saturday', time: '10:00' },
  { iso: '2026-08-02', label: 'sunday-holiday', time: '10:00' },
];

const startedAt = Date.now();
let report = null;
let flushing = false;

function pastHardTimeout() {
  return Date.now() - startedAt > HARD_TIMEOUT_MS;
}

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return HOST + href;
}

function withDatetime(url, dayIso, timeHHMM) {
  if (!url || !dayIso) return url;
  try {
    const u = new URL(absUrl(url));
    u.searchParams.set('datetime', `${dayIso}T${timeHHMM || '12:00'}`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function tripDedupeKey(href) {
  if (!href) return '';
  try {
    const u = new URL(absUrl(href));
    const keep = ['course', 'course-sequence', 'departure-busstop', 'destination-busstop', 'start', 'node', 'index', 'trip'];
    const next = new URL(u.origin + u.pathname);
    for (const k of keep) {
      if (u.searchParams.has(k)) next.searchParams.set(k, u.searchParams.get(k));
    }
    if (![...next.searchParams.keys()].length) return u.origin + u.pathname;
    return next.toString();
  } catch (_) {
    return String(href).replace(/datetime=[^&]+/, '');
  }
}

function toAsciiDigits(s) {
  return String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
}

function hasRouteMark(text) {
  const t = toAsciiDigits(String(text || ''));
  return /\[16\]|【\s*16\s*系統\s*】/.test(t);
}

function hasSiblingMark(text) {
  const t = toAsciiDigits(String(text || ''));
  return /\[17\]|【\s*17\s*系統\s*】/.test(t);
}

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

function parseStopSequence(bodyText) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(bodyText)) !== null) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表一覧|通過時刻表|ページの先頭/.test(name)) continue;
    stops.push({ time: m[1], kind: m[2], name });
  }
  if (stops.length === 0) {
    const compact = bodyText.replace(/\s+/g, ' ');
    const re2 = /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
    while ((m = re2.exec(compact)) !== null) {
      const name = m[3].replace(/系統.*$/, '').trim();
      if (name && name.length < 50) stops.push({ time: m[1], kind: m[2], name });
    }
  }
  return stops;
}

function uniqueNames(stops) {
  const names = [];
  for (const s of stops) {
    if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  }
  return names;
}

function normalizeStopName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function normalizeStopNames(names) {
  return (names || []).map(normalizeStopName);
}

function stopNamesSignature(stopNames) {
  return normalizeStopNames(stopNames).join('>');
}

function orderedBusstopSeq(busstopLinks) {
  const seq = [];
  for (const b of busstopLinks || []) {
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
        const text = normalizeStopName(b.text || '');
        if (!text || /系統・時刻表|時刻表一覧|のりば一覧/.test(text)) continue;
        if (text === name || text.includes(name) || name.includes(text.replace(/\s*系統.*$/, ''))) {
          found = b;
          used.add(i);
          break;
        }
      }
      ids.push(found?.id || null);
      platforms.push(found?.platform || null);
    }
  }
  const complete = ids.length > 0 && ids.every((id) => !!id);
  return { stopIds: ids, platformIds: platforms, idComplete: complete };
}

function buildTripSignature(trip) {
  const dep = trip.departureBusstopId || trip.stopIds?.[0] || '';
  const dest = trip.destinationBusstopId || trip.stopIds?.[trip.stopIds.length - 1] || '';
  if (trip.idComplete && trip.stopIds?.length) {
    return [ROUTE_NUM, dep, dest, trip.stopIds.join('>'), (trip.platformIds || []).map((p) => p || '').join('>'), 'regular'].join('|');
  }
  return [
    ROUTE_NUM,
    dep || trip.stopNames?.[0] || '',
    dest || trip.stopNames?.[trip.stopNames.length - 1] || '',
    (trip.stopNames || []).join('>'),
    'regular',
    'name-fallback',
  ].join('|');
}

function romajiKeyFromName(name) {
  const n = normalizeStopName(name);
  if (/新浦安駅/.test(n)) return 'shinurayasu';
  if (/日の出七丁目/.test(n)) return 'hinode-nanachome';
  if (/日の出西/.test(n)) return 'hinode-nishi';
  if (/日の出中学校/.test(n)) return 'hinode-chugakko';
  if (/日の出南小学校/.test(n)) return 'hinode-minami-shogakko';
  if (/日の出東/.test(n)) return 'hinode-higashi';
  if (/プラウド新浦安パークマリーナ/.test(n)) return 'proud-park-marina';
  if (/ベイシティ浦安/.test(n)) return 'baycity-urayasu';
  if (/海風の街/.test(n)) return 'umikaze-no-machi';
  if (/順天堂大学/.test(n)) return 'juntendo-hinode-seimon';
  if (/明海大学前/.test(n)) return 'meikai-daigaku-mae';
  if (/入船中央エステート/.test(n)) return 'irifune-chuo-estate';
  return n.replace(/[^\u3040-\u30ff\u4e00-\u9fffa-zA-Z0-9]+/g, '-').slice(0, 24) || 'unknown';
}

function proposeSystemKey(trip) {
  const first = trip.stopNames?.[0] || '';
  const last = trip.stopNames?.[trip.stopNames.length - 1] || '';
  return `${ROUTE_NUM}-${romajiKeyFromName(first)}-to-${romajiKeyFromName(last)}`;
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      await page.waitForTimeout(900);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            return { id: m && m[1], text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100), href };
          })
          .filter((x) => x.id));
      if (hits.length) return { searchUrl: u, word, hits };
    } catch (_) {}
  }
  return { searchUrl: null, word, hits: [] };
}

async function listCourses(page, busstopId, label) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(1400);
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    h: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
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
  for (const c of pageInfo.links) {
    const abs = absUrl(c.href);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    const berthLetter = (() => {
      const t = String(c.berth || '').replace(/\s*地図\s*/g, ' ').trim();
      const m = t.match(/\b([A-Z]|0?\d{1,2})\b/);
      return m ? m[1] : t.slice(0, 20) || null;
    })();
    all.push({ ...c, absHref: abs, berthLetter, hasSibling17: hasSiblingMark(c.text) });
  }
  const routeMatches = all.filter((l) => hasRouteMark(l.text));
  const siblingOnly = all.filter((l) => hasSiblingMark(l.text) && !hasRouteMark(l.text));
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all, route16: routeMatches, route17Only: siblingOnly,
  };
}

async function scrapeTrip(page, url, meta) {
  const out = {
    url, meta, stops: [], stopNames: [], heading: null, title: null, bodySnippet: null,
    busstopLinks: [], systemNumberHint: null, departureBusstopId: null, destinationBusstopId: null,
    course: null, courseSequence: null, errors: [],
  };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await page.waitForTimeout(650);
    const data = await page.evaluate(() => {
      const body = document.body.innerText;
      const h = document.querySelector('h1, h2');
      const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => {
        const href = a.getAttribute('href') || '';
        const plat = (href.match(/platform=([^&]+)/) || [])[1]
          || (a.closest('tr,li,div')?.innerText || '').match(/のりば\s*([A-Z0-9]+)/)?.[1] || null;
        return {
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href,
          id: (href.match(/busstop=(\d+)/) || [])[1] || null,
          platform: plat,
        };
      });
      return { title: document.title, heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null, body, busstopLinks, href: location.href };
    });
    out.heading = data.heading;
    out.title = data.title;
    out.stops = parseStopSequence(data.body);
    out.stopNames = normalizeStopNames(uniqueNames(out.stops));
    out.bodySnippet = data.body.slice(0, 4000);
    out.busstopLinks = data.busstopLinks;
    const sys = (toAsciiDigits(data.body).match(/【\s*(\d{1,2})\s*系統\s*】/) || [])[1];
    out.systemNumberHint = sys || null;
    if (!out.systemNumberHint && hasRouteMark(data.body)) out.systemNumberHint = ROUTE_NUM;
    try {
      const u = new URL(data.href || url);
      out.departureBusstopId = u.searchParams.get('departure-busstop') || u.searchParams.get('busstop');
      out.destinationBusstopId = u.searchParams.get('destination-busstop');
      out.course = u.searchParams.get('course');
      out.courseSequence = u.searchParams.get('course-sequence');
    } catch (_) {}
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function collectTimetableTripLinks(page, timetableUrl, label, dayLabel) {
  const result = { label, dayLabel, timetableUrl, legend: [], tripLinks: [], bodySnippet: null, errors: [] };
  try {
    await page.goto(timetableUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await page.waitForTimeout(1100);
    const meta = await page.evaluate(() => {
      const body = document.body.innerText;
      const legend = [];
      body.split(/\n/).forEach((line) => {
        const t = line.trim();
        if (!t) return;
        if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
        if (/\[\d{1,2}\]/.test(t) && !legend.includes(t)) legend.push(t);
        if ((/…|･･･|\.\.\./.test(t)) && /系統|行き|止まり|経由/.test(t) && !legend.includes(t)) legend.push(t);
      });
      const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
        const href = a.getAttribute('href');
        const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const cell = a.closest('td, li, div') || a.parentElement;
        const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
        return { href, text, cellText: cellText.slice(0, 180) };
      });
      return { legend: [...new Set(legend)].slice(0, 60), tripLinks, bodySnippet: body.slice(0, 6000) };
    });
    result.legend = meta.legend;
    result.bodySnippet = meta.bodySnippet;
    const seen = new Set();
    result.tripLinks = meta.tripLinks
      .map((l) => ({ ...l, absHref: absUrl(l.href), dedupeKey: tripDedupeKey(l.href), otherRoute: detectOtherRouteNumber(l.cellText) }))
      .filter((l) => {
        if (!l.absHref) return false;
        if (seen.has(l.dedupeKey)) return false;
        seen.add(l.dedupeKey);
        return true;
      });
  } catch (e) {
    result.errors.push(String(e.message || e));
  }
  return result;
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    routeNumber: ROUTE_NUM,
    siblingRouteNumber: SIBLING_ROUTE,
    lineName: '日の出線',
    note: 'Route 16 discovery pass. 新浦安駅のりばCは[16]/[17]混載（どちらも日の出七丁目行）のため凡例ゲートを後段で必須とする。',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    timetables: [],
    trips: [],
    unconfirmedTrips: [],
    rejected: { rejectedOther: [] },
    tripSignatures: {},
    stopNameSignaturesSeen: {},
    berthsSeen: [],
    errors: [],
    stats: {},
    phases: [],
  };
}

function writeJsonUtf8(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
}

function computeStats(r) {
  return {
    tripsConfirmed: r.trips.length,
    uniqueSignatures: Object.keys(r.tripSignatures).length,
    uniqueStopNameSignatures: Object.keys(r.stopNameSignaturesSeen).length,
    unconfirmed: r.unconfirmedTrips.length,
    rejectedOther: r.rejected.rejectedOther.length,
    timetablesVisited: r.timetables.length,
    errors: r.errors.length,
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
  };
}

function flushPartial(reason) {
  if (!report || flushing) return;
  flushing = true;
  try {
    report.stats = computeStats(report);
    report.partialFlushAt = new Date().toISOString();
    report.partialFlushReason = reason;
    writeJsonUtf8(PARTIAL_PATH, report);
    console.log('CHECKPOINT', reason, 'trips', report.trips.length, 'sigs', Object.keys(report.tripSignatures).length);
  } catch (e) {
    console.log('CHECKPOINT_FAIL', String(e.message || e));
  } finally {
    flushing = false;
  }
}

function recordTrip(reportObj, trip) {
  reportObj.trips.push(trip);
  if (!reportObj.tripSignatures[trip.tripSignature]) {
    reportObj.tripSignatures[trip.tripSignature] = {
      tripSignature: trip.tripSignature,
      count: 0,
      proposedSystemKey: trip.proposedSystemKey,
      stopNames: trip.stopNames,
      stopIds: trip.stopIds,
      platformIds: trip.platformIds,
      idComplete: trip.idComplete,
      berths: [],
      sampleUrls: [],
      dayLabels: [],
      courses: [],
    };
  }
  const sig = reportObj.tripSignatures[trip.tripSignature];
  sig.count += 1;
  if (trip.berth && !sig.berths.includes(trip.berth)) sig.berths.push(trip.berth);
  if (sig.sampleUrls.length < 5) sig.sampleUrls.push(trip.sampleUrl);
  if (trip.dayLabel && !sig.dayLabels.includes(trip.dayLabel)) sig.dayLabels.push(trip.dayLabel);
  if (trip.course && !sig.courses.includes(trip.course)) sig.courses.push(trip.course);

  reportObj.stopNameSignaturesSeen[stopNamesSignature(trip.stopNames)] = {
    sampleUrl: trip.sampleUrl,
    proposedSystemKey: trip.proposedSystemKey,
    stopCount: trip.stopCount,
    confirmedRoute: true,
    course: trip.course,
    berth: trip.berth,
  };
}

async function openTripQueue(page, reportObj, toOpen, phaseLabel) {
  const openedKeys = new Set();
  let opened = 0;
  let skippedSig = 0;
  let failed = 0;

  for (let i = 0; i < toOpen.length; i++) {
    if (pastHardTimeout()) {
      reportObj.phases.push({ phase: phaseLabel, hardTimeout: true, opened, i });
      break;
    }
    if (Object.keys(reportObj.tripSignatures).length >= UNIQUE_SIG_CAP) {
      reportObj.phases.push({ phase: phaseLabel, sigCap: true, opened, i });
      break;
    }
    const link = toOpen[i];
    const key = link.dedupeKey || link.absHref;
    if (openedKeys.has(key)) continue;
    openedKeys.add(key);

    if (link.otherRoute && link.otherRoute !== ROUTE_NUM && !hasRouteMark(link.cellText)) {
      reportObj.rejected.rejectedOther.push({ sampleUrl: link.absHref, cellText: link.cellText, reason: `cell-route-${link.otherRoute}` });
      continue;
    }

    console.log(`[${phaseLabel} ${i + 1}/${toOpen.length}] TRIP`, link.terminal, (link.cellText || '').slice(0, 36));
    let raw;
    try {
      raw = await scrapeTrip(page, link.absHref, { cellText: link.cellText, dayLabel: link.dayLabel, terminal: link.terminal, berth: link.berth });
    } catch (e) {
      failed += 1;
      reportObj.errors.push({ url: link.absHref, error: String(e.message || e), phase: phaseLabel });
      continue;
    }
    if (raw.errors?.length) {
      failed += 1;
      reportObj.errors.push({ url: link.absHref, error: raw.errors.join(';'), phase: phaseLabel });
      continue;
    }
    if (raw.stopNames.length < 2) {
      reportObj.errors.push({ url: link.absHref, error: 'too-few-stops', heading: raw.heading });
      continue;
    }

    const sns = stopNamesSignature(raw.stopNames);
    if (reportObj.stopNameSignaturesSeen[sns]) {
      skippedSig += 1;
      continue;
    }

    if (raw.systemNumberHint && raw.systemNumberHint !== ROUTE_NUM) {
      reportObj.rejected.rejectedOther.push({
        sampleUrl: link.absHref, stopNames: raw.stopNames, systemNumberHint: raw.systemNumberHint,
        cellText: link.cellText, reason: `sys-${raw.systemNumberHint}`, heading: raw.heading, course: raw.course,
      });
      console.log('REJECT sys', raw.systemNumberHint);
      continue;
    }

    const confirmed = raw.systemNumberHint === ROUTE_NUM
      || hasRouteMark(link.cellText)
      || hasRouteMark(raw.heading)
      || hasRouteMark(raw.title)
      || hasRouteMark(raw.bodySnippet)
      || hasRouteMark(link.courseText);
    if (!confirmed) {
      reportObj.unconfirmedTrips.push({
        sampleUrl: link.absHref, stopNames: raw.stopNames, cellText: link.cellText,
        heading: raw.heading, title: raw.title, course: raw.course, courseText: link.courseText,
        reason: 'no-[16]-or-【１６系統】-evidence',
      });
      console.log('SKIP_UNCONFIRMED', raw.stopNames[0], '->', raw.stopNames[raw.stopNames.length - 1]);
      continue;
    }

    const paired = pairStopIds(raw.stopNames, raw.busstopLinks);
    if (!raw.departureBusstopId && paired.stopIds[0]) raw.departureBusstopId = paired.stopIds[0];
    if (!raw.destinationBusstopId && paired.stopIds[paired.stopIds.length - 1]) {
      raw.destinationBusstopId = paired.stopIds[paired.stopIds.length - 1];
    }

    const trip = {
      sampleUrl: link.absHref, dayLabel: link.dayLabel, dayIso: link.dayIso, terminal: link.terminal,
      terminalId: link.terminalId, berth: link.berth, cellText: link.cellText,
      courseText: (link.courseText || '').slice(0, 300), legend: link.legend || [],
      heading: raw.heading, title: raw.title, systemNumberHint: raw.systemNumberHint, confirmedRoute: true,
      departureBusstopId: raw.departureBusstopId, destinationBusstopId: raw.destinationBusstopId,
      course: raw.course, courseSequence: raw.courseSequence,
      stopNames: raw.stopNames, stopCount: raw.stopNames.length, stops: raw.stops,
      stopIds: paired.stopIds, platformIds: paired.platformIds, idComplete: paired.idComplete,
      busstopLinks: (raw.busstopLinks || []).slice(0, 60),
      proposedSystemKey: null, tripSignature: null, errors: raw.errors,
    };
    trip.proposedSystemKey = proposeSystemKey(trip);
    trip.tripSignature = buildTripSignature(trip);
    recordTrip(reportObj, trip);
    opened += 1;
    console.log('GOT', trip.proposedSystemKey, trip.stopCount, trip.stopNames[0], '->', trip.stopNames[trip.stopNames.length - 1], 'course', trip.course, trip.idComplete ? 'idsOK' : 'idsPARTIAL');
    if (reportObj.trips.length % CHECKPOINT_EVERY === 0) flushPartial(`every-${CHECKPOINT_EVERY}-trips`);
  }

  reportObj.phases.push({ phase: phaseLabel, queued: toOpen.length, opened, skippedSig, failed });
  return { opened, skippedSig, failed };
}

async function main() {
  report = emptyReport();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  try {
    for (const word of SEARCH_WORDS) {
      if (pastHardTimeout()) break;
      console.log('SEARCH', word);
      report.searches[word] = await findBusstopId(page, word);
    }
    const pick = (word, re) => {
      const hits = report.searches[word]?.hits || [];
      const hit = hits.find((h) => re.test(h.text)) || hits[0];
      return hit?.id || null;
    };
    const terminals = [
      { key: 'shinurayasu', label: '新浦安駅', id: KNOWN_IDS.shinurayasu || pick('新浦安駅', /新浦安駅/) },
      { key: 'hinodeNanachome', label: '日の出七丁目', id: pick('日の出七丁目', /日の出七丁目/) },
      { key: 'proudParkMarina', label: 'プラウド新浦安パークマリーナ', id: pick('プラウド新浦安パークマリーナ', /プラウド/) },
      { key: 'baycityUrayasu', label: 'ベイシティ浦安', id: pick('ベイシティ浦安', /ベイシティ浦安/) },
      { key: 'umikazeNoMachi', label: '海風の街', id: pick('海風の街', /海風の街/) },
      { key: 'juntendo', label: '順天堂大学・日の出正門', id: pick('順天堂大学', /順天堂/) },
    ].filter((t) => t.id);
    report.terminalPlan = terminals;
    console.log('TERMINALS', JSON.stringify(terminals));

    const timetableJobs = [];
    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route16 courses:', courses.route16.length, '/ route17-only', courses.route17Only.length, '/ all', courses.all.length);
      for (const c of courses.route16) {
        console.log('   -', c.berthLetter || c.berth, (c.text || '').slice(0, 120));
        report.berthsSeen.push({ terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth, courseText: (c.text || '').slice(0, 240), href: c.absHref, hasSibling17: c.hasSibling17 });
      }
      for (const course of courses.route16.slice(0, 12)) {
        for (const day of SAMPLE_DATES) {
          timetableJobs.push({ term, course, day, url: withDatetime(course.absHref, day.iso, day.time) });
        }
      }
    }

    console.log('TIMETABLE JOBS', timetableJobs.length);
    const queue = [];
    for (const job of timetableJobs) {
      if (pastHardTimeout()) break;
      if (Object.keys(report.tripSignatures).length >= UNIQUE_SIG_CAP) break;
      const tt = await collectTimetableTripLinks(page, job.url, `${job.term.label}|${(job.course.text || '').slice(0, 60)}`, job.day.label);
      report.timetables.push({
        terminal: job.term.label, terminalId: job.term.id, dayLabel: job.day.label, dayIso: job.day.iso,
        courseText: (job.course.text || '').slice(0, 240), berth: job.course.berthLetter,
        timetableUrl: job.url, legend: tt.legend, tripLinkCount: tt.tripLinks.length, errors: tt.errors,
      });
      console.log('TT', job.term.label, job.day.label, (job.course.text || '').slice(0, 50), 'links', tt.tripLinks.length);
      const picked = tt.tripLinks.slice(0, PER_TT_CAP);
      for (const l of picked) {
        queue.push({
          ...l,
          terminal: job.term.label,
          terminalId: job.term.id,
          berth: job.course.berthLetter,
          courseText: job.course.text,
          dayLabel: job.day.label,
          dayIso: job.day.iso,
          legend: tt.legend,
        });
      }
      if (queue.length >= 20) {
        await openTripQueue(page, report, queue.splice(0, queue.length), 'interleaved');
        flushPartial('interleaved');
      }
    }
    if (queue.length) await openTripQueue(page, report, queue, 'tail');
  } catch (e) {
    report.errors.push({ fatal: String(e.message || e) });
    console.error('FATAL', e);
  } finally {
    report.stats = computeStats(report);
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== SIGNATURES ===');
  for (const [, v] of Object.entries(report.tripSignatures)) {
    console.log(v.proposedSystemKey, '| stops', v.stopNames.length, '| count', v.count, '| berths', v.berths.join(','), '| courses', v.courses.join(','));
    console.log('   ', v.stopNames.join(' > '));
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
