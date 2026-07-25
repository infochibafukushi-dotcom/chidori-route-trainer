/**
 * Offline POP smoke: register SW, go offline, open 3 materials as POP.
 * node _verify_study_materials_offline.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8766;

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
  }, { timeout: 30000 });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
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

    // Warm shell caches by navigating materials once online
    await page.waitForSelector('[data-go="materials"]');
    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    await page.locator('[data-material-id="stroller"]').click();
    await page.waitForSelector('#studyMaterialPop');
    await page.locator('#studyPopCloseBtn').click();
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    await page.locator('#back').click();
    await page.waitForSelector('.home');
    report.steps.push({ step: 'online-warm', ok: true });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]', { timeout: 15000 });
    report.steps.push({ step: 'offline-home', ok: true });

    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    const ids = ['stroller', 'wheelchair', 'mic-guide'];
    for (const id of ids) {
      await page.locator(`[data-material-id="${id}"]`).click();
      await page.waitForSelector('#studyMaterialPop [role="dialog"]');
      const title = (await page.textContent('#studyPopTitle')).trim();
      const blockCount = await page.$$eval('#studyPopBody > div', (els) => els.length);
      const stayed = await page.evaluate(() => !!document.querySelector('.study-list'));
      report.steps.push({ step: `offline-pop:${id}`, title, blockCount, stayed });
      if (!title || !blockCount || !stayed) report.ok = false;
      await page.locator('#studyPopCloseBtn').click();
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    }

    await page.locator('#back').click();
    await page.waitForSelector('.home');
    report.steps.push({ step: 'offline-back-home', ok: true });
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
