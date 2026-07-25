/**
 * Offline: stroller 6 slides + text materials 2/3.
 * node _verify_study_materials_offline.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8766;
const SLIDES = [
  'stroller-01-arrival.png',
  'stroller-02-after-boarding.png',
  'stroller-03-fare-payment.png',
  'stroller-04-departure.png',
  'stroller-05-alighting.png',
  'stroller-06-handling-rules.png',
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

async function waitForSwReady(page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  }, { timeout: 45000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

async function main() {
  await new Promise((resolve) => server.listen(port, resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const report = { steps: [], ok: true };

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await waitForSwReady(page);

    // Warm caches
    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    await page.locator('[data-material-id="stroller"]').click();
    await page.waitForSelector('#studySlideImage');
    for (let i = 0; i < 5; i++) {
      await page.locator('#studySlideNext').click();
      await page.waitForTimeout(80);
    }
    await page.locator('#studyPopCloseX').click();
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    await page.locator('[data-material-id="wheelchair"]').click();
    await page.waitForSelector('#studyPopBody > div');
    await page.locator('#studyPopCloseBtn').click();
    await page.locator('#back').click();
    await page.waitForSelector('.home');
    report.steps.push({ step: 'online-warm', ok: true });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]', { timeout: 15000 });
    report.steps.push({ step: 'offline-home', ok: true });

    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    await page.locator('[data-material-id="stroller"]').click();
    await page.waitForSelector('#studySlideImage');

    const seen = [];
    for (let i = 0; i < 6; i++) {
      const src = await page.getAttribute('#studySlideImage', 'src');
      const loaded = await page.evaluate(() => {
        const img = document.getElementById('studySlideImage');
        return !!(img && img.complete && img.naturalWidth > 0);
      });
      seen.push({ src, loaded });
      if (!loaded) report.ok = false;
      if (i < 5) {
        await page.locator('#studySlideNext').click();
        await page.waitForFunction((n) => document.getElementById('studySlidePage').textContent.trim() === `${n} / 6`, i + 2);
      }
    }
    const allSlides = SLIDES.every((name) => seen.some((s) => (s.src || '').includes(name) && s.loaded));
    report.steps.push({ step: 'offline-stroller-slides', seen, allSlides });
    if (!allSlides) report.ok = false;

    await page.locator('#studyPopCloseX').click();
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

    for (const id of ['wheelchair', 'mic-guide']) {
      await page.locator(`[data-material-id="${id}"]`).click();
      await page.waitForSelector('#studyPopBody > div');
      const count = await page.$$eval('#studyPopBody > div', (els) => els.length);
      report.steps.push({ step: `offline-text:${id}`, count });
      if (!count) report.ok = false;
      await page.locator('#studyPopCloseBtn').click();
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    }
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.stack || error);
  }

  fs.writeFileSync(path.join(root, '_study_materials_offline_out.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
