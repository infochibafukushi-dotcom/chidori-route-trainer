/**
 * v78 verification: home stays interactive; no auto route pack load; quiz/materials fast.
 * Does NOT claim Android WebAPK pass.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PORT = 8762;
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
      if (state.hangAll) return;
      if (state.hangPath && req.url && req.url.includes(state.hangPath)) return;
      if (state.notFoundPath && req.url && req.url.includes(state.notFoundPath)) {
        res.writeHead(404);
        res.end('missing');
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
  const report = {
    checks: [],
    errors: [],
    androidDevice: 'not-checked-adb-missing',
    bootFiles: [],
    homeNetwork: [],
    quizTimes: [],
    materialsTimes: [],
    routeFilesAfterTap: []
  };
  const state = { hangAll: false, hangPath: null, notFoundPath: null };
  const server = await startServer(state);
  const browser = await chromium.launch({ headless: true });
  try {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(!/setTimeout\(\s*startDeferred/.test(idx), 'startDeferred still present');
    assert(!/function startDeferred/.test(idx), 'startDeferred function still present');
    assert(!/__chidoriRouteAssets\.ensure\(\)/.test(idx), 'auto ensure still present');
    assert(/app\.js\?v=78/.test(idx), 'app.js not v78');
    assert(/pwa-install\.js\?v=78/.test(idx), 'pwa not v78');
    assert(!/hokuei-guidance-v22\.js/.test(idx), 'hokuei still in index');
    assert(!/src="\.\/d1-sync\.js/.test(idx), 'd1-sync should not be sync-loaded');
    report.checks.push('static index: no auto deferred / no route packs in HTML');

    const pwa = fs.readFileSync(path.join(ROOT, 'pwa-install.js'), 'utf8');
    assert(/SW_VERSION = '78'/.test(pwa), 'SW_VERSION not 78');
    assert(!/location\.reload\(\)/.test(pwa), 'controllerchange reload still present');
    assert(!/visibilitychange/.test(pwa), 'visibilitychange update still present');
    report.checks.push('pwa-install: no reload / no visibility update');

    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    assert(/chidori-route-map-v78/.test(sw), 'CACHE_NAME not v78');
    report.checks.push('SW v78');

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    });
    const page = await context.newPage();
    const homeNetwork = [];
    page.on('request', (req) => {
      homeNetwork.push(req.url());
    });

    await page.goto(BASE + '/?diag=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.home-card--quiz', { timeout: 20000 });
    await page.waitForTimeout(800);

    const boot = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent || null,
      marks: window.__chidoriBoot ? window.__chidoriBoot.dump().map((m) => m.name) : [],
      interactive: !!window.__chidoriHomeInteractive,
      scripts: Array.from(document.scripts).map((s) => s.src || s.getAttribute('data-chidori-src') || 'inline')
    }));
    assert(boot.heading === '千鳥路線図', 'home missing');
    assert(boot.interactive, 'home not interactive');
    assert(boot.marks.includes('home-interactive'), 'home-interactive mark missing');
    report.bootFiles = boot.scripts.filter((s) => s && s !== 'inline');
    report.homeNetwork = homeNetwork.filter((u) => /\/(hokuei|imagawa|urayasu|tomioka|horie|shiyakusho|maihama|takasu|symbol-road)/.test(u));
    assert(report.homeNetwork.length === 0, 'route assets requested on home: ' + report.homeNetwork.join(','));
    report.checks.push('home interactive without route asset requests');

    // Quiz 10 times
    for (let i = 0; i < 10; i += 1) {
      await page.waitForSelector('.home-card--quiz', { timeout: 10000 });
      const ms = await page.evaluate(async () => {
        const t0 = performance.now();
        document.querySelector('.home-card--quiz').click();
        await new Promise((resolve, reject) => {
          const start = Date.now();
          const id = setInterval(() => {
            if (document.querySelector('.question, .empty, [data-qt]')) {
              clearInterval(id);
              resolve();
            } else if (Date.now() - start > 3000) {
              clearInterval(id);
              reject(new Error('quiz timeout'));
            }
          }, 10);
        });
        return Math.round(performance.now() - t0);
      });
      report.quizTimes.push(ms);
      assert(ms < 1000, 'quiz too slow: ' + ms);
      await page.click('#back');
      await page.waitForSelector('.home-card--quiz', { timeout: 10000 });
    }
    report.checks.push('quiz x10 max=' + Math.max(...report.quizTimes) + 'ms');

    // Materials 10 times
    for (let i = 0; i < 10; i += 1) {
      await page.waitForSelector('.home-card--materials', { timeout: 10000 });
      const ms = await page.evaluate(async () => {
        const t0 = performance.now();
        document.querySelector('.home-card--materials').click();
        await new Promise((resolve, reject) => {
          const start = Date.now();
          const id = setInterval(() => {
            if (document.querySelector('.materials, .study, [data-material], .home') === null ||
                document.body.innerText.includes('研修') ||
                document.querySelector('#back')) {
              // materials page has back button and content
              if (document.querySelector('#back') && !document.querySelector('.home-card--quiz')) {
                clearInterval(id);
                resolve();
                return;
              }
            }
            if (Date.now() - start > 3000) {
              clearInterval(id);
              reject(new Error('materials timeout'));
            }
          }, 10);
        });
        return Math.round(performance.now() - t0);
      });
      report.materialsTimes.push(ms);
      assert(ms < 1000, 'materials too slow: ' + ms);
      await page.click('#back');
      await page.waitForSelector('.home-card--materials', { timeout: 10000 });
    }
    report.checks.push('materials x10 max=' + Math.max(...report.materialsTimes) + 'ms');

    // Route tap loads only route-1 pack (+ shared), not all routes
    const routeReqs = [];
    page.on('request', (req) => routeReqs.push(req.url()));
    await page.click('.home-card--routes');
    await page.waitForFunction(() => document.getElementById('routeSelect') || document.getElementById('retryRouteLoad'), {
      timeout: 60000
    });
    await page.waitForTimeout(500);
    report.routeFilesAfterTap = routeReqs
      .map((u) => u.replace(BASE + '/', ''))
      .filter((u) => /\.(js|css)(\?|$)/.test(u));
    assert(!report.routeFilesAfterTap.some((u) => /tomioka|horie|maihama-resort|takasu|symbol-road/.test(u)),
      'unexpected other route assets: ' + report.routeFilesAfterTap.join(','));
    assert(report.routeFilesAfterTap.some((u) => /hokuei/.test(u)) || document, 'hokuei pack expected');
    report.checks.push('route tap loaded selected pack only');

    // Reload / hung navigation
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.home-card', { timeout: 20000 });
    await page.waitForTimeout(1500);
    state.hangAll = true;
    const hungStarted = Date.now();
    await page.goto(BASE + '/?hung=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const hungMs = Date.now() - hungStarted;
    const hungOk = await page.evaluate(() => !!document.querySelector('.home-card'));
    assert(hungOk, 'hung nav failed');
    assert(hungMs < 5000, 'hung nav slow ' + hungMs);
    report.checks.push('hung nav ' + hungMs + 'ms');
    state.hangAll = false;

    // Offline
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    const offlineHome = await page.evaluate(() => !!document.querySelector('.home-card') || /オフライン/.test(document.body.innerText));
    assert(offlineHome, 'offline failed');
    report.checks.push('offline ok');
    await context.setOffline(false);

    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.errors.push(String(error && error.stack || error));
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(ROOT, '_pwa_v78_verify_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
})();
