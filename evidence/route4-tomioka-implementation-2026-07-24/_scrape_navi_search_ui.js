'use strict';
/** Find Keisei Navi busstop IDs via journey search / stop name autocomplete */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return 'https://transfer-cloud.navitime.biz' + href;
}

function parseStops(body) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表|通過時刻表|ページの先頭/.test(name)) continue;
    if (!stops.length || stops[stops.length - 1].name !== name) stops.push({ time: m[1], kind: m[2], name });
  }
  return stops;
}

async function main() {
  const report = { scrapedAt: new Date().toISOString(), searches: {}, trips: {} };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Use timetable feature search
  await page.goto(`${BASE}?feature=timetable`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  for (const word of ['舞浜駅', '千鳥車庫', '東京ディズニーランド']) {
    try {
      // find input
      const filled = await page.evaluate(async (w) => {
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])')];
        const input = inputs.find((i) => /駅|バス停|出発|キーワード|名称/.test(i.placeholder || '') || i.name) || inputs[0];
        if (!input) return { ok: false, reason: 'no input', placeholders: inputs.map((i) => i.placeholder) };
        input.focus();
        input.value = w;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, placeholder: input.placeholder, name: input.name };
      }, word);
      await page.waitForTimeout(800);
      // try press Enter or click search
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(2000);
      // click any suggest
      const suggest = page.locator(`text=${word}`).first();
      if (await suggest.count()) {
        await suggest.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      const after = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        links: [...document.querySelectorAll('a[href*="busstop="]')].slice(0, 20).map((a) => ({
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: a.getAttribute('href'),
          id: (a.getAttribute('href') || '').match(/busstop=(\\d+)/)?.[1],
        })),
        body: document.body.innerText.slice(0, 1000),
      }));
      report.searches[word] = { filled, after };
      console.log('SEARCH UI', word, after.url, after.links.slice(0, 5));
    } catch (e) {
      report.searches[word] = { error: String(e.message || e) };
    }
    await page.goto(`${BASE}?feature=timetable`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  // Direct: navi map busstop list pages sometimes use /pc/maps
  // Try known pattern from other Keisei properties - fetch stop by name via HTML search endpoint
  for (const word of ['舞浜駅', '千鳥車庫', '東京ディズニーランド(Ｒ)', '東京ディズニーランド']) {
    const u = `https://transfer-cloud.navitime.biz/keiseibus-group/pc/busstops/search?word=${encodeURIComponent(word)}`;
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
      const hits = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        links: [...document.querySelectorAll('a')].slice(0, 40).map((a) => ({
          text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: a.getAttribute('href'),
        })),
        body: document.body.innerText.slice(0, 1200),
      }));
      report.searches[`pcsearch-${word}`] = hits;
      const withId = hits.links.filter((l) => /busstop=\\d+/.test(l.href || ''));
      console.log('pcsearch', word, hits.title.slice(0, 40), 'idLinks', withId.length, withId.slice(0, 5));
    } catch (e) {
      report.searches[`pcsearch-${word}`] = { error: String(e.message || e) };
    }
  }

  // Journey: from terminal name typed as freemarker - use courses by searching HTML sitemap
  // Fallback: open OSM website relation 18323875 and note stop names for inbound TDL,
  // then confirm via navi by searching each stop's courses for reverse [4].

  // Probe: 運動公園 courses (find ID via overpass node name later). For now try IDs near 00020739
  // Sweep a range? Too many. Instead use node from OSM 運動公園 platform.

  fs.writeFileSync(path.join(OUT, '_navi_search_ui.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done search ui');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
