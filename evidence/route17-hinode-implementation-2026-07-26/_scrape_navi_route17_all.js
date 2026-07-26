'use strict';
/**
 * Keisei Bus Navi (東京ベイシティ交通 included) discovery scrape for 系統17 日の出線 (route-17).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent a stop order. Only accept sequences read from 個別便通過時刻表 (/stops?).
 *  - Require [17] / 【１７系統】 evidence on the course/trip before accepting as a candidate.
 *  - ★ 17 と 16 の分離が最重要。16系統（プラウド新浦安パークマリーナ・海風の街経由）も
 *    日の出七丁目 発着で、中間停留所ののりばでは 16/17 が混載される。ここでは候補として拾い、
 *    系統確定は _verify_signatures.js の凡例ゲート（符号→【Ｎ系統】）で行う。
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

const ROUTE_NUM = '17';
const SIBLING_ROUTE = '16'; // プラウド新浦安パークマリーナ・海風の街経由。同じ 日の出七丁目 発着だが別系統。
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 30 * 60 * 1000;

const KNOWN_IDS = {
  shinurayasu: '00020619', // 新浦安駅
};

const SEARCH_WORDS = [
  '新浦安駅', '日の出七丁目', 'ベイシティ浦安', '日の出東', '東京電力',
  '日の出小学校', '日の出保育園入口', 'アールフォーラム', '順天堂大学',
  'プラウド新浦安パークマリーナ', '日の出中学校', '日の出西', '明海大学前', '入船中央エステート',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => /\[17\]|【\s*17\s*系統\s*】/.test(toAsciiDigits(String(t || '')));
const hasSiblingMark = (t) => /\[16\]|【\s*16\s*系統\s*】/.test(toAsciiDigits(String(t || '')));

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
    all.push({ ...c, absHref: abs, berthLetter, hasSibling16: hasSiblingMark(c.text) });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route17: all.filter((l) => hasRouteMark(l.text)),
    route16Only: all.filter((l) => hasSiblingMark(l.text) && !hasRouteMark(l.text)),
  };
}

function emptyReport() {
  return {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    routeNumber: ROUTE_NUM,
    siblingRouteNumber: SIBLING_ROUTE,
    lineName: '日の出線',
    note: 'Route 17 discovery pass. 新浦安駅の [17]（日の出東経由）コース一覧を確定する。16系統と同じ日の出七丁目発着のため凡例ゲートを後段で必須とする。',
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
      { key: 'hinodeNanachome', label: '日の出七丁目', id: pick('日の出七丁目', /日の出七丁目/) },
      { key: 'baycityUrayasu', label: 'ベイシティ浦安', id: pick('ベイシティ浦安', /ベイシティ浦安/) },
      { key: 'hinodeHigashi', label: '日の出東', id: pick('日の出東', /日の出東/) },
      { key: 'tokyoDenryoku', label: '東京電力', id: pick('東京電力', /東京電力/) },
      { key: 'proudParkMarina', label: 'プラウド新浦安パークマリーナ', id: pick('プラウド新浦安パークマリーナ', /プラウド/) },
    ].filter((t) => t.id);
    report.terminalPlan = terminals;
    console.log('TERMINALS', JSON.stringify(terminals));

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route17 courses:', courses.route17.length, '/ route16-only', courses.route16Only.length, '/ all', courses.all.length);
      for (const c of courses.all) {
        console.log('   [ALL]', c.berthLetter || c.berth, '|', (c.text || '').slice(0, 130));
      }
      for (const c of courses.route17) {
        report.berthsSeen.push({
          terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth,
          courseText: (c.text || '').slice(0, 300), href: c.absHref, hasSibling16: c.hasSibling16,
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
      route17Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route17?.length || 0), 0),
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    };
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== ROUTE 17 COURSES ===');
  for (const [key, t] of Object.entries(report.terminals)) {
    for (const c of t.route17 || []) {
      console.log(key, '| berth', c.berthLetter, '|', c.text);
    }
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
