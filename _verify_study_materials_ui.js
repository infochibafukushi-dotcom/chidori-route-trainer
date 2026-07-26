/**
 * Image-slide POP (stroller 6 / wheelchair 3) + mic-guide text POP.
 * node _verify_study_materials_ui.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const port = 8765;

const STROLLER = [
  'stroller-01-arrival.png',
  'stroller-02-after-boarding.png',
  'stroller-03-fare-payment.png',
  'stroller-04-departure.png',
  'stroller-05-alighting.png',
  'stroller-06-handling-rules.png',
];

const WHEELCHAIR = [
  'wheelchair-01-departure-check.png',
  'wheelchair-02-boarding.png',
  'wheelchair-03-alighting.png',
];

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

function loadCanon() {
  const code = fs.readFileSync(path.join(root, 'study-materials-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.STUDY_MATERIALS;
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

async function main() {
  for (const name of STROLLER) {
    if (!fs.existsSync(path.join(root, 'assets/study-materials/stroller', name))) throw new Error('missing ' + name);
  }
  for (const name of WHEELCHAIR) {
    if (!fs.existsSync(path.join(root, 'assets/study-materials/wheelchair', name))) throw new Error('missing ' + name);
  }

  const canon = loadCanon();
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

    // wheelchair slides
    await page.locator('[data-material-id="wheelchair"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlideImage');
    const wc = await walkSlides(page, WHEELCHAIR);
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.study-pop-panel--slides');
      const body = document.getElementById('studyPopBody');
      const img = document.getElementById('studySlideImage');
      const pr = panel.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      return {
        panelW: +pr.width.toFixed(1),
        panelH: +pr.height.toFixed(1),
        imgW: +ir.width.toFixed(1),
        imgH: +ir.height.toFixed(1),
        vw: window.innerWidth,
        vh: window.innerHeight,
        sideGap: +(window.innerWidth - pr.width).toFixed(1),
        heightRatio: +(pr.height / window.innerHeight).toFixed(3),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
        imgFillRatio: +(ir.width / pr.width).toFixed(3),
        objectFit: getComputedStyle(img).objectFit,
      };
    });
    const phoneOk = label === 'sp-landscape'
      ? metrics.panelW <= 760 + 1 && metrics.heightRatio <= 0.96 && metrics.imgFillRatio >= 0.9
      : label.startsWith('sp')
        ? metrics.sideGap >= 12 && metrics.sideGap <= 28 && metrics.heightRatio <= 0.96 && metrics.imgFillRatio >= 0.9
        : metrics.panelW <= 760 + 1;
    results.push({ label, step: 'wheelchair', ok: wc.ok, metrics, phoneOk, nextLabel: wc.nextLabel });
    if (!wc.ok || !phoneOk || metrics.overflowX || metrics.bodyOverflowX || metrics.objectFit !== 'contain') failed += 1;

    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    await page.locator('[data-material-id="wheelchair"]').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '1 / 3');
    results.push({ label, step: 'wheelchair-reopen', page: (await page.textContent('#studySlidePage')).trim() });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    // stroller regression (6)
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlideImage');
    const st = await walkSlides(page, STROLLER);
    results.push({ label, step: 'stroller', ok: st.ok, count: st.srcs.length });
    if (!st.ok) failed += 1;
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    // mic-guide text
    const mic = canon.find((m) => m.id === 'mic-guide');
    await page.locator('[data-material-id="mic-guide"]').evaluate((el) => el.click());
    await page.waitForSelector('#studyPopBody > div');
    const title = (await page.textContent('#studyPopTitle')).trim();
    const blocks = await page.$$eval('#studyPopBody > div', (els) => els.map((el) => el.textContent));
    const blocksMatch = blocks.length === mic.blocks.length
      && blocks.every((t, i) => t === mic.blocks[i].text);
    results.push({ label, step: 'mic-guide', titleMatch: title === mic.title, blocksMatch });
    if (title !== mic.title || !blocksMatch) failed += 1;
    await page.locator('#studyPopCloseBtn').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    // no state leak: open wheelchair after stroller should be 1/3
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlidePage');
    await page.locator('#studySlideNext').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '2 / 6');
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.locator('[data-material-id="wheelchair"]').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '1 / 3');
    const isolated = (await page.textContent('#studySlidePage')).trim() === '1 / 3';
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
