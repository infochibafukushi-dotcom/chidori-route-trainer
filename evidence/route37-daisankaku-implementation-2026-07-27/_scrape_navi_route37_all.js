'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統37 大三角線 (route-37).
 * Gate 【３７系統】. Separate from route-9 (舞浜線) and other Keisei Tokyo routes at 南行徳.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const ROUTE_NUM = '37';
const SIBLING_ROUTES = ['9', '5', '6', '2', '4', '12', '14', '20', '25', '3', '23'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 35 * 60 * 1000;

const KNOWN_IDS = {
  minamigyotoku: '00020650',
  maihama: '00020617',
  tds: '00020627',
  rosetown: '00020678',
};

const SEARCH_WORDS = [
  '南行徳駅', '舞浜駅', '東京ディズニーシー', '京成ローズタウン', '豊受神社',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[37\]|【\s*37\s*系統\s*】|^37\s*\[37\]/.test(s);
};
const siblingMarks = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return SIBLING_ROUTES.filter((n) => {
    if (n === '37') return false;
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
      const m = t.match(/^([A-Z]|0?\d{1,2}|37)\b/);
      return m ? m[1] : t.slice(0, 20) || null;
    })();
    all.push({
      ...c,
      absHref: abs,
      berthLetter,
      siblingsInCell: siblingMarks(c.text),
      has37: hasRouteMark(c.text),
    });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route37: all.filter((l) => hasRouteMark(l.text)),
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
    lineName: '大三角線',
    note: 'Route 37 discovery. Gate 【３７系統】. Separate from route-9 (舞浜線) at shared berths.',
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
    }
    flushPartial('searches');

    const pick = (word, re) => {
      const hits = report.searches[word]?.hits || [];
      const hit = hits.find((h) => re.test(h.text)) || hits[0];
      return hit?.id || null;
    };

    const idByKey = {
      minamigyotoku: KNOWN_IDS.minamigyotoku || pick('南行徳駅', /南行徳/),
      maihama: KNOWN_IDS.maihama || pick('舞浜駅', /舞浜/),
      tds: KNOWN_IDS.tds || pick('東京ディズニーシー', /ディズニーシー/),
      rosetown: KNOWN_IDS.rosetown || pick('京成ローズタウン', /ローズタウン/),
    };

    const terminals = [
      { key: 'minamigyotoku', label: '南行徳駅', id: idByKey.minamigyotoku },
      { key: 'maihama', label: '舞浜駅', id: idByKey.maihama },
      { key: 'tds', label: '東京ディズニーシー', id: idByKey.tds },
      { key: 'rosetown', label: '京成ローズタウン', id: idByKey.rosetown },
    ].filter((t) => t.id);

    report.knownIds = { ...KNOWN_IDS, ...Object.fromEntries(terminals.map((t) => [t.key, t.id])) };
    report.terminalPlan = terminals;

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route37:', courses.route37.length, '/ mixed:', courses.mixedWithSiblings?.length || 0);
      for (const c of courses.route37) {
        report.berthsSeen.push({
          terminal: term.label, busstopId: term.id, berth: c.berthLetter || c.berth,
          courseText: (c.text || '').slice(0, 400), href: c.absHref,
          siblingsInCell: c.siblingsInCell, mixedCell: (c.siblingsInCell || []).length > 0,
        });
      }
      for (const c of courses.siblingOnly) {
        for (const sib of SIBLING_ROUTES) {
          if (new RegExp(`\\[${sib}\\]|【\\s*${sib}\\s*系統\\s*】`).test(toAsciiDigits(c.text || ''))) {
            report.rejectedSiblingCells.push({
              terminal: term.label, busstopId: term.id, berth: c.berthLetter,
              courseText: (c.text || '').slice(0, 300), href: c.absHref, gatedRoute: sib,
            });
          }
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
      route37Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route37?.length || 0), 0),
      mixedCells: report.berthsSeen.filter((b) => b.mixedCell).length,
      siblingCells: report.rejectedSiblingCells.length,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    };
    writeJsonUtf8(RAW_PATH, report);
    flushPartial('final');
    await browser.close();
  }

  console.log('=== ROUTE 37 COURSES ===');
  for (const [key, t] of Object.entries(report.terminals)) {
    for (const c of t.route37 || []) {
      console.log(key, '| berth', c.berthLetter, '|', c.text);
    }
  }
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
