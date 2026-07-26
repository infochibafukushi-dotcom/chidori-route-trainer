'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統18 明海・高洲線 (route-18).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent a stop order. Only accept sequences read from 個別便通過時刻表 (/stops?).
 *  - Require [18] / 【１８系統】 evidence on the course/trip before accepting as a candidate.
 *  - ★ 18 と 15 / 19 / 10 / 25 の分離が最重要。新浦安駅のりばE のセルは
 *    「[15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行 [18]…（同文）… [深夜]…」と
 *    15 と 18 を同一セルに混載する。高洲海浜公園・高洲北小学校のりばでは 10/15/19 も混載される。
 *    ここでは候補を広く拾い、系統確定は _verify_signatures.js の凡例ゲート（符号→【Ｎ系統】）で行う。
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

const ROUTE_NUM = '18';
/** Systems that share stops / berths / cells with 18 and must be gated out later. */
const SIBLING_ROUTES = ['15', '19', '10', '25'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 30 * 60 * 1000;

const KNOWN_IDS = {
  shinurayasu: '00020619', // 新浦安駅（official context URL）
};

const SEARCH_WORDS = [
  '新浦安駅', '浦安駅入口', '高洲海浜公園', '高洲北小学校', '潮音の街',
  '夢海の街', '高洲橋', '高洲中央公園', '明海大学前', '海風の街',
  '消防本部前', '高洲四丁目', '高洲八丁目', '東京学館前', '入船中央エステート',
  '神明裏', '猫実', '海楽', '美浜東団地',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => /\[18\]|【\s*18\s*系統\s*】/.test(toAsciiDigits(String(t || '')));
const siblingMarks = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return SIBLING_ROUTES.filter((n) => new RegExp(`\\[${n}\\]|【\\s*${n}\\s*系統\\s*】`).test(s));
};

function writeJsonUtf8(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      await page.waitForTimeout(800);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            return { id: m && m[1], text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100), href };
          })
          .filter((x) => x.id));
      if (hits.length) return { searchUrl: u, word, hits };
    } catch (_) { /* try next form */ }
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
    all.push({ ...c, absHref: abs, berthLetter, siblingsInCell: siblingMarks(c.text) });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route18: all.filter((l) => hasRouteMark(l.text)),
    siblingOnly: all.filter((l) => siblingMarks(l.text).length && !hasRouteMark(l.text)),
  };
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    routeNumber: ROUTE_NUM,
    siblingRouteNumbers: SIBLING_ROUTES,
    lineName: '明海・高洲線',
    note: 'Route 18 discovery pass. 新浦安駅／浦安駅入口／高洲海浜公園／高洲北小学校 の [18] コース一覧を確定する。'
      + '新浦安駅のりばEでは 15 と 18 が同一セルに混載され、高洲側のりばでは 10/15/19 も混載されるため凡例ゲートを後段で必須とする。',
    knownIds: { ...KNOWN_IDS },
    searches: {},
    terminals: {},
    terminalPlan: [],
    berthsSeen: [],
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
    const terminals = [
      { key: 'shinurayasu', label: '新浦安駅', id: KNOWN_IDS.shinurayasu || pick('新浦安駅', /新浦安駅/) },
      { key: 'urayasuEkiIriguchi', label: '浦安駅入口', id: pick('浦安駅入口', /浦安駅入口/) },
      { key: 'takasuKaihinKoen', label: '高洲海浜公園', id: pick('高洲海浜公園', /高洲海浜公園/) },
      { key: 'takasuKitaShogakko', label: '高洲北小学校', id: pick('高洲北小学校', /高洲北小学校/) },
      { key: 'shioneNoMachi', label: '潮音の街', id: pick('潮音の街', /潮音の街/) },
      { key: 'yumeumiNoMachi', label: '夢海の街', id: pick('夢海の街', /夢海の街/) },
    ].filter((t) => t.id);
    report.terminalPlan = terminals;
    console.log('TERMINALS', JSON.stringify(terminals));

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route18 courses:', courses.route18.length, '/ sibling-only', courses.siblingOnly.length, '/ all', courses.all.length);
      for (const c of courses.all) {
        console.log('   [ALL]', c.berthLetter || c.berth, '|', (c.text || '').slice(0, 150));
      }
      for (const c of courses.route18) {
        report.berthsSeen.push({
          terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth,
          courseText: (c.text || '').slice(0, 300), href: c.absHref, siblingsInCell: c.siblingsInCell,
        });
      }
      flushPartial(`courses-${term.key}`);
    }
  } catch (e) {
    report.errors.push({ fatal: String(e.message || e) });
    console.error('FATAL', e);
  } finally {
    report.stats = {
      terminals: Object.keys(report.terminals).length,
      route18Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route18?.length || 0), 0),
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    };
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== ROUTE 18 COURSES ===');
  for (const [key, t] of Object.entries(report.terminals)) {
    for (const c of t.route18 || []) {
      console.log(key, '| berth', c.berthLetter, '| siblings', (c.siblingsInCell || []).join(','), '|', c.text);
    }
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
