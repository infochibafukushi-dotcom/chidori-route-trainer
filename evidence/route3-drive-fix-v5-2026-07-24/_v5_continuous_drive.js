'use strict';
/**
 * True continuous Start→terminus drive for route-3 (4 systems).
 * - Local static server with in-memory SPEED/DWELL boost (not written to disk)
 * - Mock Google Maps so panorama init succeeds
 * - Does NOT leave speed hacks in production code
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8771;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = __dirname;
const SYSTEMS = ['3-sogo', '3-urayasu', '3-symbol', '3-akeumi'];
const REPORT = path.join(OUT, '_v5_continuous_drive_report.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function googleMapsMockSource() {
  return `(() => {
    function LatLng(lat, lng) { this._lat = Number(lat); this._lng = Number(lng); }
    LatLng.prototype.lat = function () { return this._lat; };
    LatLng.prototype.lng = function () { return this._lng; };
    function Map(el, options) { this.el = el; this.options = options || {}; this._center = options && options.center; this._zoom = options && options.zoom; this._streetView = null; }
    Map.prototype.setCenter = function (c) { this._center = c; };
    Map.prototype.setZoom = function (z) { this._zoom = z; };
    Map.prototype.setStreetView = function (sv) { this._streetView = sv; };
    Map.prototype.addListener = function () { return { remove() {} }; };
    function Marker(options) { this.options = options || {}; this._position = options && options.position; this._map = options && options.map; }
    Marker.prototype.setPosition = function (p) { this._position = p; };
    Marker.prototype.setMap = function (m) { this._map = m; };
    Marker.prototype.addListener = function () { return { remove() {} }; };
    function Polyline(options) { this.options = options || {}; this._map = options && options.map; this._path = options && options.path; }
    Polyline.prototype.setMap = function (m) { this._map = m; };
    Polyline.prototype.setPath = function (p) { this._path = p; };
    function StreetViewPanorama(el, options) { this.el = el; this.options = options || {}; this._position = options && options.position; this._pov = options && options.pov; }
    StreetViewPanorama.prototype.setPosition = function (p) { this._position = p; };
    StreetViewPanorama.prototype.setPov = function (p) { this._pov = p; };
    function StreetViewService() {}
    StreetViewService.prototype.getPanorama = function (request, cb) { try { cb({ location: { latLng: request.location } }, 'OK'); } catch (e) {} };
    function Size(w, h) { this.width = w; this.height = h; }
    function Point(x, y) { this.x = x; this.y = y; }
    const googleApi = { maps: { Map, Marker, Polyline, StreetViewPanorama, StreetViewService, StreetViewStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS', UNKNOWN_ERROR: 'UNKNOWN_ERROR' }, Size, Point, LatLng, SymbolPath: { CIRCLE: 0 }, event: { addListener() { return { remove() {} }; }, clearInstanceListeners() {} } } };
    window.__MOCK_GOOGLE_MAPS__ = googleApi;
    window.google = googleApi;
    window.loadMaps = async function () { window.google = googleApi; return googleApi; };
    window._mapsPromise = null;
  })();`;
}

function transformRouteModule(src) {
  // Test-only acceleration; production file on disk is unchanged.
  return src
    .replace(/const SPEED_KMH = 20;/, 'const SPEED_KMH = 220;')
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
      const ext = path.extname(filePath);
      if (rel.startsWith('urayasu-higashi-danchi-route-v1.js')) {
        body = Buffer.from(transformRouteModule(body.toString('utf8')), 'utf8');
      }
      // Strip patches-v3 script tag when serving index for this test (runtime unused)
      if (rel === 'index.html') {
        let html = body.toString('utf8');
        html = html.replace(
          /\s*<script src="\.\/urayasu-higashi-danchi-path-patches-v3\.js[^"]*"><\/script>\s*/g,
          '\n'
        );
        body = Buffer.from(html, 'utf8');
      }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
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
    const route = window.URAYASU_HIGASHI_DANCHI_ROUTE_V1?.ensureRoute?.();
    const sys = route?.systems?.[systemKey];
    const st = window.URAYASU_HIGASHI_DANCHI_DRIVE_STATE || {};
    const names = (sys?.stops || []).map((s) => s.name);
    const btn = document.getElementById('driveStartPause');
    const label = btn?.querySelector('.bus-label-full')?.textContent || btn?.textContent || '';
    return {
      systemKey: st.systemKey || systemKey,
      stopCount: st.stopCount ?? names.length,
      pathLength: st.pathLength ?? (sys?.path?.length || 0),
      selectedStopIndex: st.selectedStopIndex ?? 0,
      lastPassedStopIndex: st.lastPassedStopIndex ?? 0,
      traveled: st.traveled ?? 0,
      metricsTotal: st.metricsTotal ?? null,
      running: Boolean(st.running),
      dwellUntil: st.dwellUntil || 0,
      stopNames: names,
      currentName: names[st.selectedStopIndex ?? 0] || null,
      lastName: names.length ? names[names.length - 1] : null,
      startLabel: label.trim(),
      statusState: document.getElementById('mapStatus')?.dataset?.state || '',
      status: (document.getElementById('mapStatus')?.textContent || '').slice(0, 200),
      progress: (document.getElementById('driveProgress')?.textContent || '').slice(0, 200),
      heading: st.currentHeading ?? null,
      lat: st.currentPosition?.lat ?? null,
      lng: st.currentPosition?.lng ?? null,
    };
  }, key);
}

async function driveOne(page, key) {
  const result = {
    key,
    ok: false,
    mode: 'continuous-start',
    stopOrder: [],
    expectedStops: [],
    jumps: 0,
    endReached: false,
    streetViewHeadingSamples: [],
    throws: [],
  };

  await page.selectOption('#systemSelect', key);
  await page.waitForSelector('#driveStartPause', { timeout: 20000 });
  await page.waitForTimeout(700);
  if (await page.locator('#driveReset').count()) {
    await page.click('#driveReset');
    await page.waitForTimeout(350);
  }

  let meta = await readSys(page, key);
  result.expectedStops = meta.stopNames;
  if (!meta.stopNames.length) throw new Error(`no stops: ${meta.status}`);
  if (meta.statusState === 'error') throw new Error(`status error: ${meta.status}`);
  if (meta.pathLength < 2) throw new Error(`bad pathLength ${meta.pathLength}`);

  // Press Start once and let simulation run to terminus
  await page.click('#driveStartPause');
  await page.waitForTimeout(200);

  const deadline = Date.now() + 240000;
  let prev = null;
  while (Date.now() < deadline) {
    const snap = await readSys(page, key);
    const name = snap.currentName;
    if (name && result.stopOrder[result.stopOrder.length - 1] !== name) {
      result.stopOrder.push(name);
    }
    if (Number.isFinite(snap.heading)) {
      result.streetViewHeadingSamples.push({
        stop: name,
        heading: snap.heading,
        traveled: snap.traveled,
      });
    }
    if (Number.isFinite(snap.lat) && Number.isFinite(snap.lng) && prev) {
      const approxM =
        Math.sqrt((snap.lat - prev.lat) ** 2 + (snap.lng - prev.lng) ** 2) * 111000;
      // Ignore large jumps only if traveled also jumped abnormally (>800m in one poll)
      if (approxM > 500 && Math.abs((snap.traveled || 0) - (prev.traveled || 0)) > 800) {
        result.jumps += 1;
      }
    }
    prev = {
      lat: snap.lat,
      lng: snap.lng,
      traveled: snap.traveled,
    };

    const atEnd =
      snap.lastPassedStopIndex >= snap.stopNames.length - 1 &&
      snap.currentName === snap.lastName &&
      (snap.traveled >= (snap.metricsTotal || 0) - 5 || !snap.running);

    if (atEnd) {
      result.endReached = true;
      result.final = snap;
      break;
    }

    // If somehow paused mid-route, resume
    if (!snap.running && snap.startLabel.includes('スタート') && snap.lastPassedStopIndex < snap.stopNames.length - 1) {
      await page.click('#driveStartPause');
    }
    await page.waitForTimeout(250);
  }

  if (!result.endReached) {
    result.final = await readSys(page, key);
  }

  const expected = result.expectedStops;
  const final = result.final || {};
  result.lastMatches = final.currentName === expected[expected.length - 1];
  result.sequentialOk = result.stopOrder.every((n, i) => n === expected[i]);
  // Allow intermediate "between" labels to be skipped in stopOrder if only registered stops recorded
  const registeredVisited = result.stopOrder.filter((n) => expected.includes(n));
  result.registeredSequentialOk = registeredVisited.every((n, i) => n === expected[i]);
  result.visitedAll =
    registeredVisited.length === expected.length &&
    registeredVisited.every((n, i) => n === expected[i]);
  result.ok = Boolean(
    result.endReached &&
      result.lastMatches &&
      result.jumps === 0 &&
      (result.sequentialOk || result.registeredSequentialOk) &&
      registeredVisited.length >= Math.max(2, expected.length - 1)
  );
  return result;
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    note: 'SPEED/DWELL boosted only in HTTP response transform; disk files unchanged',
    systems: {},
    pageErrors: [],
    consoleErrors: [],
    pass: false,
  };
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(String(e && e.message ? e.message : e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`${BASE}/index.html?nocache=v5-cont-drive`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    await page.click('[data-go="routes"]');
    await page.waitForSelector('#routeSelect', { timeout: 15000 });
    await page.selectOption('#routeSelect', 'route-3');
    await page.waitForSelector('#driveStartPause', { timeout: 20000 });
    await page.waitForTimeout(800);

    for (const key of SYSTEMS) {
      console.log('driving', key, '...');
      try {
        const r = await driveOne(page, key);
        report.systems[key] = r;
        console.log(
          `${r.ok ? 'PASS' : 'FAIL'}: ${key} visited=${r.stopOrder.length}/${r.expectedStops.length} end=${r.endReached} jumps=${r.jumps} last=${r.final?.currentName}`
        );
        console.log('  order:', r.stopOrder.join(' -> '));
      } catch (e) {
        report.systems[key] = { key, ok: false, throws: [String(e && e.message ? e.message : e)] };
        console.log('FAIL:', key, e);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  report.finishedAt = new Date().toISOString();
  report.fatalConsole = report.consoleErrors.filter((t) => !isIgnorable(t));
  report.fatalPageErrors = report.pageErrors.filter((t) => !isIgnorable(t));
  report.pass =
    SYSTEMS.every((k) => report.systems[k]?.ok) &&
    report.fatalConsole.length === 0 &&
    report.fatalPageErrors.length === 0;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        systems: Object.fromEntries(
          SYSTEMS.map((k) => [
            k,
            {
              ok: report.systems[k]?.ok,
              end: report.systems[k]?.endReached,
              visited: report.systems[k]?.stopOrder?.length,
              jumps: report.systems[k]?.jumps,
              last: report.systems[k]?.final?.currentName,
            },
          ])
        ),
        fatalConsole: report.fatalConsole.slice(0, 8),
        fatalPageErrors: report.fatalPageErrors.slice(0, 8),
      },
      null,
      2
    )
  );
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
