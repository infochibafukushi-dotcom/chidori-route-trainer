/**
 * v76 PWA shell verification (local static server).
 * Does NOT claim Android WebAPK pass — only browser SW behavior.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PORT = 8760;
const BASE = `http://127.0.0.1:${PORT}`;

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer(state) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (state.hang) {
        // Leave request pending forever (simulates Android fetch stall).
        return;
      }
      const url = new URL(req.url, BASE);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const filePath = path.join(ROOT, rel.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const report = { checks: [], errors: [] };
  const state = { hang: false };
  const server = await startServer(state);
  const browser = await chromium.launch({ headless: true });
  try {
    const swSrc = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    assert(/chidori-route-map-v76/.test(swSrc), 'CACHE_NAME not v76');
    assert(/APP_INDEX_URL/.test(swSrc), 'missing APP_INDEX_URL');
    assert(/handleNavigation/.test(swSrc), 'missing handleNavigation');
    assert(/fetchWithTimeout/.test(swSrc), 'missing fetchWithTimeout');
    assert(!/ROUTE_SHELL/.test(swSrc), 'ROUTE_SHELL should be removed from install path');
    assert(!/networkFirst/.test(swSrc), 'networkFirst should be gone');
    report.checks.push('static SW source OK');

    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(/manifest\.webmanifest\?v=76/.test(idx), 'manifest query not v76');
    assert(/pwa-install\.js\?v=76/.test(idx), 'pwa-install query not v76');
    assert(/__chidoriBoot/.test(idx), 'boot diag missing');
    assert(/app\.js\?v=76/.test(idx), 'app.js query not v76');
    report.checks.push('static index OK');

    const pwa = fs.readFileSync(path.join(ROOT, 'pwa-install.js'), 'utf8');
    assert(/SW_VERSION = '76'/.test(pwa), 'SW_VERSION not 76');
    report.checks.push('static pwa-install OK');

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE + '/?diag=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!document.querySelector('.home-card'), { timeout: 30000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.waitForFunction(() => !!document.querySelector('.home-card') && !!navigator.serviceWorker.controller, {
      timeout: 30000
    });

    const boot = await page.evaluate(async () => {
      const marks = window.__chidoriBoot ? window.__chidoriBoot.dump() : [];
      const cachesNames = await caches.keys();
      const cache = await caches.open(cachesNames.find((k) => k.includes('v76')) || cachesNames[0]);
      const keys = (await cache.keys()).map((r) => r.url);
      const indexAbs = new URL('./index.html', location.href).href;
      const hasIndex = keys.some((u) => u === indexAbs || /index\.html$/.test(u));
      return {
        heading: document.querySelector('h1')?.textContent || null,
        marks: marks.map((m) => m.name),
        controller: navigator.serviceWorker.controller?.scriptURL || null,
        caches: cachesNames,
        hasIndex,
        standaloneProbe: window.matchMedia('(display-mode: standalone)').matches
      };
    });
    assert(boot.heading === '千鳥路線図', 'home heading missing');
    assert(boot.marks.includes('html-reached'), 'boot html-reached missing');
    assert(boot.marks.includes('render') || boot.marks.includes('render-dom'), 'boot render missing');
    assert(/service-worker\.js\?v=76/.test(boot.controller || ''), 'controller not v76');
    assert(boot.caches.includes('chidori-route-map-v76'), 'v76 cache missing');
    assert(boot.hasIndex, 'APP_INDEX not cached');
    report.checks.push('online home + SW v76 OK');
    report.boot = boot;

    // Server hangs forever — navigation must still resolve from APP_INDEX cache.
    state.hang = true;
    const hungNavStarted = Date.now();
    await page.goto(BASE + '/?hung=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    const hungElapsed = Date.now() - hungNavStarted;
    const hungOk = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent || null,
      hasHome: !!document.querySelector('.home-card')
    }));
    assert(hungOk.hasHome && hungOk.heading === '千鳥路線図', 'hung nav did not serve cached shell');
    assert(hungElapsed < 5000, 'hung nav took too long: ' + hungElapsed);
    report.checks.push('hung navigation served cache quickly (' + hungElapsed + 'ms)');
    state.hang = false;

    // Offline reload
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    const offline = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent || null,
      hasHome: !!document.querySelector('.home-card'),
      body: (document.body?.innerText || '').slice(0, 80)
    }));
    assert(offline.hasHome || /オフライン/.test(offline.body), 'offline did not show shell or fallback');
    report.checks.push('offline navigation OK');
    await context.setOffline(false);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.home-card', { timeout: 20000 });
    await page.click('.home-card--routes');
    await page.waitForTimeout(1500);
    report.checks.push('routes navigation clicked');

    report.consoleErrors = consoleErrors.slice(0, 20);
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.errors.push(String(error && error.stack || error));
  } finally {
    await browser.close();
    server.close();
  }

  const out = path.join(ROOT, '_pwa_v76_verify_report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
})();
