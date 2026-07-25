/**
 * Stroller image-slide POP + text POP regression for materials 2/3.
 * node _verify_study_materials_ui.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const port = 8765;

const EXPECTED_SLIDES = [
  'assets/study-materials/stroller/stroller-01-arrival.png',
  'assets/study-materials/stroller/stroller-02-after-boarding.png',
  'assets/study-materials/stroller/stroller-03-fare-payment.png',
  'assets/study-materials/stroller/stroller-04-departure.png',
  'assets/study-materials/stroller/stroller-05-alighting.png',
  'assets/study-materials/stroller/stroller-06-handling-rules.png',
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

async function main() {
  for (const rel of EXPECTED_SLIDES) {
    if (!fs.existsSync(path.join(root, rel))) throw new Error('missing image ' + rel);
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
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isIgnoredError(text)) errors.push(text);
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]');
    await page.locator('[data-go="materials"]').evaluate((el) => el.click());
    await page.waitForSelector('.study-list');

    // ---- stroller image slides ----
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlideImage');
    const slideSrcs = [];
    for (let i = 0; i < 6; i++) {
      const src = await page.getAttribute('#studySlideImage', 'src');
      const pageText = (await page.textContent('#studySlidePage')).trim();
      const natural = await page.evaluate(() => {
        const img = document.getElementById('studySlideImage');
        return { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete };
      });
      slideSrcs.push(src);
      if (pageText !== `${i + 1} / 6` || !natural.complete || natural.w < 10) failed += 1;
      if (i < 5) {
        await page.locator('#studySlideNext').evaluate((el) => el.click());
        await page.waitForFunction((n) => {
          const t = document.getElementById('studySlidePage');
          return t && t.textContent.trim() === `${n} / 6`;
        }, i + 2);
      }
    }
    const nextLabel = (await page.textContent('#studySlideNext')).trim();
    const prevDisabled = await page.evaluate(() => document.getElementById('studySlidePrev').disabled);
    // go to first via prev repeatedly then check prev disabled
    for (let i = 0; i < 5; i++) await page.locator('#studySlidePrev').evaluate((el) => el.click());
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '1 / 6');
    const firstPrevDisabled = await page.evaluate(() => document.getElementById('studySlidePrev').disabled);

    // keyboard arrows
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '2 / 6');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.getElementById('studySlidePage').textContent.trim() === '1 / 6');

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.study-pop-panel--slides');
      const body = document.getElementById('studyPopBody');
      const img = document.getElementById('studySlideImage');
      const pr = panel.getBoundingClientRect();
      return {
        panelW: pr.width,
        panelH: pr.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
        imgW: img.getBoundingClientRect().width,
        objectFit: getComputedStyle(img).objectFit,
        bodyLocked: document.body.classList.contains('study-pop-open'),
      };
    });

    const orderOk = EXPECTED_SLIDES.every((s, i) => (slideSrcs[i] || '').includes(s.split('/').pop()));
    const row = {
      label,
      step: 'stroller-slides',
      slideSrcs,
      orderOk,
      nextLabelOnLast: nextLabel,
      firstPrevDisabled,
      metrics,
      errors: [...errors],
    };
    results.push(row);
    if (!orderOk || nextLabel !== '閉じる' || !firstPrevDisabled || metrics.overflowX || metrics.bodyOverflowX || metrics.objectFit !== 'contain' || !metrics.bodyLocked) {
      failed += 1;
    }

    // reopen starts at 1
    await page.locator('#studyPopCloseX').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studySlidePage');
    const reopenPage = (await page.textContent('#studySlidePage')).trim();
    results.push({ label, step: 'stroller-reopen', reopenPage });
    if (reopenPage !== '1 / 6') failed += 1;
    await page.keyboard.press('Escape');
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    // ---- text pops for 2/3 ----
    for (const material of canon.filter((m) => m.id !== 'stroller')) {
      await page.locator(`[data-material-id="${material.id}"]`).evaluate((el) => el.click());
      await page.waitForSelector('#studyPopBody > div');
      const title = (await page.textContent('#studyPopTitle')).trim();
      const blocks = await page.$$eval('#studyPopBody > div', (els) => els.map((el) => ({
        className: el.className,
        text: el.textContent,
      })));
      const expectedBlocks = material.blocks.map((block) => {
        const cls = block.type === 'heading' ? 'study-heading'
          : block.type === 'label' ? 'study-label'
            : block.type === 'sublabel' ? 'study-sublabel'
              : block.type === 'note' ? 'study-note'
                : 'study-text';
        return { className: cls, text: block.text };
      });
      const blocksMatch = blocks.length === expectedBlocks.length
        && blocks.every((b, i) => b.className === expectedBlocks[i].className && b.text === expectedBlocks[i].text);
      results.push({ label, step: `text-pop:${material.id}`, titleMatch: title === material.title, blocksMatch });
      if (title !== material.title || !blocksMatch) failed += 1;
      await page.locator('#studyPopCloseBtn').evaluate((el) => el.click());
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    }

    // history back closes stroller pop
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop');
    await page.evaluate(() => history.back());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    const stayed = await page.evaluate(() => !!document.querySelector('.study-list') && !document.querySelector('.home'));
    results.push({ label, step: 'history-back-closes-pop', stayed });
    if (!stayed) failed += 1;

    await page.locator('#back').evaluate((el) => el.click());
    await page.waitForSelector('.home');
    if (errors.length) failed += 1;
    await context.close();
  }

  await checkViewport(1280, 800, 'pc');
  await checkViewport(390, 844, 'sp');
  await checkViewport(844, 390, 'sp-landscape');

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(root, '_study_materials_ui_out.json'), JSON.stringify({ failed, results }, null, 2), 'utf8');
  console.log(JSON.stringify({ failed, count: results.length }, null, 2));
  if (failed) console.log(JSON.stringify(results.filter((r) => r.orderOk === false || r.blocksMatch === false || r.stayed === false || r.reopenPage), null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
