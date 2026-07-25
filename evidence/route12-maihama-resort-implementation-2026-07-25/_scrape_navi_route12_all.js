'use strict';
/**
 * Keisei Bus Navi full audit scrape for 系統12 舞浜リゾート線.
 * Hard-separates from route 4 at 浦安駅入口 D (ホ=12; 無印/ランド/ち=4).
 * Requires trip-page routeNumber===12 (【１２系統】 or [12]) before accept.
 * Aggressive stop-name signature dedupe + checkpoints + unique-sig cap.
 *
 * Output: _navi_scrape_raw.json (+ _navi_scrape_partial.json)
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
const HARD_TIMEOUT_MS = 30 * 60 * 1000;
const CHECKPOINT_EVERY = 10;
const PER_TT_CAP = 30;
const UNIQUE_SIG_CAP = 40;

const KNOWN_IDS = {
  urayasu: '00020739', // 浦安駅入口
  maihama: '00020617', // 舞浜駅
};

const SEARCH_WORDS = [
  '浦安駅入口',
  '舞浜駅',
  '東京ディズニーシー',
  'リゾートホテルエリア・サウス',
  'リゾートホテルエリア・ノース',
  'リゾートホテルエリア',
  'ベイサイド・ステーション',
  'ベイサイドステーション',
  '運動公園',
];

const SAMPLE_DATES = [
  { iso: '2026-07-24', label: 'weekday', time: '12:00' },
  { iso: '2026-07-25', label: 'saturday-holiday', time: '12:00' },
  { iso: '2026-07-27', label: 'weekday-alt', time: '12:00' },
];

const CANDIDATE_KEYS = [
  '12-maihama-via-resort',
  '12-urayasu-via-resort',
  '12-tds-maihama',
  '12-tds-urayasu',
  '12-urayasu-tds',
  '12-maihama-tds',
  '12-hotel-start',
  '12-hotel-end',
  '12-undokoen-start',
  '12-undokoen-end',
];

/** Route-4 destinations / symbols that must never enter route-12 confirmed set. */
const ROUTE4_DEST =
  /東京ディズニーランド|ディズニーランド|千鳥車庫|千鳥北/;
const ROUTE4_CELL =
  /ランド|ち(?![一-龥ぁ-んァ-ン])|\[4\]|【\s*[４4]\s*系統/;

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
  return String(name || '')
    .replace(/東京ディズニーシー\s*[\(（]R[\)）]/gi, '東京ディズニーシー（Ｒ）')
    .replace(/東京ディズニーシー\s*[\(（]Ｒ[\)）]/g, '東京ディズニーシー（Ｒ）')
    .replace(/「東京ディズニーシー（Ｒ）」/g, '東京ディズニーシー（Ｒ）')
    .replace(/ベイサイドステーション/g, 'ベイサイド・ステーション')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStopNames(names) {
  return (names || []).map(normalizeStopName);
}

function stopNamesSignature(stopNames) {
  return normalizeStopNames(stopNames).join('>');
}

function hasRoute12Mark(text) {
  return /\[12\]|【\s*[１２12]{1,2}\s*系統\s*】/.test(text || '');
}

function toAsciiDigits(s) {
  return String(s || '').replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
}

function detectOtherRouteNumber(text) {
  const t = text || '';
  const m = t.match(/\[(\d{1,2})\]/g);
  if (m) {
    for (const x of m) {
      const n = x.replace(/[\[\]]/g, '');
      if (n !== '12') return n;
    }
  }
  const sys = t.match(/【\s*([０-９0-9]+)\s*系統\s*】/);
  if (sys) {
    const n = toAsciiDigits(sys[1]);
    if (n !== '12') return n;
  }
  return null;
}

function extractBerthLetter(berthText) {
  const t = String(berthText || '').replace(/\s*地図\s*/g, ' ').trim();
  const m = t.match(/\b([A-Z]|0?\d{1,2})\b/);
  return m ? m[1] : t.slice(0, 20) || null;
}

function isRoute12CourseText(text) {
  const t = text || '';
  if (/\[12\]|【\s*[１２12]{1,2}\s*系統/.test(t)) return true;
  if (/ホ/.test(t) && /ディズニーシー|リゾートホテル|舞浜/.test(t)) return true;
  // Shared D berth course lists often mention both 4 and 12
  if (/\[12\]/.test(t) || (/\b12\b/.test(t) && /ディズニーシー|リゾート/.test(t))) return true;
  if (/ディズニーシー/.test(t) && /リゾートホテル|ホテル経由/.test(t) && !/\[4\]/.test(t)) {
    return true;
  }
  // Pure route-4 course
  if (/\[4\]/.test(t) && !/\[12\]/.test(t) && !/ホ/.test(t)) return false;
  return false;
}

function isLikelyRoute12Cell(cellText, legendText) {
  const c = cellText || '';
  const L = legendText || '';
  if (hasRoute12Mark(c) || /ホ/.test(c)) return true;
  if (/ホ/.test(L) && hasRoute12Mark(L) && /ホ/.test(c)) return true;
  // Shared D berth: unmarked / ランド / ち are route 4
  if (isRoute4Cell(c)) return false;
  // Bare time digits on shared TT → 無印 = route 4
  if (/^[\d:.\s]+$/.test(c.trim())) return false;
  return false;
}

function isRoute4Cell(cellText) {
  const c = cellText || '';
  if (hasRoute12Mark(c) || /ホ/.test(c)) return false;
  if (/ランド/.test(c)) return true;
  if (/ち/.test(c) && !/市役所/.test(c)) return true;
  if (/\[4\]/.test(c)) return true;
  if (/無印/.test(c)) return true;
  // Digits-only cell = 無印 on D berth shared TT
  if (/^[\d:.\s]+$/.test(c.trim())) return true;
  return false;
}

function hardRejectCell(cellText) {
  const c = cellText || '';
  if (hasRoute12Mark(c) || /ホ/.test(c)) return null;
  if (/ランド/.test(c)) return 'route4-symbol-land';
  if (/ち/.test(c) && !/市役所/.test(c)) return 'route4-symbol-chi';
  if (/\[4\]/.test(c)) return 'route4-bracket';
  if (/無印/.test(c)) return 'route4-unmarked';
  if (/^[\d:.\s]+$/.test(c.trim())) return 'route4-unmarked-digits';
  if (ROUTE4_DEST.test(c) && !hasRoute12Mark(c)) return 'route4-dest-cell';
  return null;
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
        if (
          text === name ||
          text.includes(name) ||
          name.includes(text.replace(/\s*系統.*$/, ''))
        ) {
          found = b;
          used.add(i);
          break;
        }
      }
      ids.push(found?.id || null);
      platforms.push(found?.platform || null);
    }
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
  const routeNumber = '12';
  const dep = trip.departureBusstopId || trip.stopIds?.[0] || '';
  const dest = trip.destinationBusstopId || trip.stopIds?.[trip.stopIds.length - 1] || '';
  const service = trip.night ? 'night' : 'regular';
  if (trip.idComplete && trip.stopIds?.length) {
    return [
      routeNumber,
      dep,
      dest,
      trip.stopIds.join('>'),
      (trip.platformIds || []).map((p) => p || '').join('>'),
      service,
    ].join('|');
  }
  return [
    routeNumber,
    dep || trip.stopNames?.[0] || '',
    dest || trip.stopNames?.[trip.stopNames.length - 1] || '',
    (trip.stopNames || []).join('>'),
    (trip.platformIds || []).map((p) => p || '').join('>'),
    service,
    'name-fallback',
  ].join('|');
}

function romajiKeyFromName(name) {
  const n = normalizeStopName(name);
  if (/浦安駅入口/.test(n)) return 'urayasu';
  if (/舞浜駅/.test(n)) return 'maihama';
  if (/東京ディズニーシー/.test(n)) return 'tds';
  if (/リゾートホテルエリア・サウス|ヒルトン|グランドニッコー/.test(n)) return 'hotel-south';
  if (/リゾートホテルエリア・ノース|シェラトン|ホテルオークラ/.test(n)) return 'hotel-north';
  if (/リゾートホテル/.test(n)) return 'hotel';
  if (/ベイサイド・ステーション|ベイサイドステーション/.test(n)) return 'bayside';
  if (/運動公園/.test(n)) return 'undokoen';
  if (/千鳥車庫/.test(n)) return 'chidori';
  return (
    n.replace(/[^\u3040-\u30ff\u4e00-\u9fffa-zA-Z0-9]+/g, '-').slice(0, 24) || 'unknown'
  );
}

function proposeSystemKey(trip) {
  const first = trip.stopNames?.[0] || '';
  const last = trip.stopNames?.[trip.stopNames.length - 1] || '';
  const from = romajiKeyFromName(first);
  const to = romajiKeyFromName(last);
  // Canonical base keys
  if (from === 'urayasu' && to === 'maihama') return '12-maihama-via-resort';
  if (from === 'maihama' && to === 'urayasu') return '12-urayasu-via-resort';
  return `12-${from}-${to}`;
}

function classifyReject(systemHint, cellText, stopNames, heading) {
  const blob = [systemHint, cellText, heading, (stopNames || []).join(',')].join(' ');
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';

  if (ROUTE4_DEST.test(blob) || /東京ディズニーランド/.test(first + last)) {
    return { bucket: 'rejectedRoute4', reason: 'route4-tdl-or-chidori' };
  }
  if (/千鳥車庫/.test(blob)) {
    return { bucket: 'rejectedRoute4', reason: 'route4-chidori' };
  }

  const other = detectOtherRouteNumber(blob);
  if (other === '4' || /\[4\]|【\s*[４4]\s*系統/.test(blob)) {
    return { bucket: 'rejectedRoute4', reason: 'route-4' };
  }
  if (other && other !== '12') {
    return { bucket: 'rejectedOther', reason: `route-${other}` };
  }
  // Cell symbols without [12]
  if (isRoute4Cell(cellText) && !hasRoute12Mark(cellText) && !/ホ/.test(cellText || '')) {
    return { bucket: 'rejectedRoute4', reason: 'route4-cell-symbol' };
  }
  return null;
}

function confirmRoute12(raw, link) {
  if (raw.systemNumberHint === '12') return true;
  if (hasRoute12Mark(link.cellText)) return true;
  if (hasRoute12Mark(raw.heading || '')) return true;
  if (hasRoute12Mark(raw.title || '')) return true;
  if (hasRoute12Mark(raw.bodySnippet || '')) return true;
  // Course text alone is NOT enough — must see [12]/【１２系統】on trip page
  return false;
}

function hasResortGeometry(stopNames) {
  const names = normalizeStopNames(stopNames);
  const hasTds = names.some((n) => /東京ディズニーシー/.test(n));
  const hasHotel = names.some((n) => /リゾートホテル|ヒルトン|シェラトン|オークラ|ニッコー/.test(n));
  const hasCorridor = names.some((n) =>
    /浦安駅入口|舞浜駅|運動公園|市役所入口|サンコーポ|見明川/.test(n),
  );
  const hasTdl = names.some((n) => /東京ディズニーランド/.test(n));
  if (hasTdl) return false;
  return (hasTds || hasHotel) && hasCorridor;
}

function destPatternKey(cellText) {
  const c = cellText || '';
  if (/ホ/.test(c) || hasRoute12Mark(c)) return 'ho-12';
  if (/ランド/.test(c)) return 'land-4';
  if (/ち/.test(c)) return 'chi-4';
  if (/^[\d:.\s]+$/.test(c.trim()) || /無印/.test(c)) return 'unmarked-4';
  return 'other|' + c.slice(0, 12);
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      await page.waitForTimeout(1000);
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
  const route12 = all.filter((l) => isRoute12CourseText(l.text));
  // Also keep shared D berth courses that mention 舞浜 + 市役所 (may mix 4/12)
  const sharedD = all.filter((l) => {
    if (route12.includes(l)) return false;
    const t = l.text || '';
    const berth = l.berthLetter || extractBerthLetter(l.berth);
    if (berth === 'D' && /舞浜|ディズニー|市役所入口/.test(t)) return true;
    if (/\[4\].*\[12\]|\[12\].*\[4\]|4\s*12|12\s*4/.test(t)) return true;
    return false;
  });
  const suspectsRoute4 = all.filter((l) =>
    /\[4\]|ランド|千鳥車庫|ディズニーランド/.test(l.text || ''),
  );
  return {
    label,
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    all,
    route12: [...route12, ...sharedD],
    suspectsRoute4,
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
    out.bodySnippet = data.body.slice(0, 4000);
    out.busstopLinks = data.busstopLinks;
    const sys = (data.body.match(/【\s*([０-９0-9]+)\s*系統\s*】/) || [])[1];
    out.systemNumberHint = sys ? toAsciiDigits(sys) : null;
    // Also detect [12] in body as hint if 【系統】 missing
    if (!out.systemNumberHint && /\[12\]/.test(data.body)) out.systemNumberHint = '12';
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
        if ((/…|･･･|\.\.\./.test(t) || /無印|ホ|ランド|ち/.test(t)) && /系統|行き|止まり/.test(t)) {
          legend.push(t);
        }
        if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
        if (/\[12\]|\[4\]/.test(t) && !legend.includes(t)) legend.push(t);
      });
      const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
        const href = a.getAttribute('href');
        const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const cell = a.closest('td, li, div') || a.parentElement;
        const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
        return { href, text, cellText: cellText.slice(0, 180) };
      });
      return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 8000) };
    });
    result.legend = meta.legend;
    result.bodySnippet = meta.bodySnippet;
    const legendBlob = meta.legend.join('\n');
    result.tripLinks = meta.tripLinks
      .map((l) => ({
        ...l,
        absHref: absUrl(l.href),
        dedupeKey: tripDedupeKey(l.href),
        likely12: isLikelyRoute12Cell(l.cellText, legendBlob),
        otherRoute: detectOtherRouteNumber(l.cellText),
        destPattern: destPatternKey(l.cellText),
        isHo: /ホ/.test(l.cellText || '') || hasRoute12Mark(l.cellText || ''),
        isRoute4: isRoute4Cell(l.cellText),
      }))
      .filter((l) => l.absHref);
  } catch (e) {
    result.errors.push(String(e.message || e));
  }
  return result;
}

function pickCoverageLinks(tripLinks, maxLinks = PER_TT_CAP) {
  const scored = tripLinks.map((l, idx) => {
    let score = 0;
    const c = l.cellText || '';
    if (l.isHo || hasRoute12Mark(c)) score += 40;
    if (l.likely12) score += 20;
    if (l.isRoute4 || hardRejectCell(c)) score -= 100;
    if (l.otherRoute && l.otherRoute !== '12') score -= 50;
    if (/ランド|ち|無印/.test(c) && !/ホ/.test(c)) score -= 80;
    score += Math.max(0, 3 - Math.floor(idx / 40));
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const seenUrl = new Set();
  for (const l of scored) {
    if (l.score < 0) continue;
    if (hardRejectCell(l.cellText)) continue;
    if (!l.isHo && !hasRoute12Mark(l.cellText) && !l.likely12) continue;
    const key = l.dedupeKey || l.absHref;
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    picked.push(l);
    if (picked.length >= maxLinks) break;
  }
  // Force-include every ホ cell if under cap
  for (const l of tripLinks) {
    if (picked.length >= maxLinks) break;
    if (!l.isHo && !hasRoute12Mark(l.cellText)) continue;
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
    note:
      'Route 12 舞浜リゾート線 only. Hard reject route-4 (無印/ランド/ち/TDL/千鳥). Require 【１２系統】/[12] on trip page. Do not invent stop orders.',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    timetables: [],
    trips: [],
    unconfirmedTrips: [],
    rejected: {
      rejectedRoute4: [],
      rejectedOther: [],
    },
    tripSignatures: {},
    stopNameSignaturesSeen: {},
    candidateKeys: CANDIDATE_KEYS,
    berthsSeen: [],
    courseIdsSeen: [],
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
    console.log(
      'CHECKPOINT',
      reason,
      'trips',
      report.trips.length,
      'sigs',
      Object.keys(report.tripSignatures).length,
    );
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
    rejectedRoute4: (r.rejected?.rejectedRoute4 || []).length,
    rejectedOther: (r.rejected?.rejectedOther || []).length,
    unconfirmed: (r.unconfirmedTrips || []).length,
    courseIdsSeen: [...new Set(r.courseIdsSeen || [])],
    knownIds: { ...r.knownIds },
    elapsedMs: Date.now() - startedAt,
  };
}

function pastHardTimeout() {
  return Date.now() - startedAt >= HARD_TIMEOUT_MS;
}

function atSigCap() {
  return Object.keys(report?.tripSignatures || {}).length >= UNIQUE_SIG_CAP;
}

function harvestIdsFromTrip(trip, knownIds) {
  const targets = [
    { key: 'tds', re: /東京ディズニーシー/ },
    { key: 'hotelSouth', re: /リゾートホテルエリア・サウス|ヒルトン|グランドニッコー/ },
    { key: 'hotelNorth', re: /リゾートホテルエリア・ノース|シェラトン|オークラ/ },
    { key: 'bayside', re: /ベイサイド・ステーション|ベイサイドステーション/ },
    { key: 'undokoen', re: /運動公園/ },
    { key: 'maihama', re: /舞浜駅/ },
    { key: 'urayasu', re: /浦安駅入口/ },
  ];
  const names = trip.stopNames || [];
  const paired = trip.stopIds || [];
  for (const t of targets) {
    if (knownIds[t.key]) continue;
    for (let i = 0; i < names.length; i++) {
      if (t.re.test(names[i]) && paired[i]) {
        knownIds[t.key] = String(paired[i]).replace(/-\d+$/, '');
        console.log('ID_DISCOVER', t.key, knownIds[t.key]);
        break;
      }
    }
  }
}

function recordTrip(reportObj, trip) {
  reportObj.trips.push(trip);
  if (trip.course && !reportObj.courseIdsSeen.includes(trip.course)) {
    reportObj.courseIdsSeen.push(trip.course);
  }
  if (!reportObj.tripSignatures[trip.tripSignature]) {
    reportObj.tripSignatures[trip.tripSignature] = {
      tripSignature: trip.tripSignature,
      count: 0,
      proposedSystemKey: trip.proposedSystemKey,
      stopNames: trip.stopNames,
      stopIds: trip.stopIds,
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

  const sns = stopNamesSignature(trip.stopNames);
  reportObj.stopNameSignaturesSeen[sns] = {
    sampleUrl: trip.sampleUrl,
    proposedSystemKey: trip.proposedSystemKey,
    stopCount: trip.stopCount,
    confirmed12: true,
    course: trip.course,
  };
}

function pushReject(bucket, sample) {
  if (!report.rejected[bucket]) report.rejected[bucket] = [];
  report.rejected[bucket].push(sample);
}

async function openTripQueue(page, reportObj, toOpen, phaseLabel) {
  const openedTripKeys = new Set();
  let opened = 0;
  let skippedSig = 0;
  let failed = 0;

  for (let i = 0; i < toOpen.length; i++) {
    if (pastHardTimeout()) {
      console.log('HARD_TIMEOUT during', phaseLabel);
      reportObj.phases.push({ phase: phaseLabel, hardTimeout: true, opened, i });
      break;
    }
    if (atSigCap()) {
      console.log('UNIQUE_SIG_CAP reached', UNIQUE_SIG_CAP);
      reportObj.phases.push({ phase: phaseLabel, sigCap: true, opened, i });
      break;
    }

    const link = toOpen[i];
    const key = link.dedupeKey || link.absHref;
    if (openedTripKeys.has(key)) continue;
    openedTripKeys.add(key);

    const cellReject = hardRejectCell(link.cellText);
    if (cellReject) {
      pushReject('rejectedRoute4', {
        sampleUrl: link.absHref,
        cellText: link.cellText,
        reason: cellReject,
        dayLabel: link.dayLabel,
        terminal: link.terminal,
      });
      continue;
    }

    if (link.otherRoute && link.otherRoute !== '12' && !hasRoute12Mark(link.cellText) && !/ホ/.test(link.cellText || '')) {
      const reject = classifyReject(link.otherRoute, link.cellText, [], null);
      if (reject) {
        pushReject(reject.bucket, {
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
      console.log('SKIP_SIG', sns.slice(0, 100));
      // Still count route4 rejects if somehow a 4 trip slipped past cell filter
      continue;
    }

    const paired = pairStopIds(raw.stopNames, raw.busstopLinks);
    if (!raw.departureBusstopId && paired.stopIds[0]) raw.departureBusstopId = paired.stopIds[0];
    if (!raw.destinationBusstopId && paired.stopIds[paired.stopIds.length - 1]) {
      raw.destinationBusstopId = paired.stopIds[paired.stopIds.length - 1];
    }

    const reject = classifyReject(
      raw.systemNumberHint,
      link.cellText,
      raw.stopNames,
      raw.heading,
    );

    // Hard reject non-12 system hint
    if (raw.systemNumberHint && raw.systemNumberHint !== '12') {
      const bucket = raw.systemNumberHint === '4' ? 'rejectedRoute4' : 'rejectedOther';
      pushReject(bucket, {
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        systemNumberHint: raw.systemNumberHint,
        cellText: link.cellText,
        reason: `sys-${raw.systemNumberHint}`,
        heading: raw.heading,
        course: raw.course,
      });
      console.log('REJECT sys', raw.systemNumberHint);
      continue;
    }

    if (reject) {
      pushReject(reject.bucket, {
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        systemNumberHint: raw.systemNumberHint,
        cellText: link.cellText,
        reason: reject.reason,
        heading: raw.heading,
        course: raw.course,
      });
      console.log('REJECT', reject.reason);
      continue;
    }

    // TDL anywhere in stop list → route 4 contamination
    if (raw.stopNames.some((n) => /東京ディズニーランド/.test(n))) {
      pushReject('rejectedRoute4', {
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        reason: 'tdl-in-stop-list',
        cellText: link.cellText,
        course: raw.course,
      });
      continue;
    }

    const confirmed12 = confirmRoute12(raw, link);
    if (!confirmed12) {
      reportObj.unconfirmedTrips.push({
        sampleUrl: link.absHref,
        stopNames: raw.stopNames,
        cellText: link.cellText,
        heading: raw.heading,
        title: raw.title,
        systemNumberHint: raw.systemNumberHint,
        course: raw.course,
        reason: 'no-[12]-or-【１２系統】-on-trip-page',
        hasResortGeometry: hasResortGeometry(raw.stopNames),
      });
      console.log(
        'SKIP_UNCONFIRMED',
        raw.stopNames[0],
        '->',
        raw.stopNames[raw.stopNames.length - 1],
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
      confirmed12: true,
      night: false,
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
      busstopLinks: (raw.busstopLinks || []).slice(0, 40),
      proposedSystemKey: null,
      tripSignature: null,
      timetableSymbol: /ホ/.test(link.cellText || '') ? 'ホ' : null,
      errors: raw.errors,
    };
    trip.proposedSystemKey = proposeSystemKey(trip);
    trip.tripSignature = buildTripSignature(trip);

    recordTrip(reportObj, trip);
    harvestIdsFromTrip(trip, reportObj.knownIds);
    opened += 1;
    console.log(
      'GOT',
      trip.proposedSystemKey,
      trip.stopCount,
      trip.stopNames[0],
      '->',
      trip.stopNames[trip.stopNames.length - 1],
      'course',
      trip.course,
      trip.idComplete ? 'idsOK' : 'idsPARTIAL',
    );

    if (reportObj.trips.length % CHECKPOINT_EVERY === 0) {
      flushPartial(`every-${CHECKPOINT_EVERY}-trips`);
    }
  }

  reportObj.phases.push({
    phase: phaseLabel,
    queued: toOpen.length,
    opened,
    skippedSig,
    failed,
  });
  return { opened, skippedSig, failed };
}

async function collectJobsForTerminals(page, reportObj, terminalPlan, phaseLabel) {
  const allPicked = [];
  const timetableJobs = [];

  for (const term of terminalPlan) {
    if (!term.id) continue;
    if (pastHardTimeout()) break;
    console.log('COURSES', term.label, term.id);
    const courses = await listCourses(page, term.id, term.label);
    reportObj.terminals[term.key] = courses;
    console.log('  route12/shared courses:', courses.route12.length);
    for (const c of courses.route12) {
      console.log('   -', c.berthLetter || c.berth, (c.text || '').slice(0, 140));
      if (c.berthLetter || c.berth) {
        reportObj.berthsSeen.push({
          terminal: term.label,
          busstopId: term.id,
          berth: c.berthLetter || c.berth,
          courseText: c.text.slice(0, 200),
        });
      }
    }
    for (const course of courses.route12.slice(0, 10)) {
      for (const day of SAMPLE_DATES) {
        timetableJobs.push({
          term,
          course,
          day,
          url: withDatetime(course.absHref, day.iso, day.time),
        });
      }
    }
  }

  console.log('Timetable jobs:', timetableJobs.length, phaseLabel);

  for (const job of timetableJobs) {
    if (pastHardTimeout() || atSigCap()) break;
    const label = `${job.term.label}/${job.course.berthLetter || 'x'}/${job.day.label}`;
    console.log('TT', label);
    const tt = await collectTimetableTripLinks(page, job.url, label, job.day.label);
    tt.terminal = job.term.label;
    tt.terminalId = job.term.id;
    tt.berth = job.course.berthLetter || job.course.berth;
    tt.courseText = job.course.text;
    tt.dayIso = job.day.iso;
    reportObj.timetables.push({
      ...tt,
      tripLinks: tt.tripLinks.map((l) => ({
        absHref: l.absHref,
        dedupeKey: l.dedupeKey,
        cellText: l.cellText,
        likely12: l.likely12,
        isHo: l.isHo,
        isRoute4: l.isRoute4,
        otherRoute: l.otherRoute,
        destPattern: l.destPattern,
      })),
    });

    // Pre-count route4 cells into rejected for audit evidence (sample)
    let r4count = 0;
    for (const l of tt.tripLinks) {
      if (!l.isRoute4) continue;
      r4count += 1;
      if (r4count <= 8) {
        pushReject('rejectedRoute4', {
          sampleUrl: l.absHref,
          cellText: l.cellText,
          reason: hardRejectCell(l.cellText) || 'route4-cell',
          dayLabel: job.day.label,
          terminal: job.term.label,
          berth: tt.berth,
          preReject: true,
        });
      }
    }

    const picks = pickCoverageLinks(tt.tripLinks, PER_TT_CAP);
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
    console.log(
      '  links',
      tt.tripLinks.length,
      'ho/12',
      tt.tripLinks.filter((l) => l.isHo || l.likely12).length,
      'picked',
      picks.length,
      'r4cells',
      r4count,
    );
  }

  // Prefer ホ cells; keep one per dayKind×terminal×course when possible
  const byKey = new Map();
  for (const p of allPicked) {
    let dayKind = 'weekday';
    if (/holiday|saturday/i.test(p.dayLabel || '')) dayKind = 'holiday';
    if (/alt/i.test(p.dayLabel || '')) dayKind = 'weekday-alt';
    const mapKey = [
      p.terminal,
      p.berth || 'x',
      dayKind,
      p.destPattern || 'ho',
      // keep course identity so we don't blindly reuse stale course ids
      (p.dedupeKey || '').match(/course=([^&]+)/)?.[1] || 'c',
    ].join('|');
    if (!byKey.has(mapKey)) byKey.set(mapKey, p);
  }
  let toOpen = [...byKey.values()];
  // Also keep ALL remaining ホ links (URL-deduped) up to a soft cap
  const seen = new Set(toOpen.map((p) => p.dedupeKey || p.absHref));
  for (const p of allPicked) {
    if (!(p.isHo || hasRoute12Mark(p.cellText))) continue;
    const k = p.dedupeKey || p.absHref;
    if (seen.has(k)) continue;
    seen.add(k);
    toOpen.push(p);
    if (toOpen.length >= 80) break;
  }

  console.log('Unique trips to open:', toOpen.length, phaseLabel);
  return toOpen;
}

async function main() {
  report = emptyReport();

  const onSignal = (sig) => {
    try {
      flushPartial(sig);
      if (report) {
        report.stats = computeStats(report);
        writeJsonUtf8(RAW_PATH, report);
      }
    } catch (_) {}
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

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

    const urayasuHit = (report.searches['浦安駅入口']?.hits || []).find((h) =>
      /浦安駅入口/.test(h.text || ''),
    );
    if (urayasuHit?.id) report.knownIds.urayasu = urayasuHit.id;
    const maihamaHit = (report.searches['舞浜駅']?.hits || []).find((h) => /舞浜駅/.test(h.text || ''));
    if (maihamaHit?.id) report.knownIds.maihama = maihamaHit.id;

    report.knownIds.tds =
      pickBestId('東京ディズニーシー', /東京ディズニーシー/) || report.knownIds.tds || null;
    report.knownIds.hotelSouth =
      pickBestId('リゾートホテルエリア・サウス', /サウス|ヒルトン|ニッコー/) ||
      pickBestId('リゾートホテルエリア', /サウス/) ||
      null;
    report.knownIds.hotelNorth =
      pickBestId('リゾートホテルエリア・ノース', /ノース|シェラトン|オークラ/) ||
      pickBestId('リゾートホテルエリア', /ノース/) ||
      null;
    report.knownIds.bayside =
      pickBestId('ベイサイド・ステーション', /ベイサイド/) ||
      pickBestId('ベイサイドステーション', /ベイサイド/) ||
      null;
    report.knownIds.undokoen = pickBestId('運動公園', /^運動公園/) || null;

    console.log('KNOWN IDS', report.knownIds);

    // Phase 1: primary terminals
    const phase1 = [
      { key: 'urayasu', id: report.knownIds.urayasu, label: '浦安駅入口' },
      { key: 'maihama', id: report.knownIds.maihama, label: '舞浜駅' },
    ].filter((t) => t.id);

    const queue1 = await collectJobsForTerminals(page, report, phase1, 'phase1');
    await openTripQueue(page, report, queue1, 'phase1');
    flushPartial('after-phase1');

    // Phase 2: intermediate terminals for short-turn detection
    const phase2 = [
      { key: 'tds', id: report.knownIds.tds, label: '東京ディズニーシー' },
      { key: 'hotelSouth', id: report.knownIds.hotelSouth, label: 'リゾートホテルエリア・サウス' },
      { key: 'hotelNorth', id: report.knownIds.hotelNorth, label: 'リゾートホテルエリア・ノース' },
      { key: 'bayside', id: report.knownIds.bayside, label: 'ベイサイド・ステーション' },
      { key: 'undokoen', id: report.knownIds.undokoen, label: '運動公園' },
    ].filter((t) => t.id);

    console.log(
      'PHASE2',
      phase2.map((t) => `${t.key}:${t.id}`).join(', ') || '(none)',
    );
    if (phase2.length && !pastHardTimeout() && !atSigCap()) {
      const queue2 = await collectJobsForTerminals(page, report, phase2, 'phase2');
      await openTripQueue(page, report, queue2, 'phase2');
    }
    flushPartial('after-phase2');
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
    console.log('MAIN_ERROR', String(e.message || e));
  } finally {
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
      console.log('confirmed12_trips', report.trips.filter((t) => t.confirmed12).length);
      console.log('rejectedRoute4', report.rejected.rejectedRoute4.length);
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
