'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
  const out = { tries: [] };
  for (const word of ['舞浜駅', '千鳥車庫', '千鳥北', '運動公園', 'クリーンセンター']) {
    const urls = [
      `${BASE}/busstops?word=${encodeURIComponent(word)}`,
      `${BASE}/busstops?name=${encodeURIComponent(word)}`,
      `${BASE}/busstops?word=${encodeURIComponent(word)}&area=`,
    ];
    for (const u of urls) {
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1200);
      const hits = await p.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .slice(0, 8)
          .map((a) => ({ href: a.getAttribute('href'), t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100) }))
      );
      const body = (await p.locator('body').innerText()).slice(0, 400);
      out.tries.push({ word, u, n: hits.length, hits, title: await p.title(), body });
      console.log(word, 'n=', hits.length, hits.slice(0, 2).map((h) => h.t).join(' | '));
      if (hits.length) break;
    }
  }
  // Direct known maihama from baycity legacy if any
  await p.goto(`${BASE}/courses?busstop=00020611`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1000);
  out.probe00020611 = {
    title: await p.title(),
    body: (await p.locator('body').innerText()).slice(0, 500),
  };
  fs.writeFileSync(__dirname + '/_debug_busstop_search.json', JSON.stringify(out, null, 2), 'utf8');
  await b.close();
  console.log('wrote _debug_busstop_search.json');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
