'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統22 若潮通り線（22千鳥東） (route-22).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent a stop order. Only accept sequences from 個別便通過時刻表 (/stops?).
 *  - Require [22] / 【２２系統】 / 22千鳥東 evidence before accepting as a candidate.
 *  - Separate from route-20 (千鳥線 / 舞浜方面) which shares 千鳥地区.
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

const ROUTE_NUM = '22';
const SIBLING_ROUTES = ['20', '9', '12', '25', '6', '14', '4', '2'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 35 * 60 * 1000;

/** Known busstop ids from prior route evidence (route-12 / route-14 / route-4). */
const KNOWN_IDS = {

  chidoriGarage: '00020620',
  shinurayasu: '00020619',

};

const SEARCH_WORDS = [
  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前',
  '千鳥車庫', '千鳥北', '千鳥東', '車庫裏', '運動公園', '舞浜三丁目',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[22\]|【\s*22\s*系統\s*】|^22\s*\[22\]|^22千鳥|22千鳥東/.test(s);
};
const siblingMarks = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return SIBLING_ROUTES.filter((n) => {
    if (n === '22') return false;
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
      has22: hasRouteMark(c.text),
    });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route22: all.filter((l) => hasRouteMark(l.text)),
    siblingOnly: all.filter((l) => siblingMarks(l.text).length && !hasRouteMark(l.text)),
    mixedWithSiblings: all.filter((l) => hasRouteMark(l.text) && siblingMarks(l.text).length),
  };
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    routeNumber: ROUTE_NUM,
    siblingRouteNumbers: SIBLING_ROUTES,
    lineName: '若潮通り線',
    note: 'Route 22 discovery (22千鳥東). Gate 【２２系統】. Separate from [20] 千鳥線.',
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
      chidoriGarage: KNOWN_IDS.chidoriGarage || pick('千鳥車庫', /千鳥車庫/),
      chidoriKita: pick('千鳥北', /千鳥北/),
      chidoriHigashi: pick('千鳥東', /千鳥東/),
      wakashio: pick('若潮公園', /若潮公園/),
      juntendo: pick('順天堂病院前', /順天堂病院前/),
      shinurayasu: KNOWN_IDS.shinurayasu || pick('新浦安駅', /新浦安駅/),
    };

    const terminals = [
      { key: 'shinurayasu', label: '新浦安駅', id: idByKey.shinurayasu },
      { key: 'chidoriGarage', label: '千鳥車庫', id: idByKey.chidoriGarage },
      { key: 'chidoriKita', label: '千鳥北', id: idByKey.chidoriKita },
      { key: 'chidoriHigashi', label: '千鳥東', id: idByKey.chidoriHigashi },
      { key: 'wakashio', label: '若潮公園', id: idByKey.wakashio },
      { key: 'juntendo', label: '順天堂病院前', id: idByKey.juntendo },
    ].filter((t) => t.id);

    report.knownIds = { ...KNOWN_IDS, ...Object.fromEntries(terminals.map((t) => [t.key, t.id])) };
    report.terminalPlan = terminals;
    console.log('TERMINALS', JSON.stringify(terminals));

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route22:', courses.route22.length, '/ mixed:', courses.mixedWithSiblings?.length || 0, '/ sibling-only:', courses.siblingOnly.length, '/ all:', courses.all.length);
      for (const c of courses.all) {
        console.log('   [ALL]', c.berthLetter || c.berth, '| 22=', c.has22, '| sib=', (c.siblingsInCell || []).join(','), '|', (c.text || '').slice(0, 160));
      }
      for (const c of courses.route22) {
        report.berthsSeen.push({
          terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth,
          courseText: (c.text || '').slice(0, 400), href: c.absHref,
          siblingsInCell: c.siblingsInCell, mixedCell: (c.siblingsInCell || []).length > 0,
        });
      }
      for (const c of courses.siblingOnly) {
        if (/\[20\]|【\s*20\s*系統|20千鳥/.test(toAsciiDigits(c.text || ''))) {
          report.rejectedSiblingCells.push({
            terminal: term.label, busstopId: term.id, berth: c.berthLetter,
            courseText: (c.text || '').slice(0, 300), href: c.absHref, gatedRoute: '20',
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
      route22Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route22?.length || 0), 0),
      mixedCells: report.berthsSeen.filter((b) => b.mixedCell).length,
      sibling20Cells: report.rejectedSiblingCells.length,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    };
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== ROUTE 22 COURSES ===');
  for (const [key, t] of Object.entries(report.terminals)) {
    for (const c of t.route22 || []) {
      console.log(key, '| berth', c.berthLetter, '| siblings', (c.siblingsInCell || []).join(','), '|', c.text);
    }
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
