'use strict';
/**
 * PWA / service-worker check for the route-18 pack under CACHE_NAME v110.
 *
 * 1. Serve the repo over http://127.0.0.1 so the service worker can register.
 * 2. Load the app online, let the SW install and claim, then open route-18 so the
 *    on-demand pack (akemi-takasu-line-*.js/css?v=110) lands in the v110 cache.
 * 3. Assert the cache is named chidori-route-map-v110, that no older
 *    chidori-route-map-* cache survived activation, and that every route-18 pack URL
 *    is present with the ?v=110 query intact (the SW matches code assets exactly).
 * 4. Flip the context offline, reload, and re-open route-18 — the 3 systems must
 *    still resolve with the same pathHashes as the shipped bank.
 * 5. Assert the route-15 (?v=107) and route-17 (?v=109) pack cache entries are untouched.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screenshots');
const PORT = 8853;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const SYSTEMS = ['18-takasu-seaside', '18-urayasu-eki-iriguchi', '18-takasu-kita-shogakko'];
const EXPECTED_CACHE = 'chidori-route-map-v110';
const EXPECTED_LOADER_TAG = '110';
const ROUTE18_PACK = [
  './akemi-takasu-line-stop-images-v1.css?v=110',
  './akemi-takasu-line-platforms-v1.js?v=110',
  './akemi-takasu-line-path-v1.js?v=110',
  './akemi-takasu-line-path-policy-v1.js?v=110',
  './akemi-takasu-line-stop-images-v1.js?v=110',
  './akemi-takasu-line-route-v1.js?v=110',
];
const ROUTE15_PACK = [
  './shione-no-machi-line-platforms-v1.js?v=107',
  './shione-no-machi-line-path-v1.js?v=107',
  './shione-no-machi-line-route-v1.js?v=107',
];
const ROUTE17_PACK = [
  './hinode-line-17-platforms-v1.js?v=109',
  './hinode-line-17-path-v1.js?v=109',
  './hinode-line-17-route-v1.js?v=109',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function googleMapsMockSource() {
  return `(() => {
    function LatLng(lat, lng) { this._lat = Number(lat); this._lng = Number(lng); }
    LatLng.prototype.lat = function () { return this._lat; };
    LatLng.prototype.lng = function () { return this._lng; };
    function Map(el, options) { this.el = el; this.options = options || {}; }
    Map.prototype.setCenter = function () {};
    Map.prototype.setZoom = function () {};
    Map.prototype.setStreetView = function () {};
    Map.prototype.addListener = function () { return { remove() {} }; };
    function Marker(options) { this.options = options || {}; }
    Marker.prototype.setPosition = function () {};
    Marker.prototype.setMap = function () {};
    Marker.prototype.addListener = function () { return { remove() {} }; };
    function Polyline(options) { this.options = options || {}; }
    Polyline.prototype.setMap = function () {};
    Polyline.prototype.setPath = function () {};
    function StreetViewPanorama(el, options) { this.el = el; this.options = options || {}; }
    StreetViewPanorama.prototype.setPosition = function () {};
    StreetViewPanorama.prototype.setPov = function () {};
    function StreetViewService() {}
    StreetViewService.prototype.getPanorama = function (request, cb) { try { cb({ location: { latLng: request.location } }, 'OK'); } catch (e) {} };
    const googleApi = { maps: { Map, Marker, Polyline, StreetViewPanorama, StreetViewService, StreetViewStatus: { OK: 'OK' }, LatLng, Size: function () {}, Point: function () {}, SymbolPath: { CIRCLE: 0 }, event: { addListener() { return { remove() {} }; }, clearInstanceListeners() {} } } };
    window.google = googleApi;
    window.loadMaps = async function () { window.google = googleApi; return googleApi; };
  })();`;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const rel = urlPath.replace(/^\//, '');
      const filePath = path.normalize(path.join(ROOT, rel));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('nf');
        return;
      }
      let body = fs.readFileSync(filePath);
      if (rel === 'index.html') {
        let html = body.toString('utf8');
        html = html.replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
        html = html.replace('</head>', `<script>${googleMapsMockSource()}</script></head>`);
        body = Buffer.from(html, 'utf8');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function openRoute18(page) {
  await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
  await page.waitForSelector('#routeSelect', { timeout: 20000 });
  await page.selectOption('#routeSelect', 'route-18');
  await page.waitForFunction(
    () => window.AKEMI_TAKASU_LINE_ROUTE_V1 && window.AKEMI_TAKASU_LINE_PATH_V1
      && window.AKEMI_TAKASU_LINE_PLATFORMS_V1 && window.AKEMI_TAKASU_LINE_PATH_POLICY_V1,
    null, { timeout: 40000 },
  );
  await page.waitForSelector('#driveStartPause', { timeout: 25000 });
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await window.AKEMI_TAKASU_LINE_ROUTE_V1.resolveAllSystems(true); });
  await page.waitForTimeout(400);
  return page.evaluate((keys) => {
    const route = window.AKEMI_TAKASU_LINE_ROUTE_V1.ensureRoute();
    const out = {};
    for (const k of keys) {
      const sys = route.systems[k];
      out[k] = {
        stops: sys?.stops?.length || 0,
        stopNames: (sys?.stops || []).map((s) => s.name),
        pathPoints: sys?.path?.length || 0,
        pathHash: sys?.pathHash || null,
        pathSource: sys?.pathSource || null,
        pathInvalid: Boolean(sys?.pathInvalid),
      };
    }
    return out;
  }, SYSTEMS);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    expectedCacheName: EXPECTED_CACHE,
    swFileCacheName: (fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').match(/CACHE_NAME = '([^']+)'/) || [])[1],
    swLoaderTag: (fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').match(/route-assets-loader\.js\?v=(\d+)/) || [])[1],
    indexLoaderTag: (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/route-assets-loader\.js\?v=(\d+)/) || [])[1],
    failures: [],
    pass: false,
  };
  if (report.swFileCacheName !== EXPECTED_CACHE) report.failures.push(`service-worker CACHE_NAME=${report.swFileCacheName}`);
  if (report.indexLoaderTag !== EXPECTED_LOADER_TAG) report.failures.push(`index.html loader ?v=${report.indexLoaderTag}`);
  if (report.swLoaderTag !== EXPECTED_LOADER_TAG) report.failures.push(`service-worker CORE_SHELL loader ?v=${report.swLoaderTag}`);

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.failures.push(`pageerror: ${e.message || e}`));
    await page.addInitScript({ content: googleMapsMockSource() });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // pwa-install.js registers the SW itself and reloads once on controllerchange, so poll
    // from the Node side and tolerate that reload rather than registering a second worker.
    report.swRegistration = { supported: true, controlled: false, scope: null };
    for (let i = 0; i < 60; i += 1) {
      try {
        const state = await page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return { supported: false };
          const reg = await navigator.serviceWorker.getRegistration();
          return {
            supported: true,
            scope: reg?.scope || null,
            scriptURL: reg?.active?.scriptURL || null,
            controlled: Boolean(navigator.serviceWorker.controller),
          };
        });
        if (state.supported === false) { report.swRegistration = state; break; }
        report.swRegistration = state;
        if (state.controlled) break;
      } catch (e) {
        if (!/Execution context was destroyed|navigation/i.test(String(e))) throw e;
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
      await page.waitForTimeout(500);
    }
    if (!report.swRegistration.controlled) report.failures.push('service worker never took control');
    await page.waitForTimeout(1500);

    report.online = await openRoute18(page);
    await page.screenshot({ path: path.join(SHOTS, 'pwa-online-route18-sp390.png'), fullPage: false });

    // Warm the sibling packs too, so their cached versions can be asserted as untouched.
    for (const routeId of ['route-15', 'route-17']) {
      await page.selectOption('#routeSelect', routeId);
      await page.waitForTimeout(1500);
    }
    await page.selectOption('#routeSelect', 'route-18');
    await page.waitForTimeout(1200);

    report.caches = await page.evaluate(async ({ expected, pack18, pack15, pack17 }) => {
      const keys = await caches.keys();
      const cache = await caches.open(expected);
      const entries = (await cache.keys()).map((r) => r.url);
      const has = (rel) => {
        const abs = new URL(rel, location.href).href;
        return entries.includes(abs);
      };
      return {
        cacheKeys: keys,
        staleAppCaches: keys.filter((k) => k.startsWith('chidori-route-map-') && k !== expected),
        entryCount: entries.length,
        route18Present: pack18.filter(has),
        route18Missing: pack18.filter((u) => !has(u)),
        route15Present: pack15.filter(has),
        route17Present: pack17.filter(has),
        route18WrongVersion: entries.filter((u) => /akemi-takasu-line-/.test(u) && !/v=110/.test(u)),
        route15WrongVersion: entries.filter((u) => /shione-no-machi-line-/.test(u) && !/v=107/.test(u)),
        route17WrongVersion: entries.filter((u) => /hinode-line-17-/.test(u) && !/v=109/.test(u)),
        loaderWrongVersion: entries.filter((u) => /route-assets-loader\.js/.test(u) && !/v=110/.test(u)),
      };
    }, { expected: EXPECTED_CACHE, pack18: ROUTE18_PACK, pack15: ROUTE15_PACK, pack17: ROUTE17_PACK });

    if (report.caches.staleAppCaches.length) report.failures.push(`stale caches survived: ${report.caches.staleAppCaches.join(',')}`);
    if (report.caches.route18Missing.length) report.failures.push(`route-18 pack not cached: ${report.caches.route18Missing.join(',')}`);
    if (report.caches.route18WrongVersion.length) report.failures.push(`route-18 cached at wrong version: ${report.caches.route18WrongVersion.join(',')}`);
    if (report.caches.route15WrongVersion.length) report.failures.push(`route-15 cached at wrong version: ${report.caches.route15WrongVersion.join(',')}`);
    if (report.caches.route17WrongVersion.length) report.failures.push(`route-17 cached at wrong version: ${report.caches.route17WrongVersion.join(',')}`);
    if (report.caches.loaderWrongVersion.length) report.failures.push(`loader cached at wrong version: ${report.caches.loaderWrongVersion.join(',')}`);

    // Offline replay: cut the network and reload from the v110 cache only.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    report.offlineBooted = await page.evaluate(() => Boolean(document.querySelector('#routeSelect') || typeof go === 'function'));
    if (!report.offlineBooted) report.failures.push('app shell did not boot offline');
    try {
      report.offline = await openRoute18(page);
      await page.screenshot({ path: path.join(SHOTS, 'pwa-offline-route18-sp390.png'), fullPage: false });
    } catch (e) {
      report.offline = { error: String(e.message || e) };
      report.failures.push(`offline route-18 failed: ${e.message || e}`);
    }
    await context.setOffline(false);

    report.hashComparison = {};
    for (const key of SYSTEMS) {
      const expected = BUILD.systems[key].pathHash;
      const on = report.online?.[key];
      const off = report.offline?.[key];
      const entry = {
        expectedPathHash: expected,
        onlinePathHash: on?.pathHash || null,
        offlinePathHash: off?.pathHash || null,
        onlineMatches: on?.pathHash === expected,
        offlineMatches: off?.pathHash === expected,
        stopsOnline: on?.stops || 0,
        stopsOffline: off?.stops || 0,
        stopOrderIdentical: JSON.stringify(on?.stopNames || []) === JSON.stringify(off?.stopNames || []),
      };
      report.hashComparison[key] = entry;
      if (!entry.onlineMatches) report.failures.push(`${key}: online pathHash != bank`);
      if (!entry.offlineMatches) report.failures.push(`${key}: offline pathHash != bank`);
      if (!entry.stopOrderIdentical) report.failures.push(`${key}: offline stop order differs from online`);
      console.log('pwa', key, 'online', entry.onlineMatches, 'offline', entry.offlineMatches, 'stops', entry.stopsOffline);
    }
  } finally {
    await browser.close();
    server.close();
  }

  report.pass = report.failures.length === 0;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, '_pwa_offline_report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('cache', report.caches?.cacheKeys, 'entries', report.caches?.entryCount);
  console.log('route18 cached', report.caches?.route18Present?.length, '/', ROUTE18_PACK.length);
  console.log('route15 cached', report.caches?.route15Present?.length, '| route17 cached', report.caches?.route17Present?.length);
  console.log('PASS:', report.pass);
  if (report.failures.length) console.error('FAILURES', report.failures);
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
