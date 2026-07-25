'use strict';
/**
 * Comprehensive Keisei Bus Navi scrape for 系統11 シンボルロード線.
 * Evidence only — does NOT invent stop orders. Rejects non-11 systems.
 *
 * Output: _navi_scrape_raw.json
 * Then run: node _build_official_gate.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';

const KNOWN_IDS = {
  urayasu: '00020739', // 浦安駅入口
  shinurayasu: '00020619', // 新浦安駅
};

const SEARCH_WORDS = [
  'ベイパーク',
  '総合公園',
  '日の出南',
  '望海の街',
  '明海五丁目',
  'シンボルロード・パークシティ',
  'シンボルロードパークシティ',
  '日の出公民館',
  '浦安駅入口',
  '新浦安駅',
];

const SAMPLE_DATES = [
  { iso: '2026-07-24', label: 'weekday' },
  { iso: '2026-07-25', label: 'saturday-holiday' },
  { iso: '2026-07-27', label: 'weekday-alt' },
];

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

const FORBIDDEN_DEST = /高洲海浜公園|浦安南高校|特養ホーム/;

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return HOST + href;
}

function withDatetime(url, dayIso) {
  if (!url || !dayIso) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('datetime', `${dayIso}T12:00`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

/** Dedupe key for trip URL without departure-time noise when possible. */
function tripDedupeKey(href) {
  if (!href) return '';
  try {
    const u = new URL(absUrl(href));
    // Keep identifying params; drop volatile time-only params if present
    u.searchParams.delete('datetime');
    u.searchParams.delete('time');
    u.searchParams.delete('hour');
    u.searchParams.delete('minute');
    // Keep start / departure-time if it identifies the trip instance
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
    // Fallback: full query without datetime
    if (![...next.searchParams.keys()].length) {
      return u.toString();
    }
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
    const re2 = /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
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

function hasRoute11Mark(text) {
  return /\[11\]|【\s*[１１11]\s*系統\s*】/.test(text || '');
}

function detectOtherRouteNumber(text) {
  const t = text || '';
  // Prefer explicit bracket marks
  const m = t.match(/\[(\d{1,2})\]/g);
  if (m) {
    for (const x of m) {
      const n = x.replace(/[\[\]]/g, '');
      if (n !== '11') return n;
    }
  }
  const sys = t.match(/【\s*([０-９0-9]+)\s*系統\s*】/);
  if (sys) {
    const n = sys[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
    if (n !== '11') return n;
  }
  return null;
}

function looksLikeOtherSystem(cell) {
  if (hasRoute11Mark(cell)) return false;
  return /\[(?:2|3|4|5|6|9|10|12|14|15|16|17|18|19|20|22|23|24|25|37|38)\]/.test(cell || '');
}

function isRoute11CourseText(text) {
  const t = text || '';
  if (/\[(?:3|10|18|19|25)\]/.test(t) && !/\[11\]/.test(t)) return false;
  if (FORBIDDEN_DEST.test(t) && !/\[11\]/.test(t)) return false;
  if (/\[11\]/.test(t)) {
    return /シンボル|総合公園|日の出|ベイパーク|望海|浦安駅入口|新浦安|明海|パークシティ/.test(t) || true;
  }
  // Without [11], only keep clear Symbol Road destinations (still verify on trip page)
  if (/シンボルロード|日の出南|望海の街/.test(t) && !/\[(?:3|18|25|10|19)\]/.test(t)) return true;
  return false;
}

function isLateNight(cellText, bodyText) {
  return /★|深夜|\[深夜\]|\[★\]/.test(cellText || '') || /\[深夜\]|深夜バス/.test(bodyText || '');
}

function extractBerthLetter(berthText) {
  const t = String(berthText || '').replace(/\s*地図\s*/g, ' ').trim();
  const m = t.match(/\b([A-Z]|0?\d{1,2})\b/);
  return m ? m[1].replace(/^0(\d)$/, '0$1') : t.slice(0, 20) || null;
}

function pairStopIds(stopNames, busstopLinks) {
  const ids = [];
  const platforms = [];
  const used = new Set();
  for (const name of stopNames) {
    let found = null;
    for (let i = 0; i < (busstopLinks || []).length; i++) {
      if (used.has(i)) continue;
      const b = busstopLinks[i];
      const text = normalizeStopName(b.text || '');
      if (text === name || text.includes(name) || name.includes(text)) {
        found = b;
        used.add(i);
        break;
      }
    }
    ids.push(found?.id || null);
    platforms.push(found?.platform || null);
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
  // Fallback: names for uniqueness when IDs incomplete
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
  return n
    .replace(/[^\u3040-\u30ff\u4e00-\u9fffa-zA-Z0-9]+/g, '-')
    .slice(0, 24) || 'unknown';
}

function detectViaKey(stopNames) {
  const names = normalizeStopNames(stopNames);
  const hasKominkan = names.some((n) => /日の出公民館/.test(n));
  const hasAkemi5 = names.some((n) => /明海五丁目/.test(n));
  const hasHyatt = names.some((n) => /ハイアット/.test(n));
  const hasFire = names.some((n) => /消防本部前/.test(n));
  // Prefer distinguishing forks: kominkan vs akemi5 when both endpoints shared
  if (hasKominkan && !hasAkemi5) return 'hinode-kominkan';
  if (hasAkemi5 && !hasKominkan) return 'akemi5';
  if (hasKominkan && hasAkemi5) return 'hinode-kominkan+akemi5';
  if (hasFire) return null; // common westbound marker, not a via fork by itself
  if (hasHyatt) return 'akemi5';
  return null;
}

function proposeSystemKey(trip) {
  const first = trip.stopNames?.[0] || '';
  const last = trip.stopNames?.[trip.stopNames.length - 1] || '';
  const from = romajiKeyFromName(first);
  const to = romajiKeyFromName(last);
  const via = detectViaKey(trip.stopNames);
  if (trip.night && /望海/.test(last)) return `11-${from}-${to}-night`;
  if (trip.night) return `11-${from}-${to}-night`;
  if (via && (from === 'sogo' || from === 'hinode' || to === 'shinurayasu' || to === 'urayasu')) {
    // Only attach via when it may distinguish same-endpoint forks; final gate builder regroups
    return `11-${from}-${to}-via-${via}`;
  }
  return `11-${from}-${to}`;
}

function classifyRejectRoute(systemHint, cellText, stopNames, heading) {
  const blob = [systemHint, cellText, heading, (stopNames || []).join(',')].join(' ');
  if (/高洲海浜公園/.test(blob) && !hasRoute11Mark(blob)) {
    return { bucket: 'rejectedOther', reason: 'takasu-kaihin-forbidden' };
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
  if (other === '10' || other === '19') {
    return { bucket: 'rejectedOther', reason: `route-${other}` };
  }
  if (other && other !== '11') {
    return { bucket: 'rejectedOther', reason: `route-${other}` };
  }
  return null;
}

function isLikelyRoute11Trip(cellText, legendText, systemHint) {
  const cell = cellText || '';
  const legend = legendText || '';
  if (hasRoute11Mark(cell) || hasRoute11Mark(legend) || systemHint === '11' || systemHint === '１１') {
    return true;
  }
  if (looksLikeOtherSystem(cell)) return false;
  // Symbol / destination hints with course already filtered for 11
  if (/総合公園|日の出|ベイパーク|望海|シンボル|浦安駅入口/.test(cell)) return true;
  // Unmarked cells on a route-11 timetable: accept for opening, verify on trip page
  return true;
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1200);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            return {
              id: m && m[1],
              text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100),
              href,
            };
          })
          .filter((x) => x.id),
      );
      if (hits.length) return { searchUrl: u, word, hits };
    } catch (_) {}
  }
  return { searchUrl: null, word, hits: [] };
}

async function listCourses(page, busstopId, label) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);
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
    /\[(?:3|10|18|19|25)\]|高洲海浜公園/.test(l.text || ''),
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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(900);
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
      out.departureBusstopId = u.searchParams.get('departure-busstop') || u.searchParams.get('busstop');
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
    await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1600);
    const meta = await page.evaluate(() => {
      const body = document.body.innerText;
      const legend = [];
      body.split(/\n/).forEach((line) => {
        const t = line.trim();
        if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) legend.push(t);
        if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
        if (/^\[深夜\]/.test(t) && !legend.includes(t)) legend.push(t);
        if (/\[11\]/.test(t) && !legend.includes(t)) legend.push(t);
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
        lateNight: isLateNight(l.cellText, ''),
        likely11: isLikelyRoute11Trip(l.cellText, legendBlob, null),
        otherRoute: detectOtherRouteNumber(l.cellText),
      }))
      .filter((l) => l.absHref);
  } catch (e) {
    result.errors.push(String(e.message || e));
  }
  return result;
}

function pickCoverageLinks(tripLinks, maxLinks = 80) {
  // Prefer diverse destinations / symbols / times of day
  const scored = tripLinks.map((l, idx) => {
    let score = 0;
    const c = l.cellText || '';
    if (l.likely11) score += 10;
    if (hasRoute11Mark(c)) score += 20;
    if (/望海|深夜|★/.test(c)) score += 15;
    if (/日の出|総合公園|ベイパーク|浦安駅入口|シンボル/.test(c)) score += 5;
    if (l.otherRoute && l.otherRoute !== '11') score -= 50;
    if (/\[(?:3|10|18|19|25)\]/.test(c)) score -= 40;
    // Spread across table order
    score += Math.max(0, 5 - Math.floor(idx / 20));
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const seen = new Set();
  for (const l of scored) {
    if (l.score < 0) continue;
    if (!l.likely11 && l.otherRoute && l.otherRoute !== '11') continue;
    const key = l.dedupeKey || l.absHref;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(l);
    if (picked.length >= maxLinks) break;
  }
  // Also force-include late-night candidates even if low score
  for (const l of tripLinks) {
    if (picked.length >= maxLinks + 20) break;
    if (!l.lateNight && !/望海|★|深夜/.test(l.cellText || '')) continue;
    const key = l.dedupeKey || l.absHref;
    if (seen.has(key)) continue;
    if (/\[(?:3|10|18|19|25)\]/.test(l.cellText || '')) continue;
    seen.add(key);
    picked.push(l);
  }
  return picked;
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note:
      'Route 11 Symbol Road only. No invented stop orders. Relation 18419852 / 高洲海浜公園 rejected unless official [11] trip confirms (unlikely).',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    timetables: [],
    trips: [],
    rejected: {
      rejectedRoute3: [],
      rejectedRoute18: [],
      rejectedRoute25: [],
      rejectedOther: [],
    },
    tripSignatures: {},
    candidateKeys: CANDIDATE_KEYS,
    berthsSeen: [],
    errors: [],
    stats: {},
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const openedTripKeys = new Set();

  try {
    // 1) Search busstops
    for (const word of SEARCH_WORDS) {
      console.log('SEARCH', word);
      const res = await findBusstopId(page, word);
      report.searches[word] = {
        searchUrl: res.searchUrl,
        hits: (res.hits || []).slice(0, 20),
      };
      console.log(
        ' ',
        (res.hits || [])
          .slice(0, 6)
          .map((h) => `${h.id}:${h.text}`)
          .join(' | '),
      );
    }

    function pickBestId(word, preferExact) {
      const hits = report.searches[word]?.hits || [];
      const exact = hits.find((h) => preferExact.test(h.text || ''));
      return exact?.id || hits[0]?.id || null;
    }

    report.knownIds.baypark = pickBestId('ベイパーク', /ベイパーク/);
    report.knownIds.sogo = pickBestId('総合公園', /^総合公園/);
    report.knownIds.hinode = pickBestId('日の出南', /^日の出南/);
    report.knownIds.nozomi = pickBestId('望海の街', /望海の街/);
    report.knownIds.akemi5 = pickBestId('明海五丁目', /明海五丁目/);
    report.knownIds.symbolRoadPc =
      pickBestId('シンボルロード・パークシティ', /シンボルロード/) ||
      pickBestId('シンボルロードパークシティ', /シンボルロード/);
    report.knownIds.hinodeKominkan = pickBestId('日の出公民館', /日の出公民館/);

    // Verify known IDs still match search
    const urayasuHit = (report.searches['浦安駅入口']?.hits || []).find((h) =>
      /浦安駅入口/.test(h.text || ''),
    );
    if (urayasuHit?.id) report.knownIds.urayasu = urayasuHit.id;
    const shinHit = (report.searches['新浦安駅']?.hits || []).find((h) => /新浦安駅/.test(h.text || ''));
    if (shinHit?.id) report.knownIds.shinurayasu = shinHit.id;

    console.log('KNOWN IDS', report.knownIds);

    const terminalPlan = [
      { key: 'urayasu', id: report.knownIds.urayasu, label: '浦安駅入口' },
      { key: 'shinurayasu', id: report.knownIds.shinurayasu, label: '新浦安駅' },
      { key: 'baypark', id: report.knownIds.baypark, label: 'ベイパーク' },
      { key: 'sogo', id: report.knownIds.sogo, label: '総合公園' },
      { key: 'hinode', id: report.knownIds.hinode, label: '日の出南' },
      { key: 'nozomi', id: report.knownIds.nozomi, label: '望海の街' },
      { key: 'akemi5', id: report.knownIds.akemi5, label: '明海五丁目' },
      { key: 'symbolRoadPc', id: report.knownIds.symbolRoadPc, label: 'シンボルロード・パークシティ' },
    ].filter((t) => t.id);

    // 2) List courses per terminal
    for (const term of terminalPlan) {
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route11 courses:', courses.route11.length);
      for (const c of courses.route11) {
        console.log('   -', c.berthLetter || c.berth, c.text.slice(0, 140));
        if (c.berthLetter || c.berth) {
          report.berthsSeen.push({
            terminal: term.label,
            busstopId: term.id,
            berth: c.berthLetter || c.berth,
            courseText: c.text.slice(0, 200),
          });
        }
      }
    }

    // 3) For each route11 course × sample dates, collect trip links
    const timetableJobs = [];
    for (const term of terminalPlan) {
      const courses = report.terminals[term.key]?.route11 || [];
      for (const course of courses.slice(0, 8)) {
        for (const day of SAMPLE_DATES) {
          timetableJobs.push({
            term,
            course,
            day,
            url: withDatetime(course.absHref, day.iso),
          });
        }
      }
    }

    console.log('Timetable jobs:', timetableJobs.length);
    const allPicked = [];
    for (const job of timetableJobs) {
      const label = `${job.term.label}/${job.course.berthLetter || 'x'}/${job.day.label}`;
      console.log('TT', label);
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
        })),
      });
      const picks = pickCoverageLinks(tt.tripLinks, 70);
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
      console.log('  links', tt.tripLinks.length, 'picked', picks.length, 'legend', tt.legend.slice(0, 4));
    }

    // Deduplicate picks globally but keep late-night / diverse terminals
    const globalSeen = new Set();
    const toOpen = [];
    for (const p of allPicked) {
      const key = p.dedupeKey || p.absHref;
      if (globalSeen.has(key)) continue;
      globalSeen.add(key);
      toOpen.push(p);
    }
    console.log('Unique trips to open:', toOpen.length);

    // 4) Open each unique trip
    for (let i = 0; i < toOpen.length; i++) {
      const link = toOpen[i];
      const key = link.dedupeKey || link.absHref;
      if (openedTripKeys.has(key)) continue;
      openedTripKeys.add(key);

      // Pre-reject obvious other routes without opening when cell is explicit
      if (link.otherRoute && link.otherRoute !== '11' && !hasRoute11Mark(link.cellText)) {
        const reject = classifyRejectRoute(link.otherRoute, link.cellText, [], null);
        if (reject) {
          const sample = {
            sampleUrl: link.absHref,
            cellText: link.cellText,
            reason: reject.reason,
            dayLabel: link.dayLabel,
            terminal: link.terminal,
          };
          report.rejected[reject.bucket].push(sample);
          console.log('PRE-REJECT', reject.reason, link.cellText?.slice(0, 60));
          continue;
        }
      }

      console.log(`[${i + 1}/${toOpen.length}] TRIP`, link.terminal, link.cellText?.slice(0, 50));
      const raw = await scrapeTrip(page, link.absHref, {
        cellText: link.cellText,
        dayLabel: link.dayLabel,
        dayIso: link.dayIso,
        terminal: link.terminal,
        berth: link.berth,
      });

      if (raw.stopNames.length < 2) {
        report.errors.push({ url: link.absHref, error: 'too-few-stops', heading: raw.heading });
        continue;
      }

      const night = isLateNight(link.cellText, raw.bodySnippet) || isLateNight(raw.heading, '');
      const paired = pairStopIds(raw.stopNames, raw.busstopLinks);
      // Prefer URL departure/destination when present
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

      // Forbidden: 高洲海浜公園 as route 11 unless explicit [11] on trip — still reject if destination is kaihin
      const last = raw.stopNames[raw.stopNames.length - 1] || '';
      if (FORBIDDEN_DEST.test(last)) {
        const sample = {
          sampleUrl: link.absHref,
          stopNames: raw.stopNames,
          systemNumberHint: raw.systemNumberHint,
          cellText: link.cellText,
          reason: 'takasu-kaihin-forbidden',
          heading: raw.heading,
        };
        report.rejected.rejectedOther.push(sample);
        console.log('REJECT kaihin', last);
        continue;
      }

      if (reject && reject.reason !== 'route-11') {
        // If trip page says 【11系統】, do not reject
        if (raw.systemNumberHint && raw.systemNumberHint !== '11') {
          const sample = {
            sampleUrl: link.absHref,
            stopNames: raw.stopNames,
            systemNumberHint: raw.systemNumberHint,
            cellText: link.cellText,
            reason: reject.reason,
            heading: raw.heading,
          };
          report.rejected[reject.bucket].push(sample);
          console.log('REJECT', reject.reason, raw.stopNames[0], '→', last);
          continue;
        }
        if (!raw.systemNumberHint && reject.bucket.startsWith('rejectedRoute')) {
          const sample = {
            sampleUrl: link.absHref,
            stopNames: raw.stopNames,
            systemNumberHint: raw.systemNumberHint,
            cellText: link.cellText,
            reason: reject.reason,
            heading: raw.heading,
          };
          report.rejected[reject.bucket].push(sample);
          console.log('REJECT', reject.reason, raw.stopNames[0], '→', last);
          continue;
        }
      }

      // Require route 11 confirmation: system hint 11 OR [11] in cell/heading OR course was route11-filtered
      const confirmed11 =
        raw.systemNumberHint === '11' ||
        hasRoute11Mark(link.cellText) ||
        hasRoute11Mark(raw.heading || '') ||
        hasRoute11Mark(raw.bodySnippet || '') ||
        /\[11\]/.test(link.courseText || '');

      if (!confirmed11) {
        // If another system number present, reject; else keep as unconfirmed candidate with flag
        if (raw.systemNumberHint && raw.systemNumberHint !== '11') {
          const r = classifyRejectRoute(raw.systemNumberHint, link.cellText, raw.stopNames, raw.heading);
          const bucket = r?.bucket || 'rejectedOther';
          report.rejected[bucket].push({
            sampleUrl: link.absHref,
            stopNames: raw.stopNames,
            systemNumberHint: raw.systemNumberHint,
            cellText: link.cellText,
            reason: r?.reason || `sys-${raw.systemNumberHint}`,
          });
          console.log('REJECT non-11 hint', raw.systemNumberHint);
          continue;
        }
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
        confirmed11: !!confirmed11,
        night,
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
        tripSignature: null,
        viaKey: detectViaKey(raw.stopNames),
        errors: raw.errors,
      };
      trip.proposedSystemKey = proposeSystemKey(trip);
      trip.tripSignature = buildTripSignature(trip);

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

      console.log(
        'GOT',
        trip.proposedSystemKey,
        trip.night ? 'NIGHT' : '',
        trip.stopCount,
        trip.stopNames[0],
        '→',
        trip.stopNames[trip.stopNames.length - 1],
        trip.idComplete ? 'idsOK' : 'idsPARTIAL',
      );
    }
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }

  report.stats = {
    terminalsScraped: Object.keys(report.terminals).length,
    timetables: report.timetables.length,
    tripsScraped: report.trips.length,
    uniqueSignatures: Object.keys(report.tripSignatures).length,
    rejectedRoute3: report.rejected.rejectedRoute3.length,
    rejectedRoute18: report.rejected.rejectedRoute18.length,
    rejectedRoute25: report.rejected.rejectedRoute25.length,
    rejectedOther: report.rejected.rejectedOther.length,
    missingTerminalIds: SEARCH_WORDS.filter((w) => {
      const map = {
        ベイパーク: 'baypark',
        総合公園: 'sogo',
        日の出南: 'hinode',
        望海の街: 'nozomi',
        明海五丁目: 'akemi5',
        'シンボルロード・パークシティ': 'symbolRoadPc',
        シンボルロードパークシティ: 'symbolRoadPc',
        日の出公民館: 'hinodeKominkan',
      };
      const k = map[w];
      return k && !report.knownIds[k];
    }),
  };

  const outPath = path.join(OUT_DIR, '_navi_scrape_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
  console.log('stats', report.stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
