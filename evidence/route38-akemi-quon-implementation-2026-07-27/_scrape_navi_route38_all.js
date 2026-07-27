'use strict';
/**
 * Keisei Bus Navi discovery scrape for 系統38 明海クオン線 (route-38).
 * Gate 【３８系統】 / symbol ク. Express route — boarding stops only in final systems.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const PARTIAL_PATH = path.join(OUT_DIR, '_navi_scrape_partial.json');
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');

const ROUTE_NUM = '38';
const SIBLING_ROUTES = ['18', '15', '19', '10', '22', '24'];
const GOTO_TIMEOUT_MS = 60000;
const HARD_TIMEOUT_MS = 25 * 60 * 1000;

const KNOWN_IDS = {
  shinurayasu: '00020619',
  quon: null,
  akemi_shogakko: null,
};

const SEARCH_WORDS = [
  '新浦安駅', 'クオン新浦安', '明海小学校', '明海大学前', '入船中央エステート',
  '美浜東団地', '海楽', '消防本部前',
];

const startedAt = Date.now();
let report = null;
let flushing = false;

const pastHardTimeout = () => Date.now() - startedAt > HARD_TIMEOUT_MS;
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAsciiDigits = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const hasRouteMark = (t) => {
  const s = toAsciiDigits(String(t || ''));
  return /\[38\]|【\s*38\s*系統\s*】|^38\s*\[38\]|＜急行＞.*【\s*38\s*系統\s*】/.test(s) || /ク…【\s*38\s*系統\s*】/.test(s);
};
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
            return { id: m && m[1], text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120), href };
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
      const t = String(c.berth || c.text || '').replace(/\s*地図\s*/g, ' ').trim();
      const m = t.match(/^(\d{1,2})\b/) || t.match(/^([A-Z])\b/);
      return m ? m[1] : t.slice(0, 20) || null;
    })();
    all.push({
      ...c,
      absHref: abs,
      berthLetter,
      siblingsInCell: siblingMarks(c.text),
      has38: hasRouteMark(c.text),
    });
  }
  return {
    label, busstopId, coursesUrl, title: pageInfo.title, heading: pageInfo.h,
    all,
    route38: all.filter((l) => hasRouteMark(l.text)),
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
    lineName: '明海クオン線',
    note: 'Route 38 express discovery. Gate 【３８系統】 symbol ク. Boarding stops only in systems.',
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
      shinurayasu: KNOWN_IDS.shinurayasu || pick('新浦安駅', /新浦安駅/),
      quon: pick('クオン新浦安', /クオン/) || pick('クオン新浦安', /.*/),
      akemi_shogakko: pick('明海小学校', /明海小学校/),
    };

    const terminals = [
      { key: 'shinurayasu', label: '新浦安駅', id: idByKey.shinurayasu },
      { key: 'quon', label: 'クオン新浦安', id: idByKey.quon },
      { key: 'akemi_shogakko', label: '明海小学校', id: idByKey.akemi_shogakko },
    ].filter((t) => t.id);

    report.knownIds = { ...KNOWN_IDS, ...Object.fromEntries(terminals.map((t) => [t.key, t.id])) };
    report.terminalPlan = terminals;

    for (const term of terminals) {
      if (pastHardTimeout()) break;
      console.log('COURSES', term.label, term.id);
      const courses = await listCourses(page, term.id, term.label);
      report.terminals[term.key] = courses;
      console.log('  route38:', courses.route38.length, '/ mixed:', courses.mixedWithSiblings?.length || 0);
      for (const c of courses.route38) {
        report.berthsSeen.push({ terminal: term.label, berth: c.berthLetter, text: c.text, absHref: c.absHref });
      }
      for (const c of courses.siblingOnly || []) {
        if (/38|クオン|明海小学校/.test(c.text)) continue;
        report.rejectedSiblingCells.push({ terminal: term.label, text: c.text, siblings: c.siblingsInCell });
      }
    }

    report.stats = {
      terminalCount: terminals.length,
      route38CourseLinks: report.berthsSeen.length,
      rejectedSiblingCells: report.rejectedSiblingCells.length,
    };
    writeJsonUtf8(RAW_PATH, report);
    console.log('done', JSON.stringify(report.stats));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
