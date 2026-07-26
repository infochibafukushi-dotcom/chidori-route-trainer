'use strict';
/**
 * Enrich _navi_scrape_raw.json with known busstop IDs and list [19] courses.
 * Known IDs from prior route-15/18 evidence + official shinurayasu URL.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const RAW = path.join(OUT, '_navi_scrape_raw.json');

const KNOWN = [
  { key: 'shinurayasu', label: '新浦安駅', id: '00020619' },
  { key: 'takasuKaihinKoen', label: '高洲海浜公園', id: '00020855' },
  { key: 'tokyoGakkan', label: '東京学館前', id: '00020721' },
  { key: 'takasu4chome', label: '高洲四丁目', id: '00020853' },
  { key: 'takasuKitaShogakko', label: '高洲北小学校', id: '00020720' },
];

const SIBLINGS = ['10', '15', '18', '25'];
const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
const has19 = (t) => /\[19\]|【\s*19\s*系統\s*】/.test(toAscii(t));
const siblingMarks = (t) => {
  const s = toAscii(t);
  return SIBLINGS.filter((n) => new RegExp(`\\[${n}\\]|【\\s*${n}\\s*系統\\s*】`).test(s));
};
const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);

async function main() {
  const report = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  })).newPage();

  for (const term of KNOWN) {
    const existing = report.terminals[term.key];
    if (existing?.route19?.length) {
      console.log('keep', term.label, 'route19', existing.route19.length);
      continue;
    }
    console.log('COURSES', term.label, term.id);
    await page.goto(`${BASE}/courses?busstop=${term.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
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
      const t = String(c.berth || '').replace(/\s*地図\s*/g, ' ').trim();
      const m = t.match(/\b([A-Z]|0?\d{1,2})\b/);
      all.push({ ...c, absHref: abs, berthLetter: m ? m[1] : t.slice(0, 20) || null, siblingsInCell: siblingMarks(c.text) });
    }
    report.terminals[term.key] = {
      label: term.label,
      busstopId: term.id,
      coursesUrl: `${BASE}/courses?busstop=${term.id}`,
      title: pageInfo.title,
      heading: pageInfo.h,
      all,
      route19: all.filter((l) => has19(l.text)),
      siblingOnly: all.filter((l) => siblingMarks(l.text).length && !has19(l.text)),
    };
    console.log('  route19', report.terminals[term.key].route19.length, '/ all', all.length);
    for (const c of report.terminals[term.key].route19) {
      console.log('   ', c.berthLetter, '|', c.text.slice(0, 160));
    }
  }

  report.terminalPlan = KNOWN;
  report.knownIds = Object.fromEntries(KNOWN.map((t) => [t.key, t.id]));
  report.stats = {
    terminals: Object.keys(report.terminals).length,
    route19Courses: Object.values(report.terminals).reduce((n, t) => n + (t.route19?.length || 0), 0),
    enrichedAt: new Date().toISOString(),
  };
  fs.writeFileSync(RAW, JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
  console.log('STATS', JSON.stringify(report.stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
