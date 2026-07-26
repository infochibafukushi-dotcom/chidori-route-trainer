/**
 * Slide POPs: stroller 6 / wheelchair 3 / mic-guide 2
 * node _verify_study_materials_ui.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const port = 8765;

const DECKS = {
  stroller: [
    'stroller-01-arrival.png',
    'stroller-02-after-boarding.png',
    'stroller-03-fare-payment.png',
    'stroller-04-departure.png',
    'stroller-05-alighting.png',
    'stroller-06-handling-rules.png',
  ],
  wheelchair: [
    'wheelchair-01-departure-check.png',
    'wheelchair-02-boarding.png',
    'wheelchair-03-alighting.png',
  ],
  'mic-guide': [
    'mic-guide-01-start-terminal.png',
    'mic-guide-02-safety-guidance.png',
  ],
  'bicycle-accident-prevention': [
    'bicycle-accident-prevention-three-principles.png',
  ],
  'driver-health-emergency-response': [
    'driver-health-emergency-response.png',
  ],
  'accident-response-guide': [
    'accident-response-guide.png',
  ],
  'bus-hijacking-response-manual': [
    'bus-hijacking-response-manual.png',
  ],
  'intersection-turning-safety-guide': [
    'intersection-turning-safety-guide.png',
  ],
};

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

function isIgnoredError(text) {
  return /D1 load failed|Failed to fetch|CORS policy|chidori-route-api|ERR_FAILED|net::ERR|Cannot read properties of undefined \(reading 'addEventListener'\)/i.test(text);
}

async function walkSlides(page, names) {
  const srcs = [];
  for (let i = 0; i < names.length; i++) {
    const src = await page.getAttribute('#studySlideImage', 'src');
    const pageText = (await page.textContent('#studySlidePage')).trim();
    const loaded = await page.evaluate(() => {
      const img = document.getElementById('studySlideImage');
      return !!(img && img.complete && img.naturalWidth > 10);
    });
    srcs.push({ src, pageText, loaded });
    if (pageText !== `${i + 1} / ${names.length}` || !loaded || !(src || '').includes(names[i])) {
      return { ok: false, srcs };
    }
    if (i < names.length - 1) {
      await page.locator('#studySlideNext').evaluate((el) => el.click());
      await page.waitForFunction(({ n, total }) => {
        const t = document.getElementById('studySlidePage');
        return t && t.textContent.trim() === `${n} / ${total}`;
      }, { n: i + 2, total: names.length });
    }
  }
  const nextLabel = (await page.textContent('#studySlideNext')).trim();
  return { ok: nextLabel === '閉じる', srcs, nextLabel };
}

async function measure(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.study-pop-panel--slides');
    const header = panel.querySelector('.study-pop-header');
    const footer = panel.querySelector('.study-pop-footer--slides');
    const body = document.getElementById('studyPopBody');
    const img = document.getElementById('studySlideImage');
    const pr = panel.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    return {
      panelW: +pr.width.toFixed(1),
      panelH: +pr.height.toFixed(1),
      imgW: +ir.width.toFixed(1),
      imgH: +ir.height.toFixed(1),
      headerH: +hr.height.toFixed(1),
      footerH: +fr.height.toFixed(1),
      vw: window.innerWidth,
      vh: window.innerHeight,
      sideGap: +(window.innerWidth - pr.width).toFixed(1),
      heightRatio: +(pr.height / window.innerHeight).toFixed(3),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
      imgFillRatio: +(ir.width / pr.width).toFixed(3),
      objectFit: getComputedStyle(img).objectFit,
      bodyCanScroll: body.scrollHeight > body.clientHeight + 1,
    };
  });
}

async function main() {
  for (const [id, names] of Object.entries(DECKS)) {
    const dir = id === 'mic-guide' ? 'mic-guide'
      : id === 'bicycle-accident-prevention' ? 'bicycle'
        : id === 'driver-health-emergency-response' ? 'driver-health'
          : id === 'accident-response-guide' ? 'accident-response'
            : id === 'bus-hijacking-response-manual' ? 'bus-hijacking'
              : id === 'intersection-turning-safety-guide' ? 'intersection-turning'
                : id;
    for (const name of names) {
      const p = path.join(root, 'assets/study-materials', dir, name);
      if (!fs.existsSync(p)) throw new Error('missing ' + p);
    }
  }

  await new Promise((resolve) => server.listen(port, resolve));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = 0;

  async function checkViewport(width, height, label) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => {
      const text = String(err);
      if (!isIgnoredError(text)) errors.push(text);
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]');
    await page.locator('[data-go="materials"]').evaluate((el) => el.click());
    await page.waitForSelector('.study-list');
    const listTitles = await page.$$eval('.study-material-item .study-material-copy strong', (els) => els.map((e) => e.textContent.trim()));
    const listHints = await page.$$eval('.study-material-item .study-material-copy > span', (els) => els.map((e) => e.textContent.trim()));
    const listOk = listTitles.length === 8
      && listTitles[4] === '5. 運行中に体調の異変を感じた時の対応'
      && listTitles[5] === '6. 事故発生時の処置'
      && listTitles[6] === '7. バスジャック対応マニュアル'
      && listTitles[7] === '8. 交差点右左折時の実践要領'
      && listHints[0] === 'タップして本文を表示'
      && listHints[7].includes('減速');
    results.push({ label, step: 'list', listTitles, listHints, listOk });
    if (!listOk) failed += 1;

    // intersection-turning primary
    await page.locator('[data-material-id="intersection-turning-safety-guide"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlideImage');
    const intersection = await walkSlides(page, DECKS['intersection-turning-safety-guide']);
    const metrics = await measure(page);
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-material-id="intersection-turning-safety-guide"] .study-material-thumb');
      return !!(img && img.complete && img.naturalWidth > 0);
    });
    const thumbOnList = true;
    await page.locator('[data-material-id="intersection-turning-safety-guide"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlideImage');
    const phoneOk = label === 'sp-landscape'
      ? metrics.panelW <= 760 + 1 && metrics.heightRatio <= 0.96 && metrics.imgFillRatio >= 0.9
      : label.startsWith('sp')
        ? metrics.sideGap >= 12 && metrics.sideGap <= 28 && metrics.heightRatio <= 0.96 && metrics.imgFillRatio >= 0.9
        : metrics.panelW <= 760 + 1;
    results.push({ label, step: 'intersection-turning', ok: intersection.ok, metrics, phoneOk, thumbOnList, nextLabel: intersection.nextLabel });
    if (!intersection.ok || !phoneOk || !thumbOnList || metrics.overflowX || metrics.bodyOverflowX || metrics.objectFit !== 'contain') failed += 1;
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    // regressions for other decks
    for (const id of ['mic-guide', 'stroller', 'wheelchair', 'bicycle-accident-prevention', 'driver-health-emergency-response', 'accident-response-guide', 'bus-hijacking-response-manual']) {
      await page.locator(`[data-material-id="${id}"]`).evaluate((el) => el.click());
      await page.waitForSelector('#studySlideImage');
      const walked = await walkSlides(page, DECKS[id]);
      results.push({ label, step: id, ok: walked.ok, count: walked.srcs.length });
      if (!walked.ok) failed += 1;
      await page.locator('#studyPopCloseX').evaluate((el) => el.click());
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    }

    // no state leak across materials
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlidePage');
    await page.locator('#studySlideNext').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '2 / 6');
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.locator('[data-material-id="mic-guide"]').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '1 / 2');
    const isolated = (await page.textContent('#studySlidePage')).trim() === '1 / 2';
    results.push({ label, step: 'no-state-leak', isolated });
    if (!isolated) failed += 1;
    await page.keyboard.press('Escape');

    await page.locator('#back').evaluate((el) => el.click());
    await page.waitForSelector('.home');
    if (errors.length) failed += 1;
    await context.close();
  }

  await checkViewport(1280, 800, 'pc');
  await checkViewport(390, 844, 'sp-390');
  await checkViewport(412, 915, 'sp-412');
  await checkViewport(844, 390, 'sp-landscape');

  await browser.close();
  server.close();
  const out = { failed, results };
  fs.writeFileSync(path.join(root, '_study_materials_ui_out.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({
    failed,
    sizes: results.filter((r) => r.metrics).map((r) => ({
      label: r.label,
      panelW: r.metrics.panelW,
      imgW: r.metrics.imgW,
      sideGap: r.metrics.sideGap,
      headerH: r.metrics.headerH,
      footerH: r.metrics.footerH,
      imgFillRatio: r.metrics.imgFillRatio,
      heightRatio: r.metrics.heightRatio,
      phoneOk: r.phoneOk,
    })),
  }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
