/**
 * Light regression: home + materials + routes selector still render.
 * node _verify_study_materials_regression.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8767;
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

async function main() {
  await new Promise((resolve) => server.listen(port, resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
  });
  const page = await context.newPage();
  const report = { ok: true, steps: [] };

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home');
    report.steps.push({ step: 'home', ok: true });

    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-list');
    report.steps.push({ step: 'materials', count: await page.locator('.study-material-item').count() });

    await page.locator('#back').click();
    await page.waitForSelector('.home');

    await page.locator('[data-go="routes"]').click();
    await page.waitForSelector('#routeSelect', { timeout: 20000 });
    const options = await page.$$eval('#routeSelect option', (els) => els.map((e) => e.textContent.trim()));
    report.steps.push({ step: 'routes', options });
    const need = ['北栄', '今川', '浦安'];
    for (const n of need) {
      if (!options.some((o) => o.includes(n))) {
        report.ok = false;
        report.steps.push({ step: 'missing-route', name: n });
      }
    }

    await page.locator('#back').click();
    await page.waitForSelector('.home');
    report.steps.push({ step: 'back-home', ok: true });
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.stack || error);
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
