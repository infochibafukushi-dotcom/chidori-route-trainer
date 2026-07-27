'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統24 富士見循環線 (route-24).
 * Official source: https://transfer-cloud.navitime.biz/keiseibus-group
 *
 * Hard rules:
 *  - Never invent stop order. Only accept sequences from 個別便通過時刻表 (/stops?).
 *  - Require [24] / 【２４系統】 / 富士見 symbol evidence.
 *  - Loop route: start/end may both be 新浦安駅 but distinct stop IDs required downstream.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const ROUTE_NUM = '24';
const SIBLING_ROUTES = ['3', '11', '14', '16', '17', '18', '20', '22', '23', '25', '38'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 25 * 60 * 1000;

const KNOWN_IDS = {
  shinurayasu: '00020619',
  juntendo: '00020631',
  chuoKoen: '00020632',
  tokaiDai: '00020633',
  fujimi5: '00020634',
  mmyHashi: '00020635',
};

const SEARCH_WORDS = [
  '新浦安駅', '順天堂病院前', '中央公園', '東海大浦安高校前',
  '富士見五丁目', '見明川歩道橋', '富士見三丁目', '富士見',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[24\]|【\s*24\s*系統\s*】|^24\s*\[24\]|富士見.*【\s*24\s*系統\s*】/.test(s);
};
const siblingMarks = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return SIBLING_ROUTES.filter((n) => {
    if (n === '24') return false;
    return new RegExp(`\\[${n}\\]|【\\s*${n}\\s*系統\\s*】|^${n}\\s*\\[`).test(s);
  });
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
      const m = t.match(/^(\d{1,2}|[A-Z]|0?\d{1,2})\b/);
      return m ? m[1] : t.slice(0, 20) || null;
    })();
    all.push({
      ...c,
      absHref: abs,
      berthLetter,
      siblingsInCell: siblingMarks(c.text),
      has24: hasRouteMark(c.text),
    });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route24: all.filter((l) => hasRouteMark(l.text)),
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
    lineName: '富士見循環線',
    note: 'Route 24 loop discovery. Gate 【２４系統】/富士見 symbol. Berth 24 at 新浦安駅 00020619.',
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
      shinurayasu: KNOWN_IDS.shinurayasu || pick('新浦安駅', /^新浦安駅/),
      juntendo: pick('順天堂病院前', /順天堂病院前/),
      chuoKoen: pick('中央公園', /^中央公園/),
      tokaiDai: pick('東海大浦安高校前', /東海大浦安高校前/),
      fujimi5: pick('富士見五丁目', /富士見五丁目/),
      mmyHashi: pick('見明川歩道橋', /見明川歩道橋/),
    };
    Object.assign(report.knownIds, idByKey);

    const terminalPlan = [
      { key: 'shinurayasu', id: idByKey.shinurayasu, label: '新浦安駅' },
      { key: 'juntendo', id: idByKey.juntendo, label: '順天堂病院前' },
      { key: 'chuoKoen', id: idByKey.chuoKoen, label: '中央公園' },
      { key: 'tokaiDai', id: idByKey.tokaiDai, label: '東海大浦安高校前' },
      { key: 'fujimi5', id: idByKey.fujimi5, label: '富士見五丁目' },
      { key: 'mmyHashi', id: idByKey.mmyHashi, label: '見明川歩道橋' },
    ].filter((t) => t.id);
    report.terminalPlan = terminalPlan;

    for (const term of terminalPlan) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      report.terminals[term.key] = await listCourses(page, term.id, term.label);
      const r24 = report.terminals[term.key].route24 || [];
      console.log('  route24 links', r24.length, r24.map((l) => l.berthLetter).join(','));
      for (const l of r24) {
        if (!report.berthsSeen.includes(l.berthLetter)) report.berthsSeen.push(l.berthLetter);
      }
      flushPartial(`terminal-${term.key}`);
    }

    report.stats = {
      searchCount: Object.keys(report.searches).length,
      terminalCount: terminalPlan.length,
      route24LinkCount: Object.values(report.terminals).reduce((n, t) => n + (t.route24?.length || 0), 0),
      berthCount: report.berthsSeen.length,
    };
    writeJsonUtf8(RAW_PATH, report);
    writeJsonUtf8(PARTIAL_PATH, report);
    console.log('DONE', JSON.stringify(report.stats));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  if (report) {
    report.errors.push(String(e.message || e));
    writeJsonUtf8(PARTIAL_PATH, report);
  }
  process.exit(1);
});
