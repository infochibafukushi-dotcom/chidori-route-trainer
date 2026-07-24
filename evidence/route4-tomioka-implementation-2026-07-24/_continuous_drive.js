'use strict';
/**
 * Continuous Start→end drive for route-4 (6 systems) + basic regression hashes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const PORT = 8772;
const SYSTEMS = [
  '4-maihama',
  '4-tdl',
  '4-chidori',
  '4-urayasu-maihama',
  '4-urayasu-tdl',
  '4-urayasu-chidori',
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
    function Map(el, options) { this.el = el; this.options = options || {}; this._streetView = null; }
    Map.prototype.setCenter = function () {};
    Map.prototype.setZoom = function () {};
    Map.prototype.setStreetView = function (sv) { this._streetView = sv; };
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

function transformRouteModule(src) {
  return src
    .replace(/const SPEED_KMH = 20;/, 'const SPEED_KMH = 240;')
    .replace(/const DWELL_MS = 3000;/, 'const DWELL_MS = 40;')
    .replace(/const DRIVE_VISUAL_MS = 900;/, 'const DRIVE_VISUAL_MS = 80;');
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
      if (rel.startsWith('tomioka-route-v1.js')) {
        body = Buffer.from(transformRouteModule(body.toString('utf8')), 'utf8');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function isIgnorable(t) {
  return /D1 load failed|CORS|workers\.dev|ERR_FAILED|Failed to load resource|InvalidKeyMapError|ApiNotActivated|Google Maps|BillingNotEnabled|RefererNotAllowed|panorama update failed/i.test(
    String(t || '')
  );
}

async function readSys(page, key) {
  return page.evaluate((systemKey) => {
    const route = window.TOMIOKA_ROUTE_V1?.ensureRoute?.();
    const sys = route?.systems?.[systemKey];
    const st = window.TOMIOKA_DRIVE_STATE || {};
    const names = (sys?.stops || []).map((s) => s.name);
    const btn = document.getElementById('driveStartPause');
    const label = btn?.querySelector('.bus-label-full')?.textContent || btn?.textContent || '';
    return {
      stopCount: names.length,
      pathLength: st.pathLength ?? (sys?.path?.length || 0),
      selectedStopIndex: st.selectedStopIndex ?? 0,
      lastPassedStopIndex: st.lastPassedStopIndex ?? 0,
      traveled: st.traveled ?? 0,
      metricsTotal: st.metricsTotal ?? null,
      running: Boolean(st.running),
      stopNames: names,
      currentName: names[st.selectedStopIndex ?? 0] || null,
      lastName: names.length ? names[names.length - 1] : null,
      startLabel: label.trim(),
      pathHash: sys?.pathHash || null,
      resolvedVersion: sys?.resolvedVersion || null,
      pathInvalid: Boolean(sys?.pathInvalid),
      statusState: document.getElementById('mapStatus')?.dataset?.state || '',
      status: (document.getElementById('mapStatus')?.textContent || '').slice(0, 200),
    };
  }, key);
}

async function driveOne(page, key) {
  const result = { key, ok: false, stopOrder: [], jumps: 0, endReached: false };
  await page.selectOption('#systemSelect', key);
  await page.waitForSelector('#driveStartPause', { timeout: 20000 });
  await page.waitForTimeout(700);
  if (await page.locator('#driveReset').count()) {
    await page.click('#driveReset');
    await page.waitForTimeout(300);
  }
  let meta = await readSys(page, key);
  result.meta = meta;
  if (!meta.stopNames.length) throw new Error(`no stops: ${meta.status}`);
  if (meta.pathInvalid || meta.pathLength < 2) throw new Error(`bad path ${meta.pathLength} invalid=${meta.pathInvalid}`);
  await page.click('#driveStartPause');
  await page.waitForTimeout(200);
  const deadline = Date.now() + 240000;
  let prev = null;
  while (Date.now() < deadline) {
    const snap = await readSys(page, key);
    if (snap.currentName && result.stopOrder.at(-1) !== snap.currentName) result.stopOrder.push(snap.currentName);
    if (Number.isFinite(snap.traveled) && prev && Math.abs(snap.traveled - prev.traveled) > 800) result.jumps += 1;
    prev = snap;
    const atEnd =
      snap.lastPassedStopIndex >= snap.stopNames.length - 1 &&
      snap.currentName === snap.lastName &&
      (snap.traveled >= (snap.metricsTotal || 0) - 5 || !snap.running);
    if (atEnd) {
      result.endReached = true;
      result.final = snap;
      break;
    }
    if (!snap.running && snap.startLabel.includes('スタート') && snap.lastPassedStopIndex < snap.stopNames.length - 1) {
      await page.click('#driveStartPause');
    }
    await page.waitForTimeout(250);
  }
  if (!result.endReached) result.final = await readSys(page, key);
  const expected = result.meta.stopNames;
  const registered = result.stopOrder.filter((n) => expected.includes(n));
  result.ok = Boolean(
    result.endReached &&
      result.final?.currentName === expected.at(-1) &&
      result.jumps === 0 &&
      registered.length >= expected.length - 1
  );
  return result;
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    systems: {},
    regression: {},
    pageErrors: [],
    consoleErrors: [],
    pass: false,
  };
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(String(e.message || e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r4`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      if (typeof go === 'function') go('routes');
    });
    await page.waitForSelector('#routeSelect', { timeout: 15000 });
    await page.selectOption('#routeSelect', 'route-4');
    await page.waitForSelector('#driveStartPause', { timeout: 20000 });
    await page.waitForTimeout(800);

    for (const key of SYSTEMS) {
      console.log('driving', key);
      try {
        const r = await driveOne(page, key);
        report.systems[key] = r;
        console.log(r.ok ? 'PASS' : 'FAIL', key, r.stopOrder.length, r.final?.currentName);
      } catch (e) {
        report.systems[key] = { key, ok: false, error: String(e.message || e) };
        console.log('FAIL', key, e.message || e);
      }
    }

    // Regression: route-3 hashes
    await page.selectOption('#routeSelect', 'route-3');
    await page.waitForTimeout(800);
    report.regression.route3 = await page.evaluate(() => {
      const r = data.routes.find((x) => x.id === 'route-3');
      const out = {};
      for (const [k, s] of Object.entries(r?.systems || {})) {
        out[k] = { path: s.path?.length, pathHash: s.pathHash, resolvedVersion: s.resolvedVersion, stops: s.stops?.length };
      }
      return out;
    });
    await page.selectOption('#routeSelect', 'route-2');
    await page.waitForTimeout(800);
    report.regression.route2 = await page.evaluate(() => {
      const r = data.routes.find((x) => x.id === 'route-2');
      const out = {};
      for (const [k, s] of Object.entries(r?.systems || {})) {
        out[k] = { path: s.path?.length, pathHash: s.pathHash, resolvedVersion: s.resolvedVersion, stops: s.stops?.length };
      }
      return out;
    });

    // UI shots
    await page.selectOption('#routeSelect', 'route-4');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'ui-pc-route4.png') });
    await context.close();

    const sp = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const spPage = await sp.newPage();
    await spPage.addInitScript({ content: googleMapsMockSource() });
    await spPage.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r4sp`, { waitUntil: 'domcontentloaded' });
    await spPage.waitForTimeout(1200);
    await spPage.evaluate(() => typeof go === 'function' && go('routes'));
    await spPage.waitForSelector('#routeSelect', { timeout: 15000 });
    await spPage.selectOption('#routeSelect', 'route-4');
    await spPage.waitForTimeout(800);
    fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
    await spPage.screenshot({ path: path.join(OUT, 'screenshots', 'ui-sp390-route4.png') });
    await sp.close();
  } finally {
    await browser.close();
    server.close();
  }

  report.fatalConsole = report.consoleErrors.filter((t) => !isIgnorable(t));
  report.fatalPageErrors = report.pageErrors.filter((t) => !isIgnorable(t));
  report.pass =
    SYSTEMS.every((k) => report.systems[k]?.ok) &&
    report.fatalConsole.length === 0 &&
    report.fatalPageErrors.length === 0;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, '_continuous_drive_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, systems: Object.fromEntries(SYSTEMS.map((k) => [k, report.systems[k]?.ok])) }, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
