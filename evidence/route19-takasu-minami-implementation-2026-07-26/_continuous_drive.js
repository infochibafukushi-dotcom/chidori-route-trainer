'use strict';
/**
 * Continuous drive + integrity for route-19 高洲南線.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const PORT = 8879;
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const SYSTEMS = ['19-takasu-seaside', '19-shinurayasu'];
const SIBLING_EXACT = ['みなと南', '鉄鋼団地入口', '夢海の街', '高洲橋', '潮音の街', '高洲中央公園', '高洲', '明海大学前', '海風の街'];

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

const speedUp = (src) => src
  .replace(/const SPEED_KMH = 20;/, 'const SPEED_KMH = 240;')
  .replace(/const DWELL_MS = 3000;/, 'const DWELL_MS = 40;')
  .replace(/const DRIVE_VISUAL_MS = 900;/, 'const DRIVE_VISUAL_MS = 80;');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const rel = urlPath.replace(/^\//, '');
      const filePath = path.normalize(path.join(ROOT, rel));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('nf'); return;
      }
      let body = fs.readFileSync(filePath);
      if (rel.startsWith('takasu-minami-line-route-v1.js')) body = Buffer.from(speedUp(body.toString('utf8')), 'utf8');
      if (rel === 'index.html') {
        let html = body.toString('utf8');
        html = html.replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
        html = html.replace('</head>', `<script>${googleMapsMockSource()}</script></head>`);
        body = Buffer.from(html, 'utf8');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function readSys(page, key) {
  return page.evaluate((systemKey) => {
    const api = window.TAKASU_MINAMI_LINE_ROUTE_V1;
    const route = api?.ensureRoute?.();
    const sys = route?.systems?.[systemKey];
    const st = window.TAKASU_MINAMI_LINE_DRIVE_STATE || {};
    const names = (sys?.stops || []).map((s) => s.name);
    const btn = document.getElementById('driveStartPause');
    const label = btn?.querySelector('.bus-label-full')?.textContent || btn?.textContent || '';
    return {
      stopCount: names.length,
      stopNames: names,
      stopIds: (sys?.stops || []).map((s) => s.id),
      stopLatLngValid: (sys?.stops || []).every((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)),
      pathLength: st.pathLength ?? (sys?.path?.length || 0),
      selectedStopIndex: st.selectedStopIndex ?? 0,
      lastPassedStopIndex: st.lastPassedStopIndex ?? 0,
      traveled: st.traveled ?? 0,
      metricsTotal: st.metricsTotal ?? null,
      running: Boolean(st.running),
      currentName: names[st.selectedStopIndex ?? 0] || null,
      lastName: names.length ? names[names.length - 1] : null,
      startLabel: label.trim(),
      pathHash: sys?.pathHash || null,
      pathInvalid: Boolean(sys?.pathInvalid),
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
  const meta = await readSys(page, key);
  result.meta = meta;
  if (!meta.stopNames.length) throw new Error(`no stops: ${key}`);
  if (meta.pathInvalid || meta.pathLength < 2) throw new Error(`bad path ${meta.pathLength}`);
  await page.click('#driveStartPause');
  await page.waitForTimeout(200);
  const deadline = Date.now() + 240000;
  let prev = null;
  while (Date.now() < deadline) {
    const snap = await readSys(page, key);
    if (snap.currentName && result.stopOrder.at(-1) !== snap.currentName) result.stopOrder.push(snap.currentName);
    if (Number.isFinite(snap.traveled) && prev && Math.abs(snap.traveled - prev.traveled) > 800) result.jumps += 1;
    prev = snap;
    const atEnd = snap.lastPassedStopIndex >= snap.stopNames.length - 1
      && snap.currentName === snap.lastName
      && (snap.traveled >= (snap.metricsTotal || 0) - 5 || !snap.running);
    if (atEnd) { result.endReached = true; result.final = snap; break; }
    if (!snap.running && snap.startLabel.includes('スタート') && snap.lastPassedStopIndex < snap.stopNames.length - 1) {
      await page.click('#driveStartPause');
    }
    await page.waitForTimeout(250);
  }
  if (!result.endReached) result.final = await readSys(page, key);
  const expected = result.meta.stopNames;
  const registered = result.stopOrder.filter((n) => expected.includes(n));
  result.registeredStops = registered.length;
  result.ok = Boolean(result.endReached && result.final?.currentName === expected.at(-1) && result.jumps === 0 && registered.length >= expected.length - 1);
  return result;
}

(async () => {
  const report = {
    startedAt: new Date().toISOString(),
    routeId: 'route-19',
    integrity: {},
    drives: {},
    pageErrors: [],
    consoleErrors: [],
    failures: [],
    pass: false,
  };
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.on('pageerror', (e) => report.pageErrors.push(String(e.message || e)));
    page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r19`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.waitForSelector('#routeSelect', { timeout: 15000 });
    await page.selectOption('#routeSelect', 'route-19');
    await page.waitForFunction(() => window.TAKASU_MINAMI_LINE_ROUTE_V1 && window.TAKASU_MINAMI_LINE_PATH_V1 && window.TAKASU_MINAMI_LINE_PATH_POLICY_V1, null, { timeout: 30000 });
    await page.waitForSelector('#driveStartPause', { timeout: 25000 });
    await page.waitForTimeout(900);
    await page.evaluate(async () => { await window.TAKASU_MINAMI_LINE_ROUTE_V1.resolveAllSystems(true); });
    await page.waitForTimeout(500);

    for (const key of SYSTEMS) {
      const expectNames = ORDERS.systems[key].stopNames;
      const expectHash = BUILD.systems[key].pathHash;
      const expectVersion = BUILD.systems[key].resolvedVersion;
      const runtime = await page.evaluate(async (k) => {
        const api = window.TAKASU_MINAMI_LINE_ROUTE_V1;
        const route = api.ensureRoute();
        const sys = route.systems[k];
        const def = api.SYSTEM_DEFINITIONS[k];
        const recomputed = sys?.path?.length ? await api.hashPathSha256(sys.path) : null;
        const policy = window.TAKASU_MINAMI_LINE_PATH_POLICY_V1;
        const validation = policy.validateRuntimePath({
          systemKey: k,
          path: sys?.path || [],
          pathHash: sys?.pathHash,
          expectedPathHash: window.TAKASU_MINAMI_LINE_PATH_V1[k].pathHash,
          resolvedVersion: sys?.resolvedVersion,
          expectedResolvedVersion: api.expectedResolvedVersion(k),
          directionGroup: def.directionGroup,
          pathSource: sys?.pathSource,
        });
        return {
          stopNames: (sys?.stops || []).map((s) => s.name),
          stopIds: (sys?.stops || []).map((s) => s.id),
          coordsValid: (sys?.stops || []).every((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)),
          pathPoints: sys?.path?.length || 0,
          pathHash: sys?.pathHash || null,
          recomputedHash: recomputed,
          resolvedVersion: sys?.resolvedVersion || null,
          pathInvalid: Boolean(sys?.pathInvalid),
          validation,
        };
      }, key);
      const stopOrderMatches = runtime.stopNames.length === expectNames.length
        && runtime.stopNames.every((n, i) => n === expectNames[i]);
      const leak = runtime.stopNames.filter((n) => SIBLING_EXACT.some((x) => n === x));
      const entry = {
        ...runtime,
        stopOrderMatchesOfficial: stopOrderMatches,
        pathHashMatchesBank: runtime.pathHash === expectHash,
        pathHashRecomputeMatches: runtime.recomputedHash === expectHash,
        resolvedVersionMatches: runtime.resolvedVersion === expectVersion,
        siblingLeak: leak,
      };
      report.integrity[key] = entry;
      if (!stopOrderMatches) report.failures.push(`${key}: stop order`);
      if (!entry.pathHashMatchesBank || !entry.pathHashRecomputeMatches) report.failures.push(`${key}: pathHash`);
      if (!entry.resolvedVersionMatches) report.failures.push(`${key}: resolvedVersion`);
      if (!entry.coordsValid) report.failures.push(`${key}: coords`);
      if (leak.length) report.failures.push(`${key}: sibling leak ${leak.join(',')}`);
      if (runtime.pathInvalid || !runtime.validation?.ok) report.failures.push(`${key}: path policy`);
      console.log('integrity', key, runtime.stopNames.length, runtime.pathPoints, stopOrderMatches, entry.pathHashMatchesBank);
    }

    for (const key of SYSTEMS) {
      console.log('driving', key);
      const r = await driveOne(page, key);
      report.drives[key] = { ok: r.ok, endReached: r.endReached, jumps: r.jumps, registeredStops: r.registeredStops, stopCount: r.meta.stopCount };
      if (!r.ok) report.failures.push(`${key}: drive failed end=${r.endReached} jumps=${r.jumps} reg=${r.registeredStops}`);
      console.log('drive', key, r.ok, 'reg', r.registeredStops, '/', r.meta.stopCount, 'jumps', r.jumps);
    }

    // light sibling regression
    for (const [id, g] of [['route-18', 'AKEMI_TAKASU_LINE_ROUTE_V1'], ['route-15', 'SHIONE_NO_MACHI_LINE_ROUTE_V1']]) {
      await page.selectOption('#routeSelect', id);
      await page.waitForFunction((name) => Boolean(window[name]), g, { timeout: 30000 });
      const ok = await page.evaluate((name) => {
        const route = window[name].ensureRoute();
        return Object.keys(route.systems || {}).length > 0;
      }, g);
      report.regressions = report.regressions || {};
      report.regressions[id] = ok;
      if (!ok) report.failures.push(`regression ${id}`);
    }

    report.consoleErrors = report.consoleErrors.filter((t) => !/D1|CORS|workers\.dev|ERR_FAILED|Failed to load|Google Maps|manifest|Billing|Referer|panorama|Firebase/i.test(t));
    report.pass = report.failures.length === 0 && report.pageErrors.length === 0 && report.consoleErrors.length === 0;
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(OUT, '_continuous_drive_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failures: report.failures, drives: report.drives }, null, 2));
  process.exit(report.pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
