'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統20 千鳥線 (route-20).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent a stop order. Only accept sequences from 個別便通過時刻表 (/stops?).
 *  - Require [20] / 【２０系統】 evidence before accepting as a candidate.
 *  - Separate from route-22 (千鳥東 / 若潮通り) which shares 千鳥地区.
 *
 * If busstop search returns 0 hits, falls back to courses?busstop=KNOWN_ID directly.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const ROUTE_NUM = '20';
const SIBLING_ROUTES = ['22', '9', '12', '25', '6', '14', '4', '2'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 35 * 60 * 1000;

/** Known busstop ids from prior route evidence (route-12 / route-14 / route-4). */
const KNOWN_IDS = {
  maihama: '00020617',
  chidoriGarage: '00020620',
  shinurayasu: '00020619',
  undokoen: '00020746',
};

const SEARCH_WORDS = [
  '舞浜駅', '千鳥車庫', '千鳥北', '千鳥中央', '千鳥西', '千鳥東',
  'クリーンセンター', '浦安斎場', '運動公園', 'オリエンタルランド本社前',
  '新浦安駅', '順天堂病院前',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[20\]|【\s*20\s*系統\s*】|^20\s*\[20\]|^20千鳥|\[20\s/.test(s);
};
const siblingMarks = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return SIBLING_ROUTES.filter((n) => {
    if (n === '20') return false;
    return new RegExp(`\\[${n}\\]|【\\s*${n}\\s*系統\\s*】|^${n}千鳥|^${n}\\s*\\[`).test(s);
  });
};

function writeJsonUtf8(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
    `${BASE}/busstops?word=${encodeURIComponent(word)}&area=`,
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
    } catch (_) { /* try next */ }
  }
  return { searchUrl: null, word, hits: [] };
}

async function listCourses(page, busstopId, label) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
  await page.waitForTimeout(1300);
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    h: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    links: [...document.querySelectorAll('a[href*="course-sequence"], a[href*="course="]')].map((a) => {
      const tr = a.closest('tr');
      const cell = tr && tr.querySelector('th, td');
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
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
      const m = t.match(/^([A-Z]|0?\d{1,2})\b/);
      return m ? m[1] : t.slice(0, 20) || null;
    })();
    all.push({
      ...c,
      absHref: abs,
      berthLetter,
      siblingsInCell: siblingMarks(c.text),
      has20: hasRouteMark(c.text),
    });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route20: all.filter((l) => hasRouteMark(l.text)),
    siblingOnly: all.filter((l) => siblingMarks(l.text).length && !hasRouteMark(l.text)),
    mixedWith20: all.filter((l) => hasRouteMark(l.text) && siblingMarks(l.text).length),
  };
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    routeNumber: ROUTE_NUM,
    siblingRouteNumbers: SIBLING_ROUTES,
    lineName: '千鳥線',
    note: 'Route 20 discovery. Separate [20] / 急行 / 直通 / 循環 from [22].',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    terminalPlan: [],
    berthsSeen: [],
    rejectedSiblingCells: [],
    errors: [],
    stats: {},
  };
}

function flushPartial(reason) {
  if (!report || flushing) return;
  flushing = true;
  try {
    report.partialFlushAt = new Date().toISOString();
    report.partialFlushReason = reason;
    writeJsonUtf8(PARTIAL_PATH, report);
    console.log('CHECKPOINT', reason);
  } catch (e) {
    console.log('CHECKPOINT_FAIL', String(e.message || e));
  } finally {
    flushing = false;
  }
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
      const hits = report.searches[word].hits || [];
      console.log('  hits', hits.length, hits.slice(0, 3).map((h) => `${h.id}:${h.text}`).join(' | '));
    }
    flushPartial('searches');

    const pick = (word, re) => {
      const hits = report.searches[word]?.hits || [];
      const hit = hits.find((h) => re.test(h.text)) || hits[0];
      return hit?.id || null;
    };

    const idByKey = {
      maihama: KNOWN_IDS.maihama || pick('舞浜駅', /舞浜駅/),
      chidoriGarage: KNOWN_IDS.chidoriGarage || pick('千鳥車庫', /千鳥車庫/),
      chidoriKita: pick('千鳥北', /千鳥北/),
      chidoriNishi: pick('千鳥西', /千鳥西/),
      chidoriHigashi: pick('千鳥東', /千鳥東/),
      cleanCenter: pick('クリーンセンター', /クリーンセンター/),
      undokoen: KNOWN_IDS.undokoen || pick('運動公園', /^運動公園/),
      shinurayasu: KNOWN_IDS.shinurayasu || pick('新浦安駅', /新浦安駅/),
    };

    const terminals = [
      { key: 'maihama', label: '舞浜駅', id: idByKey.maihama },
      { key: 'chidoriGarage', label: '千鳥車庫', id: idByKey.chidoriGarage },
      { key: 'chidoriKita', label: '千鳥北', id: idByKey.chidoriKita },
      { key: 'chidoriNishi', label: '千鳥西', id: idByKey.chidoriNishi },
      { key: 'chidoriHigashi', label: '千鳥東', id: idByKey.chidoriHigashi },
      { key: 'cleanCenter', label: 'クリーンセンター', id: idByKey.cleanCenter },
      { key: 'undokoen', label: '運動公園', id: idByKey.undokoen },
      { key: 'shinurayasu', label: '新浦安駅', id: idByKey.shinurayasu },
    ].filter((t) => t.id);

    report.knownIds = { ...KNOWN_IDS, ...Object.fromEntries(terminals.map((t) => [t.key, t.id])) };
    report.terminalPlan = terminals;
    console.log('TERMINALS', JSON.stringify(terminals));

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route20:', courses.route20.length, '/ mixed:', courses.mixedWith20?.length || 0, '/ sibling-only:', courses.siblingOnly.length, '/ all:', courses.all.length);
      for (const c of courses.all) {
        console.log('   [ALL]', c.berthLetter || c.berth, '| 20=', c.has20, '| sib=', (c.siblingsInCell || []).join(','), '|', (c.text || '').slice(0, 160));
      }
      for (const c of courses.route20) {
        report.berthsSeen.push({
          terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth,
          courseText: (c.text || '').slice(0, 400), href: c.absHref,
          siblingsInCell: c.siblingsInCell, mixedCell: (c.siblingsInCell || []).length > 0,
        });
      }
      for (const c of courses.siblingOnly) {
        if (/22千鳥東|\[22\]|【\s*22\s*系統/.test(toAsciiDigits(c.text || ''))) {
          report.rejectedSiblingCells.push({
            terminal: term.label, busstopId: term.id, berth: c.berthLetter,
            courseText: (c.text || '').slice(0, 300), href: c.absHref, gatedRoute: '22',
          });
        }
      }
      flushPartial(`courses-${term.key}`);
    }
  } catch (e) {
    report.errors.push({ fatal: String(e.message || e) });
    console.error('FATAL', e);
  } finally {
    report.stats = {
      terminals: Object.keys(report.terminals).length,
      route20Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route20?.length || 0), 0),
      mixedCells: report.berthsSeen.filter((b) => b.mixedCell).length,
      sibling22Cells: report.rejectedSiblingCells.length,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    };
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== ROUTE 20 COURSES ===');
  for (const [key, t] of Object.entries(report.terminals)) {
    for (const c of t.route20 || []) {
      console.log(key, '| berth', c.berthLetter, '| siblings', (c.siblingsInCell || []).join(','), '|', c.text);
    }
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
