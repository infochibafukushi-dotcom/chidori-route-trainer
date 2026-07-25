'use strict';
/**
 * Resume / hardened Keisei Bus Navi scrape for route 11 シンボルロード線.
 * Fixes hang at ~188/210: signature dedupe, per-TT cap, checkpoints, hard timeout.
 * Output: _navi_scrape_raw.json (+ _navi_scrape_partial.json checkpoints)
 * Then: node _build_official_gate.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 25 * 60 * 1000;
const CHECKPOINT_EVERY = 20;
const PER_TT_CAP = 25;

const KNOWN_IDS = {
  urayasu: '00020739', // 浦安駅入口
  shinurayasu: '00020619', // 新浦安駅
};

const ID_DISCOVER_TARGETS = [
  { key: 'baypark', re: /ベイパーク/ },
  { key: 'sogo', re: /^総合公園/ },
  { key: 'hinode', re: /^日の出南/ },
  { key: 'nozomi', re: /望海の街/ },
  { key: 'akemi5', re: /明海五丁目/ },
  { key: 'symbolRoadPc', re: /シンボルロード/ },
  { key: 'hinodeKominkan', re: /日の出公民館/ },
];

const SAMPLE_DATES = [
  { iso: '2026-07-24', label: 'weekday', time: '12:00' },
  { iso: '2026-07-25', label: 'saturday-holiday', time: '12:00' },
];
/** Extra late-evening sample for 新浦安駅 night / 望海 detection */
const NIGHT_SAMPLE = { iso: '2026-07-24', label: 'weekday-night', time: '23:30' };

const CANDIDATE_KEYS = [
  '11-urayasu-hinode',
  '11-urayasu-sogo',
  '11-urayasu-baypark',
  '11-shinurayasu-hinode',
  '11-shinurayasu-sogo',
  '11-shinurayasu-urayasu',
  '11-hinode-urayasu',
  '11-hinode-shinurayasu',
  '11-sogo-urayasu',
  '11-sogo-shinurayasu',
  '11-baypark-shinurayasu',
  '11-shinurayasu-nozomi-night',
  '11-shinurayasu-baypark',
  '11-baypark-urayasu',
  '11-sogo-hinode',
  '11-akemi5-start',
  '11-nozomi-shinurayasu',
  '11-symbol-road-pc',
];

const HARD_FORBIDDEN_STOP =
  /高洲海浜公園|浦安南高校|舞浜駅|鉄鋼団地|みなと南/;
const HARD_OTHER_ROUTE_CELL =
  /\[(?:3|10|18|19|23|25)\]/;

const startedAt = Date.now();
let report = null;
let flushing = false;

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return HOST + href;
}

function withDatetime(url, dayIso, timeHHMM) {
  if (!url || !dayIso) return url;
  try {
    const u = new URL(url);
    const t = timeHHMM || '12:00';
    u.searchParams.set('datetime', `${dayIso}T${t}`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function tripDedupeKey(href) {
  if (!href) return '';
  try {
    const u = new URL(absUrl(href));
    u.searchParams.delete('datetime');
    u.searchParams.delete('time');
    u.searchParams.delete('hour');
    u.searchParams.delete('minute');
    const keep = [
      'course',
      'course-sequence',
      'departure-busstop',
      'destination-busstop',
      'start',
      'node',
      'index',
      'trip',
    ];
    const next = new URL(u.origin + u.pathname);
    for (const k of keep) {
      if (u.searchParams.has(k)) next.searchParams.set(k, u.searchParams.get(k));
    }
    if (![...next.searchParams.keys()].length) return u.toString();
    return next.toString();
  } catch (_) {
    return String(href).replace(/datetime=[^&]+/, '').replace(/&&+/g, '&');
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
  if (stops.length === 0) {
    const compact = bodyText.replace(/\s+/g, ' ');
    const re2 =
      /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
    while ((m = re2.exec(compact)) !== null) {
      const name = m[3].replace(/系統.*$/, '').trim();
      if (name && name.length < 40) stops.push({ time: m[1], kind: m[2], name });
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
  return String(name || '')
    .replace(/シンボルロードパークシティ/g, 'シンボルロード・パークシティ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStopNames(names) {
  return (names || []).map(normalizeStopName);
}

function stopNamesSignature(stopNames, night) {
  return normalizeStopNames(stopNames).join('>') + '|' + (night ? 'night' : 'day');
}

function hasRoute11Mark(text) {
  return /\[11\]|【\s*[１１11]\s*系統\s*】/.test(text || '');
}

function detectOtherRouteNumber(text) {
  const t = text || '';
  const m = t.match(/\[(\d{1,2})\]/g);
  if (m) {
    for (const x of m) {
      const n = x.replace(/[\[\]]/g, '');
      if (n !== '11') return n;
    }
  }
  const sys = t.match(/【\s*([０-９0-9]+)\s*系統\s*】/);
  if (sys) {
    const n = sys[1].replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );
    if (n !== '11') return n;
  }
  return null;
}

function looksLikeOtherSystem(cell) {
  if (hasRoute11Mark(cell)) return false;
  return /\[(?:2|3|4|5|6|9|10|12|14|15|16|17|18|19|20|22|23|24|25|37|38)\]/.test(
    cell || '',
  );
}

function isRoute11CourseText(text) {
  const t = text || '';
  if (HARD_OTHER_ROUTE_CELL.test(t) && !/\[11\]/.test(t)) return false;
  if (HARD_FORBIDDEN_STOP.test(t) && !/\[11\]/.test(t)) return false;
  if (/\[11\]/.test(t)) return true;
  if (/シンボルロード|日の出南|望海の街/.test(t) && !HARD_OTHER_ROUTE_CELL.test(t)) {
    return true;
  }
  return false;
}

function isLateNight(cellText, bodyText) {
  const c = cellText || '';
  const b = bodyText || '';
  if (/★|\[★\]|深夜|\[深夜\]/.test(c)) return true;
  if (/\[深夜\]|深夜バス/.test(b)) return true;
  // 望海の街 on shinurayasu TT cells often marks late-night 11
  if (/望海の街/.test(c) && /★|深夜|\[深夜\]|望海/.test(c + b)) return true;
  return false;
}

function extractBerthLetter(berthText) {
  const t = String(berthText || '').replace(/\s*地図\s*/g, ' ').trim();
  const m = t.match(/\b([A-Z]|0?\d{1,2})\b/);
  return m ? m[1] : t.slice(0, 20) || null;
}

/**
 * Trip pages often label intermediate stop links as "系統・時刻表一覧".
 * Collapse consecutive duplicate busstop IDs, then pair by position when lengths match.
 */
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
    // Name match first; fill gaps from ordered seq unused IDs
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
    // Positional fill when still incomplete but seq length matches
    if (ids.some((x) => !x) && seq.length === names.length) {
      for (let i = 0; i < names.length; i++) {
        if (!ids[i]) {
          ids[i] = seq[i].id || null;
          platforms[i] = seq[i].platform || null;
        }
      }
    }
  }
  const complete = ids.length > 0 && ids.every((id) => !!id);
  return { stopIds: ids, platformIds: platforms, idComplete: complete };
}

function buildTripSignature(trip) {
  const routeNumber = '11';
  const dep = trip.departureBusstopId || trip.stopIds?.[0] || '';
  const dest = trip.destinationBusstopId || trip.stopIds?.[trip.stopIds.length - 1] || '';
  const night = trip.night ? 'night' : 'regular';
  if (trip.idComplete && trip.stopIds?.length) {
    return [
      routeNumber,
      dep,
      dest,
      trip.stopIds.join('>'),
      (trip.platformIds || []).map((p) => p || '').join('>'),
      night,
    ].join('|');
  }
  return [
    routeNumber,
    dep || trip.stopNames?.[0] || '',
    dest || trip.stopNames?.[trip.stopNames.length - 1] || '',
    (trip.stopNames || []).join('>'),
    (trip.platformIds || []).map((p) => p || '').join('>'),
    night,
    'name-fallback',
  ].join('|');
}

function romajiKeyFromName(name) {
  const n = normalizeStopName(name);
  if (/浦安駅入口/.test(n)) return 'urayasu';
  if (/新浦安駅/.test(n)) return 'shinurayasu';
  if (/日の出南/.test(n)) return 'hinode';
  if (/総合公園/.test(n)) return 'sogo';
  if (/ベイパーク/.test(n)) return 'baypark';
  if (/望海の街/.test(n)) return 'nozomi';
  if (/明海五丁目/.test(n)) return 'akemi5';
  if (/日の出公民館/.test(n)) return 'hinode-kominkan';
  if (/シンボルロード/.test(n)) return 'symbol-road-pc';
  return (
    n.replace(/[^\u3040-\u30ff\u4e00-\u9fffa-zA-Z0-9]+/g, '-').slice(0, 24) ||
    'unknown'
  );
}

function detectViaKey(stopNames) {
  const names = normalizeStopNames(stopNames);
  const hasKominkan = names.some((n) => /日の出公民館/.test(n));
  const hasAkemi5 = names.some((n) => /明海五丁目/.test(n));
  const hasHyatt = names.some((n) => /ハイアット/.test(n));
  const hasFire = names.some((n) => /消防本部前/.test(n));
  if (hasKominkan && !hasAkemi5) return 'hinode-kominkan';
  if (hasAkemi5 && !hasKominkan) return 'akemi5';
  if (hasKominkan && hasAkemi5) return 'hinode-kominkan+akemi5';
  if (hasFire) return null;
  if (hasHyatt) return 'akemi5';
  return null;
}

function proposeSystemKey(trip) {
  const first = trip.stopNames?.[0] || '';
  const last = trip.stopNames?.[trip.stopNames.length - 1] || '';
  const from = romajiKeyFromName(first);
  const to = romajiKeyFromName(last);
  const via = detectViaKey(trip.stopNames);
  if (trip.night) return `11-${from}-${to}-night`;
  if (via && (from === 'sogo' || from === 'hinode' || to === 'shinurayasu' || to === 'urayasu')) {
    return `11-${from}-${to}-via-${via}`;
  }
  return `11-${from}-${to}`;
}

function classifyRejectRoute(systemHint, cellText, stopNames, heading) {
  const blob = [systemHint, cellText, heading, (stopNames || []).join(',')].join(' ');
  if (HARD_FORBIDDEN_STOP.test(blob) && !hasRoute11Mark(blob)) {
    return { bucket: 'rejectedOther', reason: 'hard-forbidden-stop' };
  }
  const other = detectOtherRouteNumber(blob);
  if (other === '3' || /\[3\]|【\s*[３3]\s*系統/.test(blob)) {
    return { bucket: 'rejectedRoute3', reason: 'route-3' };
  }
  if (other === '18' || /\[18\]|【\s*[１1][８8]\s*系統/.test(blob)) {
    return { bucket: 'rejectedRoute18', reason: 'route-18' };
  }
  if (other === '25' || /\[25\]|【\s*[２2][５5]\s*系統/.test(blob)) {
    return { bucket: 'rejectedRoute25', reason: 'route-25' };
  }
  if (other === '10' || other === '19' || other === '23') {
    return { bucket: 'rejectedOther', reason: `route-${other}` };
  }
  if (other && other !== '11') {
    return { bucket: 'rejectedOther', reason: `route-${other}` };
  }
  return null;
}

function isLikelyRoute11Trip(cellText, legendText) {
  const cell = cellText || '';
  if (hasRoute11Mark(cell) || hasRoute11Mark(legendText || '')) return true;
  if (looksLikeOtherSystem(cell)) return false;
  if (/総合公園|日の出|ベイパーク|望海|シンボル|浦安駅入口|明海/.test(cell)) return true;
  return true;
}

function hardRejectCell(cellText) {
  const c = cellText || '';
  if (HARD_OTHER_ROUTE_CELL.test(c) && !hasRoute11Mark(c)) return 'other-route-cell';
  if (HARD_FORBIDDEN_STOP.test(c) && !hasRoute11Mark(c)) return 'forbidden-dest-cell';
  // あ/明 on 浦安 TT are 【３系統】 per official legend — not route 11
  if (/あ|明/.test(c) && !hasRoute11Mark(c) && !/[ひそベ]/.test(c)) return 'route3-symbol-cell';
  return null;
}

function isSymbolRoadPath(stopNames) {
  const names = normalizeStopNames(stopNames);
  const blob = names.join(',');
  if (HARD_FORBIDDEN_STOP.test(blob)) return false;
  const hasSymbol = names.some((n) => /シンボルロード|ベイパーク/.test(n));
  const hasCorridor = names.some((n) =>
    /日の出公民館|新浦安駅|総合公園|日の出南|浦安駅入口|ベイモール/.test(n),
  );
  // Route-3 akemi/hyatt fork has 明海五丁目+ハイアット without シンボルロード
  const akemiHyattOnly =
    names.some((n) => /ハイアット|明海南小学校/.test(n)) &&
    !names.some((n) => /シンボルロード|ベイパーク/.test(n));
  if (akemiHyattOnly) return false;
  return hasSymbol && hasCorridor;
}

function confirmRoute11(raw, link) {
  if (
    raw.systemNumberHint === '11' ||
    hasRoute11Mark(link.cellText) ||
    hasRoute11Mark(raw.heading || '') ||
    hasRoute11Mark(raw.title || '') ||
    hasRoute11Mark(raw.bodySnippet || '')
  ) {
    return true;
  }
  const course = link.courseText || '';
  if (!/\[11\]/.test(course)) return false;
  // Allow course-[11] + Symbol Road geometry when page omits bracket (some night/short trips)
  if (isSymbolRoadPath(raw.stopNames)) return true;
  return false;
}

function hardRejectStops(stopNames) {
  for (const n of stopNames || []) {
    if (HARD_FORBIDDEN_STOP.test(n)) return 'forbidden-stop-name:' + normalizeStopName(n);
  }
  return null;
}

/** Destination pattern key from cell symbols (み/ひ/そ/ベ/★/無印 etc). */
function destPatternKey(cellText, lateNight) {
  const c = cellText || '';
  const night = lateNight || /★|深夜|\[深夜\]/.test(c) ? 'night' : 'day';
  // Prefer explicit legend symbols in the time cell (e.g. "33ひ", "20そ", "51ベ")
  const symM = c.match(/[ぁ-んァ-ンあそひベみ明★]/g);
  const sym = symM ? symM.join('') : '';
  let dest = 'plain';
  if (/望海|★|深夜|\[深夜\]/.test(c)) dest = 'nozomi-night';
  else if (/ひ/.test(c) || /日の出/.test(c)) dest = 'hinode';
  else if (/そ/.test(c) || /総合/.test(c)) dest = 'sogo';
  else if (/ベ/.test(c) || /ベイ/.test(c)) dest = 'baypark';
  else if (/み|明/.test(c) || /明海/.test(c)) dest = 'akemi';
  else if (/浦安駅入口/.test(c)) dest = 'urayasu';
  else if (/新浦安/.test(c)) dest = 'shinurayasu';
  else if (/シンボ|パークシティ/.test(c)) dest = 'symbol';
  else if (/無印|^[\d:]+$/.test(c.trim())) dest = 'unmarked';
  // Do NOT treat ま (舞浜) as route-11
  return `${dest}|${sym || 'nosym'}|${night}`;
}

function isLikelyMaihamaCell(cellText) {
  const c = cellText || '';
  return /ま/.test(c) && !hasRoute11Mark(c) && !/ひ|そ|ベ|み|★|望海/.test(c);
}

async function listCourses(page, busstopId, label) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(1500);
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    h: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    links: [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => {
      const tr = a.closest('tr');
      const cell = tr && tr.querySelector('th, td');
      const berthRaw = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null;
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        berth: berthRaw,
      };
    }),
  }));
  const all = pageInfo.links.map((c) => ({
    ...c,
    absHref: absUrl(c.href),
    berthLetter: extractBerthLetter(c.berth),
  }));
  const route11 = all.filter((l) => isRoute11CourseText(l.text));
  const suspectsOther = all.filter((l) =>
    /\[(?:3|10|18|19|23|25)\]|高洲海浜公園|舞浜駅|鉄鋼団地|みなと南|浦安南高校/.test(l.text || ''),
  );
  return {
    label,
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    all,
    route11,
    suspectsOther,
  };
}

async function scrapeTrip(page, url, meta) {
  const out = {
    url,
    meta,
    stops: [],
    stopNames: [],
    heading: null,
    title: null,
    bodySnippet: null,
    busstopLinks: [],
    systemNumberHint: null,
    departureBusstopId: null,
    destinationBusstopId: null,
    course: null,
    courseSequence: null,
    errors: [],
  };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await page.waitForTimeout(700);
    const data = await page.evaluate(() => {
      const body = document.body.innerText;
      const h = document.querySelector('h1, h2');
      const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => {
        const href = a.getAttribute('href') || '';
        const plat =
          (href.match(/platform=([^&]+)/) || [])[1] ||
          (a.closest('tr,li,div')?.innerText || '').match(/のりば\s*([A-Z0-9]+)/)?.[1] ||
          null;
        return {
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href,
          id: (href.match(/busstop=(\d+)/) || [])[1] || null,
          platform: plat,
        };
      });
      return {
        title: document.title,
        heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null,
        body,
        busstopLinks,
        href: location.href,
      };
    });
    out.heading = data.heading;
    out.title = data.title;
    out.stops = parseStopSequence(data.body);
    out.stopNames = normalizeStopNames(uniqueNames(out.stops));
    out.bodySnippet = data.body.slice(0, 3500);
    out.busstopLinks = data.busstopLinks;
    const sys = (data.body.match(/【\s*([０-９0-9]+)\s*系統\s*】/) || [])[1];
    out.systemNumberHint = sys
      ? sys.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
      : null;
    try {
      const u = new URL(data.href || url);
      out.departureBusstopId =
        u.searchParams.get('departure-busstop') || u.searchParams.get('busstop');
      out.destinationBusstopId = u.searchParams.get('destination-busstop');
      out.course = u.searchParams.get('course');
      out.courseSequence = u.searchParams.get('course-sequence');
      out.startParam = u.searchParams.get('start');
    } catch (_) {}
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function collectTimetableTripLinks(page, timetableUrl, label, dayLabel) {
  const result = {
    label,
    dayLabel,
    timetableUrl,
    legend: [],
    tripLinks: [],
    bodySnippet: null,
    errors: [],
  };
  try {
    await page.goto(timetableUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await page.waitForTimeout(1200);
    const meta = await page.evaluate(() => {
      const body = document.body.innerText;
      const legend = [];
      body.split(/\n/).forEach((line) => {
        const t = line.trim();
        if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) {
          legend.push(t);
        }
        if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
        if (/^\[深夜\]/.test(t) && !legend.includes(t)) legend.push(t);
        if (/\[11\]/.test(t) && !legend.includes(t)) legend.push(t);
        if (/望海|★|深夜/.test(t) && /行き|止まり|系統/.test(t) && !legend.includes(t)) {
          legend.push(t);
        }
      });
      const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
        const href = a.getAttribute('href');
        const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const cell = a.closest('td, li, div') || a.parentElement;
        const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
        return { href, text, cellText: cellText.slice(0, 180) };
      });
      return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 7000) };
    });
    result.legend = meta.legend;
    result.bodySnippet = meta.bodySnippet;
    const legendBlob = meta.legend.join('\n');
    result.tripLinks = meta.tripLinks
      .map((l) => ({
        ...l,
        absHref: absUrl(l.href),
        dedupeKey: tripDedupeKey(l.href),
        lateNight: isLateNight(l.cellText, meta.bodySnippet),
        likely11: isLikelyRoute11Trip(l.cellText, legendBlob),
        otherRoute: detectOtherRouteNumber(l.cellText),
        destPattern: destPatternKey(l.cellText, isLateNight(l.cellText, '')),
      }))
      .filter((l) => l.absHref);
  } catch (e) {
    result.errors.push(String(e.message || e));
  }
  return result;
}

/**
 * Cap ~25 unique destination patterns.
 * Prefer one weekday + one holiday sample per dest symbol when available across jobs;
 * within a single TT, pick diverse dest patterns (score + first of each pattern).
 */
function pickCoverageLinks(tripLinks, maxLinks = PER_TT_CAP, preferNightBoost = false) {
  const scored = tripLinks.map((l, idx) => {
    let score = 0;
    const c = l.cellText || '';
    if (isLikelyMaihamaCell(c)) score -= 100;
    if (l.likely11) score += 10;
    if (hasRoute11Mark(c)) score += 20;
    if (/望海|深夜|★/.test(c)) score += preferNightBoost ? 30 : 15;
    if (/[ひそベみ]/.test(c)) score += 8;
    if (/日の出|総合公園|ベイパーク|浦安駅入口|シンボル|明海|無印/.test(c)) score += 5;
    // Prefer unmarked / 無印 on shared westbound berths (H) — often 11 to 浦安駅入口
    if (/無印/.test(c) || /^[\d:]{1,5}\s*$/.test(c.trim())) score += 6;
    if (l.otherRoute && l.otherRoute !== '11') score -= 50;
    if (HARD_OTHER_ROUTE_CELL.test(c) && !hasRoute11Mark(c)) score -= 80;
    if (HARD_FORBIDDEN_STOP.test(c)) score -= 80;
    // Prefer diversity across hour-of-day buckets in the table
    score += Math.max(0, 3 - Math.floor(idx / 40));
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const seenUrl = new Set();
  const seenPattern = new Set();

  for (const l of scored) {
    if (l.score < 0) continue;
    if (hardRejectCell(l.cellText)) continue;
    if (isLikelyMaihamaCell(l.cellText)) continue;
    if (!l.likely11 && l.otherRoute && l.otherRoute !== '11') continue;
    const pk = l.destPattern || destPatternKey(l.cellText, l.lateNight);
    // Allow up to 2 samples per pattern (different times) within TT
    const patternCount = [...seenPattern].filter((x) => x === pk || x.startsWith(pk + '#')).length;
    if (patternCount >= 2) continue;
    const key = l.dedupeKey || l.absHref;
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    seenPattern.add(patternCount === 0 ? pk : pk + '#' + patternCount);
    picked.push(l);
    if (picked.length >= maxLinks) break;
  }

  for (const l of tripLinks) {
    if (picked.length >= maxLinks) break;
    if (!l.lateNight && !/望海|★|深夜/.test(l.cellText || '')) continue;
    if (hardRejectCell(l.cellText) || isLikelyMaihamaCell(l.cellText)) continue;
    const key = l.dedupeKey || l.absHref;
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    picked.push(l);
  }

  return picked;
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    resume: true,
    note:
      'Route 11 Symbol Road only. Resume scraper: signature dedupe, TT cap, checkpoints, 25min hard timeout. No invented stop orders.',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    timetables: [],
    trips: [],
    unconfirmedTrips: [],
    rejected: {
      rejectedRoute3: [],
      rejectedRoute18: [],
      rejectedRoute25: [],
      rejectedOther: [],
    },
    tripSignatures: {},
    stopNameSignaturesSeen: {},
    candidateKeys: CANDIDATE_KEYS,
    berthsSeen: [],
    errors: [],
    stats: {},
    phases: [],
  };
}

function writeJsonUtf8(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
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

function computeStats(r) {
  return {
    terminalsScraped: Object.keys(r.terminals || {}).length,
    timetables: (r.timetables || []).length,
    tripsScraped: (r.trips || []).length,
    uniqueSignatures: Object.keys(r.tripSignatures || {}).length,
    uniqueStopNameSignatures: Object.keys(r.stopNameSignaturesSeen || {}).length,
    rejectedRoute3: (r.rejected?.rejectedRoute3 || []).length,
    rejectedRoute18: (r.rejected?.rejectedRoute18 || []).length,
    rejectedRoute25: (r.rejected?.rejectedRoute25 || []).length,
    rejectedOther: (r.rejected?.rejectedOther || []).length,
    knownIds: { ...r.knownIds },
    elapsedMs: Date.now() - startedAt,
  };
}

function pastHardTimeout() {
  return Date.now() - startedAt >= HARD_TIMEOUT_MS;
}

function harvestIdsFromTrip(trip, knownIds) {
  const names = trip.stopNames || [];
  const paired = trip.stopIds || [];
  const links = trip.busstopLinks || [];
  for (const t of ID_DISCOVER_TARGETS) {
    if (knownIds[t.key]) continue;
    for (let i = 0; i < names.length; i++) {
      if (t.re.test(names[i]) && paired[i]) {
        // Prefer bare numeric id (strip platform suffix like -1)
        knownIds[t.key] = String(paired[i]).replace(/-\d+$/, '');
        console.log('ID_DISCOVER', t.key, knownIds[t.key], 'from stopNames pairing');
        break;
      }
    }
    if (knownIds[t.key]) continue;
    for (const b of links) {
      const text = normalizeStopName(b.text || '');
      if (t.re.test(text) && b.id) {
        knownIds[t.key] = String(b.id).replace(/-\d+$/, '');
        console.log('ID_DISCOVER', t.key, knownIds[t.key], 'from busstopLinks text');
        break;
      }
    }
  }
}

function recordTrip(report, trip) {
  report.trips.push(trip);
  if (!report.tripSignatures[trip.tripSignature]) {
    report.tripSignatures[trip.tripSignature] = {
      tripSignature: trip.tripSignature,
      count: 0,
      proposedSystemKey: trip.proposedSystemKey,
      stopNames: trip.stopNames,
      stopIds: trip.stopIds,
      idComplete: trip.idComplete,
      night: trip.night,
      berths: [],
      sampleUrls: [],
      dayLabels: [],
    };
  }
  const sig = report.tripSignatures[trip.tripSignature];
  sig.count += 1;
  if (trip.berth && !sig.berths.includes(trip.berth)) sig.berths.push(trip.berth);
  if (sig.sampleUrls.length < 5) sig.sampleUrls.push(trip.sampleUrl);
  if (trip.dayLabel && !sig.dayLabels.includes(trip.dayLabel)) sig.dayLabels.push(trip.dayLabel);

  const sns = stopNamesSignature(trip.stopNames, trip.night);
  if (trip.confirmed11) {
    report.stopNameSignaturesSeen[sns] = {
      sampleUrl: trip.sampleUrl,
      proposedSystemKey: trip.proposedSystemKey,
      stopCount: trip.stopCount,
      confirmed11: true,
    };
  }
}

async function openTripQueue(page, report, toOpen, phaseLabel) {
  const openedTripKeys = new Set();
  let opened = 0;
  let skippedSig = 0;
  let failed = 0;

  for (let i = 0; i < toOpen.length; i++) {
    if (pastHardTimeout()) {
      console.log('HARD_TIMEOUT during', phaseLabel);
      report.phases.push({ phase: phaseLabel, hardTimeout: true, opened, i });
      break;
    }

    const link = toOpen[i];
    const key = link.dedupeKey || link.absHref;
    if (openedTripKeys.has(key)) continue;
    openedTripKeys.add(key);

    const cellReject = hardRejectCell(link.cellText);
    if (cellReject) {
      report.rejected.rejectedOther.push({
        sampleUrl: link.absHref,
        cellText: link.cellText,
        reason: cellReject,
        dayLabel: link.dayLabel,
        terminal: link.terminal,
      });
      continue;
    }

    if (link.otherRoute && link.otherRoute !== '11' && !hasRoute11Mark(link.cellText)) {
      const reject = classifyRejectRoute(link.otherRoute, link.cellText, [], null);
      if (reject) {
        report.rejected[reject.bucket].push({
          sampleUrl: link.absHref,
          cellText: link.cellText,
          reason: reject.reason,
          dayLabel: link.dayLabel,
          terminal: link.terminal,
        });
        continue;
      }
    }

    console.log(
      `[${phaseLabel} ${i + 1}/${toOpen.length}] TRIP`,
      link.terminal,
      (link.cellText || '').slice(0, 40),
    );

    let raw;
    try {
      raw = await scrapeTrip(page, link.absHref, {
        cellText: link.cellText,
        dayLabel: link.dayLabel,
        dayIso: link.dayIso,
        terminal: link.terminal,
        berth: link.berth,
      });
    } catch (e) {
      failed += 1;
      report.errors.push({ url: link.absHref, error: String(e.message || e), phase: phaseLabel });
      console.log('TRIP_FAIL continue', String(e.message || e).slice(0, 80));
      continue;
    }

    if (raw.errors?.length) {
      failed += 1;
      report.errors.push({ url: link.absHref, error: raw.errors.join(';'), phase: phaseLabel });
      console.log('TRIP_ERR continue', raw.errors[0]?.slice(0, 80));
      continue;
    }

    if (raw.stopNames.length < 2) {
      report.errors.push({ url: link.absHref, error: 'too-few-stops', heading: raw.heading });
      continue;
    }

    const night =
      isLateNight(link.cellText, raw.bodySnippet) ||
      isLateNight(raw.heading, '') ||
      (!!link.lateNight && /望海/.test(raw.stopNames[raw.stopNames.length - 1] || ''));

    const sns = stopNamesSignature(raw.stopNames, night);
    if (report.stopNameSignaturesSeen[sns]) {
      skippedSig += 1;
      console.log('SKIP_SIG', sns.slice(0, 80));
      continue;
    }

    const stopReject = hardRejectStops(raw.stopNames);
    if (stopReject) {
      report.rejected.rejectedOther.push({
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        cellText: link.cellText,
        reason: stopReject,
        heading: raw.heading,
      });
      console.log('REJECT', stopReject);
      continue;
    }

    // Cell has other route mark without [11]
    const bodyOther =
      HARD_OTHER_ROUTE_CELL.test(link.cellText || '') && !hasRoute11Mark(link.cellText || '');
    if (bodyOther) {
      report.rejected.rejectedOther.push({
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        cellText: link.cellText,
        reason: 'other-route-cell',
      });
      continue;
    }

    const paired = pairStopIds(raw.stopNames, raw.busstopLinks);
    if (!raw.departureBusstopId && paired.stopIds[0]) raw.departureBusstopId = paired.stopIds[0];
    if (!raw.destinationBusstopId && paired.stopIds[paired.stopIds.length - 1]) {
      raw.destinationBusstopId = paired.stopIds[paired.stopIds.length - 1];
    }

    const reject = classifyRejectRoute(
      raw.systemNumberHint,
      link.cellText,
      raw.stopNames,
      raw.heading,
    );

    if (reject) {
      if (raw.systemNumberHint && raw.systemNumberHint !== '11') {
        report.rejected[reject.bucket].push({
          sampleUrl: link.absHref,
          stopNames: raw.stopNames,
          systemNumberHint: raw.systemNumberHint,
          cellText: link.cellText,
          reason: reject.reason,
          heading: raw.heading,
        });
        console.log('REJECT', reject.reason);
        continue;
      }
      if (!raw.systemNumberHint && reject.bucket.startsWith('rejectedRoute')) {
        report.rejected[reject.bucket].push({
          sampleUrl: link.absHref,
          stopNames: raw.stopNames,
          cellText: link.cellText,
          reason: reject.reason,
          heading: raw.heading,
        });
        console.log('REJECT', reject.reason);
        continue;
      }
      if (reject.reason === 'hard-forbidden-stop') {
        report.rejected[reject.bucket].push({
          sampleUrl: link.absHref,
          stopNames: raw.stopNames,
          cellText: link.cellText,
          reason: reject.reason,
        });
        continue;
      }
    }

    const confirmed11 = confirmRoute11(raw, link);

    if (!confirmed11) {
      report.unconfirmedTrips = report.unconfirmedTrips || [];
      report.unconfirmedTrips.push({
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        cellText: link.cellText,
        heading: raw.heading,
        title: raw.title,
        systemNumberHint: raw.systemNumberHint,
        reason: 'no-[11]-on-trip-page',
      });
      console.log(
        'SKIP_UNCONFIRMED',
        raw.stopNames[0],
        '->',
        raw.stopNames[raw.stopNames.length - 1],
        raw.stopNames.length,
      );
      continue;
    }

    const trip = {
      sampleUrl: link.absHref,
      dayLabel: link.dayLabel,
      dayIso: link.dayIso,
      terminal: link.terminal,
      terminalId: link.terminalId,
      berth: link.berth,
      cellText: link.cellText,
      courseText: (link.courseText || '').slice(0, 300),
      legend: link.legend || [],
      heading: raw.heading,
      title: raw.title,
      systemNumberHint: raw.systemNumberHint,
      confirmed11: true,
      night,
      lateNight: night,
      departureBusstopId: raw.departureBusstopId,
      destinationBusstopId: raw.destinationBusstopId,
      course: raw.course,
      courseSequence: raw.courseSequence,
      startParam: raw.startParam,
      stopNames: raw.stopNames,
      stopCount: raw.stopNames.length,
      stops: raw.stops,
      stopIds: paired.stopIds,
      platformIds: paired.platformIds,
      idComplete: paired.idComplete,
      busstopLinks: raw.busstopLinks,
      proposedSystemKey: null,
      systemKeyGuess: null,
      tripSignature: null,
      viaKey: detectViaKey(raw.stopNames),
      errors: raw.errors,
    };
    trip.proposedSystemKey = proposeSystemKey(trip);
    trip.systemKeyGuess = trip.proposedSystemKey;
    trip.tripSignature = buildTripSignature(trip);

    recordTrip(report, trip);
    harvestIdsFromTrip(trip, report.knownIds);
    opened += 1;
    console.log(
      'GOT',
      trip.proposedSystemKey,
      trip.night ? 'NIGHT' : 'DAY',
      trip.stopCount,
      trip.stopNames[0],
      '->',
      trip.stopNames[trip.stopNames.length - 1],
      trip.idComplete ? 'idsOK' : 'idsPARTIAL',
    );

    if (report.trips.length % CHECKPOINT_EVERY === 0) {
      flushPartial(`every-${CHECKPOINT_EVERY}-trips`);
    }
  }

  report.phases.push({
    phase: phaseLabel,
    queued: toOpen.length,
    opened,
    skippedSig,
    failed,
  });
  return { opened, skippedSig, failed };
}

async function collectJobsForTerminals(page, report, terminalPlan, phaseLabel) {
  const allPicked = [];
  const timetableJobs = [];

  for (const term of terminalPlan) {
    if (!term.id) continue;
    if (pastHardTimeout()) break;
    console.log('COURSES', term.label, term.id);
    const courses = await listCourses(page, term.id, term.label);
    report.terminals[term.key] = courses;
    console.log('  route11 courses:', courses.route11.length);
    for (const c of courses.route11) {
      console.log('   -', c.berthLetter || c.berth, (c.text || '').slice(0, 120));
      if (c.berthLetter || c.berth) {
        report.berthsSeen.push({
          terminal: term.label,
          busstopId: term.id,
          berth: c.berthLetter || c.berth,
          courseText: c.text.slice(0, 200),
        });
      }
    }
    for (const course of courses.route11.slice(0, 8)) {
      for (const day of SAMPLE_DATES) {
        timetableJobs.push({
          term,
          course,
          day,
          url: withDatetime(course.absHref, day.iso, day.time),
        });
      }
      // Night sample on 新浦安駅 only
      if (/新浦安/.test(term.label)) {
        timetableJobs.push({
          term,
          course,
          day: NIGHT_SAMPLE,
          url: withDatetime(course.absHref, NIGHT_SAMPLE.iso, NIGHT_SAMPLE.time),
        });
      }
    }
  }

  console.log('Timetable jobs:', timetableJobs.length, phaseLabel);

  // Prefer weekday first, then holiday — pickCoverage already diversifies patterns
  for (const job of timetableJobs) {
    if (pastHardTimeout()) break;
    const label = `${job.term.label}/${job.course.berthLetter || 'x'}/${job.day.label}`;
    console.log('TT', label);
    const preferNight = /新浦安/.test(job.term.label);
    const westboundShared =
      /消防本部|浦安駅入口/.test(job.course.text || '') && /新浦安/.test(job.term.label);
    const tt = await collectTimetableTripLinks(page, job.url, label, job.day.label);
    tt.terminal = job.term.label;
    tt.terminalId = job.term.id;
    tt.berth = job.course.berthLetter || job.course.berth;
    tt.courseText = job.course.text;
    tt.dayIso = job.day.iso;
    report.timetables.push({
      ...tt,
      tripLinks: tt.tripLinks.map((l) => ({
        absHref: l.absHref,
        dedupeKey: l.dedupeKey,
        cellText: l.cellText,
        lateNight: l.lateNight,
        likely11: l.likely11,
        otherRoute: l.otherRoute,
        destPattern: l.destPattern,
      })),
    });
    // Shared westbound berth (H): sample more unmarked cells to catch 11 vs 3/10/18
    const cap = westboundShared ? PER_TT_CAP : PER_TT_CAP;
    let picks = pickCoverageLinks(tt.tripLinks, cap, preferNight);
    if (westboundShared) {
      const extra = [];
      const seen = new Set(picks.map((p) => p.dedupeKey || p.absHref));
      for (const l of tt.tripLinks) {
        if (extra.length + picks.length >= 12) break;
        if (hardRejectCell(l.cellText) || isLikelyMaihamaCell(l.cellText)) continue;
        if (!/^[\d:.\s]+$/.test((l.cellText || '').trim()) && !/無印/.test(l.cellText || '')) {
          continue;
        }
        const key = l.dedupeKey || l.absHref;
        if (seen.has(key)) continue;
        seen.add(key);
        extra.push(l);
      }
      picks = picks.concat(extra);
    }
    for (const p of picks) {
      allPicked.push({
        ...p,
        dayLabel: job.day.label,
        dayIso: job.day.iso,
        terminal: job.term.label,
        terminalId: job.term.id,
        berth: job.course.berthLetter || job.course.berth,
        courseText: job.course.text,
        legend: tt.legend,
      });
    }
    console.log('  links', tt.tripLinks.length, 'picked', picks.length);
  }

  // Global: keep weekday + holiday (+ night) per destPattern×terminal×berth
  // For shared westbound (H), keep up to 6 unmarked URL samples per dayKind (11 vs 3/10/18 mix).
  const byPatternDay = new Map();
  const hExtra = [];
  for (const p of allPicked) {
    const isH =
      String(p.berth || '') === 'H' || /消防本部/.test(p.courseText || '');
    const pk =
      (p.destPattern || destPatternKey(p.cellText, p.lateNight)) +
      '|' +
      p.terminal +
      '|' +
      (p.berth || 'x');
    let dayKind = 'weekday';
    if (/holiday|saturday/i.test(p.dayLabel || '')) dayKind = 'holiday';
    if (/night/i.test(p.dayLabel || '') || p.lateNight) dayKind = 'night';
    const mapKey = pk + '|' + dayKind;
    if (isH && /^[\d:.\s]+$/.test((p.cellText || '').trim())) {
      hExtra.push(p);
      continue;
    }
    if (!byPatternDay.has(mapKey)) byPatternDay.set(mapKey, p);
  }
  // Diversify H unmarked across table order (spread, max 8)
  const hSeen = new Set();
  const hPicked = [];
  const step = Math.max(1, Math.floor(hExtra.length / 8));
  for (let i = 0; i < hExtra.length && hPicked.length < 8; i += step) {
    const p = hExtra[i];
    const key = p.dedupeKey || p.absHref;
    if (hSeen.has(key)) continue;
    hSeen.add(key);
    hPicked.push(p);
  }
  // fill remaining sequentially if needed
  for (const p of hExtra) {
    if (hPicked.length >= 8) break;
    const key = p.dedupeKey || p.absHref;
    if (hSeen.has(key)) continue;
    hSeen.add(key);
    hPicked.push(p);
  }
  let toOpen = [...byPatternDay.values(), ...hPicked];

  // Extra: if still many, URL-dedupe
  const seen = new Set();
  toOpen = toOpen.filter((p) => {
    const k = p.dedupeKey || p.absHref;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log('Unique trips to open:', toOpen.length, phaseLabel);
  return toOpen;
}

async function main() {
  report = emptyReport();

  const onSignal = (sig) => {
    try {
      flushPartial(sig);
    } catch (_) {}
    try {
      if (report) {
        report.stats = computeStats(report);
        writeJsonUtf8(RAW_PATH, report);
        console.log('SIGNAL_FLUSH', sig, 'trips', report.trips.length);
      }
    } catch (_) {}
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  // Avoid process.on('exit') writers — can crash under Tee-Object / Playwright teardown.

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // Phase 1: 浦安駅入口 + 新浦安駅
    const phase1 = [
      { key: 'urayasu', id: report.knownIds.urayasu, label: '浦安駅入口' },
      { key: 'shinurayasu', id: report.knownIds.shinurayasu, label: '新浦安駅' },
    ];
    console.log('PHASE1 knownIds', report.knownIds);
    const queue1 = await collectJobsForTerminals(page, report, phase1, 'phase1');
    await openTripQueue(page, report, queue1, 'phase1');
    flushPartial('after-phase1');

    // Phase 2: discover IDs then inbound terminals (only unseen signatures)
    const phase2Plan = ID_DISCOVER_TARGETS.map((t) => {
      const labels = {
        baypark: 'ベイパーク',
        sogo: '総合公園',
        hinode: '日の出南',
        nozomi: '望海の街',
        akemi5: '明海五丁目',
        symbolRoadPc: 'シンボルロード・パークシティ',
        hinodeKominkan: '日の出公民館',
      };
      return {
        key: t.key,
        id: report.knownIds[t.key] || null,
        label: labels[t.key] || t.key,
      };
    }).filter((t) => t.id);

    console.log(
      'PHASE2 terminals with IDs',
      phase2Plan.map((t) => t.key + ':' + t.id).join(', ') || '(none)',
    );
    report.phases.push({
      phase: 'id-discovery',
      knownIds: { ...report.knownIds },
      phase2Terminals: phase2Plan.map((t) => t.key),
    });

    if (phase2Plan.length && !pastHardTimeout()) {
      const queue2 = await collectJobsForTerminals(page, report, phase2Plan, 'phase2');
      // Filter: skip links we will almost certainly skip by signature after open —
      // still open because we don't know stopNames until trip page; signature skip handles it.
      await openTripQueue(page, report, queue2, 'phase2');
    }

    flushPartial('after-phase2');
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
    console.log('MAIN_ERROR', String(e.message || e));
  } finally {
    // Write BEFORE browser.close — prior runs crashed during teardown and lost the final JSON.
    try {
      for (const t of report.trips || []) {
        if (t.busstopLinks && t.busstopLinks.length > 40) {
          t.busstopLinks = t.busstopLinks.slice(0, 40);
        }
      }
      report.stats = computeStats(report);
      report.scrapedAt = new Date().toISOString();
      writeJsonUtf8(RAW_PATH, report);
      writeJsonUtf8(PARTIAL_PATH, report);
      console.log('wrote', RAW_PATH);
      console.log('stats', JSON.stringify(report.stats));
      console.log('confirmed11_trips', report.trips.filter((t) => t.confirmed11).length);
      console.log('stopNameSignatures', Object.keys(report.stopNameSignaturesSeen).length);
    } catch (we) {
      console.log('WRITE_FAIL', String(we.message || we));
    }
    try {
      await browser.close();
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e);
  try {
    if (report) {
      report.errors.push(String(e && e.stack ? e.stack : e));
      flushPartial('fatal');
      writeJsonUtf8(RAW_PATH, report);
    }
  } catch (_) {}
  process.exit(1);
});
