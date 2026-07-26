/**
 * Offline: stroller 6 + wheelchair 3 + mic-guide 2
 * node _verify_study_materials_offline.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8766;

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

async function waitForSwReady(page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  }, { timeout: 45000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
}

async function walk(page, names) {
  const seen = [];
  for (let i = 0; i < names.length; i++) {
    const src = await page.getAttribute('#studySlideImage', 'src');
    const loaded = await page.evaluate(() => {
      const img = document.getElementById('studySlideImage');
      return !!(img && img.complete && img.naturalWidth > 0);
    });
    seen.push({ src, loaded });
    if (i < names.length - 1) {
      await page.locator('#studySlideNext').click();
      await page.waitForFunction(({ n, total }) => document.getElementById('studySlidePage').textContent.trim() === `${n} / ${total}`, { n: i + 2, total: names.length });
    }
  }
  return names.every((name) => seen.some((s) => (s.src || '').includes(name) && s.loaded));
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

    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    for (const id of Object.keys(DECKS)) {
      await page.locator(`[data-material-id="${id}"]`).click();
      await page.waitForSelector('#studySlideImage');
      const names = DECKS[id];
      for (let i = 0; i < names.length - 1; i++) {
        await page.locator('#studySlideNext').click();
        await page.waitForTimeout(40);
      }
      await page.locator('#studyPopCloseX').click();
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    }
    await page.locator('#back').click();
    await page.waitForSelector('.home');
    report.steps.push({ step: 'online-warm', ok: true });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]', { timeout: 15000 });
    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');

    for (const id of Object.keys(DECKS)) {
      await page.locator(`[data-material-id="${id}"]`).click();
      await page.waitForSelector('#studySlideImage');
      const ok = await walk(page, DECKS[id]);
      report.steps.push({ step: `offline-${id}`, ok });
      if (!ok) report.ok = false;
      await page.locator('#studyPopCloseX').click();
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
