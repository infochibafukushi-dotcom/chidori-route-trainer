'use strict';
/**
 * Local end-to-end validation for route-18 明海・高洲線.
 *
 * Serves the repo, boots the real app with a Google Maps mock, selects route-18,
 * then for each of the 5 systems:
 *   1. stop names must equal official-stop-orders.json exactly
 *   2. runtime pathHash must equal the shipped bank hash (SHA-256, crypto.subtle)
 *   3. resolvedVersion must match SYSTEM_RESOLVED_VERSIONS
 *   4. path-policy validateRuntimePath must return ok
 *   5. no sibling-only stop (15/19/10/11/3/23) may appear, and no sibling relation may be referenced
 *   6. continuous drive from 始発 to 終点 with no position jumps, capturing screenshots
 *
 * Also asserts that composed 新浦安駅発着 short-turns are present when documented,
 * that routes
 * 17, 16, 15, 14 and 12 still resolve after the loader change, and that routes 15 and 17
 * still produce exactly the pathHashes recorded in their own evidence folders.
 *
 * Sibling stop-leak detection uses exact equality, never substring: 高洲 belongs to route-15
 * while 高洲橋 / 高洲中央公園 / 高洲海浜公園 / 高洲北小学校 / 高洲八丁目 / 高洲四丁目 /
 * 高洲三丁目 / 高洲西児童公園 / 高洲二丁目 are all genuine route-18 stops.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screenshots');
const PORT = 8851;
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ROUTE15_BUILD = JSON.parse(fs.readFileSync(
  path.resolve(ROOT, 'evidence', 'route15-shione-no-machi-implementation-2026-07-26', '_build_summary.json'), 'utf8',
));
const ROUTE17_BUILD = JSON.parse(fs.readFileSync(
  path.resolve(ROOT, 'evidence', 'route17-hinode-implementation-2026-07-26', '_build_summary.json'), 'utf8',
));

const SYSTEMS = [
  '18-takasu-seaside',
  '18-urayasu-eki-iriguchi',
  '18-takasu-kita-shogakko',
  '18-takasu-seaside-from-shinurayasu',
  '18-shinurayasu-from-takasu',
];
const SIBLING_ONLY_STOPS = [
  '明海交差点', '入船橋', '高洲',
  '浦安南高校', '特別養護老人ホーム', 'みなと南',
  'ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '日の出南', '新浦安温泉',
  '総合公園', 'ベイサイドホテルエリア', '望海の街', '明海五丁目', 'ハイアットリージェンシー',
  '三井ガーデンホテル', '明海南小学校', '明海六丁目',
];
const SIBLING_RELATIONS = [
  18419865, 18419864, 18381771, 18381770, 18381757, 18381756,
  18352883, 18352884, 18419852, 18417570, 18417571, 18417579, 18419894, 18419895,
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
        res.writeHead(404);
        res.end('nf');
        return;
      }
      let body = fs.readFileSync(filePath);
      if (rel.startsWith('akemi-takasu-line-route-v1.js')) body = Buffer.from(speedUp(body.toString('utf8')), 'utf8');
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

const isIgnorable = (t) => /D1 load failed|CORS|workers\.dev|ERR_FAILED|Failed to load resource|InvalidKeyMapError|ApiNotActivated|Google Maps|BillingNotEnabled|RefererNotAllowed|panorama update failed|manifest/i.test(String(t || ''));

async function readSys(page, key) {
  return page.evaluate((systemKey) => {
    const api = window.AKEMI_TAKASU_LINE_ROUTE_V1;
    const route = api?.ensureRoute?.();
    const sys = route?.systems?.[systemKey];
    const st = window.AKEMI_TAKASU_LINE_DRIVE_STATE || {};
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
      pathSource: sys?.pathSource || null,
      resolvedVersion: sys?.resolvedVersion || null,
      pathInvalid: Boolean(sys?.pathInvalid),
      statusState: document.getElementById('mapStatus')?.dataset?.state || '',
      status: (document.getElementById('mapStatus')?.textContent || '').slice(0, 240),
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
  if (!meta.stopNames.length) throw new Error(`no stops: ${meta.status}`);
  if (meta.pathInvalid || meta.pathLength < 2) throw new Error(`bad path ${meta.pathLength} invalid=${meta.pathInvalid} status=${meta.status}`);
  await page.click('#driveStartPause');
  await page.waitForTimeout(200);
  const deadline = Date.now() + 240000;
  let prev = null;
  let midShot = false;
  while (Date.now() < deadline) {
    const snap = await readSys(page, key);
    if (snap.currentName && result.stopOrder.at(-1) !== snap.currentName) result.stopOrder.push(snap.currentName);
    if (Number.isFinite(snap.traveled) && prev && Math.abs(snap.traveled - prev.traveled) > 800) result.jumps += 1;
    prev = snap;
    if (!midShot && snap.lastPassedStopIndex >= Math.floor(snap.stopNames.length / 2)) {
      midShot = true;
      await page.screenshot({ path: path.join(SHOTS, `drive-${key}-mid.png`), fullPage: false });
    }
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
  await page.screenshot({ path: path.join(SHOTS, `drive-${key}-end.png`), fullPage: false });
  const expected = result.meta.stopNames;
  const registered = result.stopOrder.filter((n) => expected.includes(n));
  result.registeredStops = registered.length;
  // The visited sequence must respect the official order (no backtracking between stops).
  const indices = result.stopOrder.filter((n) => expected.includes(n)).map((n) => expected.indexOf(n));
  result.visitOrderMonotonic = indices.every((v, i) => i === 0 || v >= indices[i - 1]);
  result.ok = Boolean(result.endReached && result.final?.currentName === expected.at(-1)
    && result.jumps === 0 && registered.length >= expected.length - 1 && result.visitOrderMonotonic);
  return result;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    routeId: 'route-18',
    cacheName: (fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').match(/CACHE_NAME = '([^']+)'/) || [])[1],
    integrity: {},
    drives: {},
    deferredAbsentAtRuntime: {},
    regressions: {},
    siblingsUntouched: {},
    pageErrors: [],
    consoleErrors: [],
    failures: [],
    pass: false,
  };
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(String(e.message || e)));
    page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r18`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.waitForSelector('#routeSelect', { timeout: 15000 });

    const hasOption = await page.evaluate(() => !!document.querySelector('#routeSelect option[value="route-18"]'));
    report.route18OptionPresent = hasOption;
    if (!hasOption) report.failures.push('route-18 not present in #routeSelect');

    await page.selectOption('#routeSelect', 'route-18');
    await page.waitForFunction(() => window.AKEMI_TAKASU_LINE_ROUTE_V1 && window.AKEMI_TAKASU_LINE_PATH_V1 && window.AKEMI_TAKASU_LINE_PLATFORMS_V1 && window.AKEMI_TAKASU_LINE_PATH_POLICY_V1, null, { timeout: 30000 });
    await page.waitForSelector('#driveStartPause', { timeout: 25000 });
    await page.waitForTimeout(900);

    report.packVersionTags = await page.evaluate(() => [...document.querySelectorAll('[data-chidori-src],[data-chidori-href]')]
      .map((el) => el.getAttribute('data-chidori-src') || el.getAttribute('data-chidori-href'))
      .filter((s) => s && s.includes('akemi-takasu-line')));
    if (!report.packVersionTags.every((s) => s.includes('v=110'))) {
      report.failures.push(`route-18 pack assets are not all v=110: ${report.packVersionTags.join(', ')}`);
    }

    report.systemSelectOptions = await page.evaluate(() => [...document.querySelectorAll('#systemSelect option')].map((o) => o.value));
    if (JSON.stringify(report.systemSelectOptions.slice().sort()) !== JSON.stringify(SYSTEMS.slice().sort())) {
      // Recorded rather than failed outright; the assertion below on each key is the hard gate.
      report.systemSelectUnexpected = true;
    }

    await page.evaluate(async () => {
      await window.AKEMI_TAKASU_LINE_ROUTE_V1.resolveAllSystems(true);
    });
    await page.waitForTimeout(500);

    for (const key of SYSTEMS) {
      const expectNames = ORDERS.systems[key].stopNames;
      const expectHash = BUILD.systems[key].pathHash;
      const expectVersion = BUILD.systems[key].resolvedVersion;
      const runtime = await page.evaluate(async (k) => {
        const api = window.AKEMI_TAKASU_LINE_ROUTE_V1;
        const route = api.ensureRoute();
        const sys = route.systems[k];
        const def = api.SYSTEM_DEFINITIONS[k];
        const recomputed = sys?.path?.length ? await api.hashPathSha256(sys.path) : null;
        const policy = window.AKEMI_TAKASU_LINE_PATH_POLICY_V1;
        const validation = policy.validateRuntimePath({
          systemKey: k,
          path: sys?.path || [],
          pathHash: sys?.pathHash,
          expectedPathHash: window.AKEMI_TAKASU_LINE_PATH_V1[k].pathHash,
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
          pathSource: sys?.pathSource || null,
          pathInvalid: Boolean(sys?.pathInvalid),
          relationId: def.relationId,
          timetableSymbol: def.timetableSymbol,
          naviCourse: def.naviCourse,
          directionGroup: def.directionGroup,
          validation,
        };
      }, key);

      const stopOrderMatches = runtime.stopNames.length === expectNames.length
        && runtime.stopNames.every((n, i) => n === expectNames[i]);
      const siblingLeak = runtime.stopNames.filter((n) => SIBLING_ONLY_STOPS.includes(n));
      const entry = {
        ...runtime,
        expectedStopCount: expectNames.length,
        stopOrderMatchesOfficial: stopOrderMatches,
        expectedPathHash: expectHash,
        pathHashMatchesBank: runtime.pathHash === expectHash,
        pathHashRecomputeMatches: runtime.recomputedHash === expectHash,
        expectedResolvedVersion: expectVersion,
        resolvedVersionMatches: runtime.resolvedVersion === expectVersion,
        stopIdPrefixOk: runtime.stopIds.every((id) => String(id).startsWith(`akemi-takasu-${key}-`)),
        siblingStopLeak: siblingLeak,
        siblingRelationUsed: SIBLING_RELATIONS.includes(runtime.relationId),
        expectedRelationId: ORDERS.systems[key].osmRelationId,
      };
      report.integrity[key] = entry;
      if (!stopOrderMatches) report.failures.push(`${key}: runtime stop order != official`);
      if (!entry.pathHashMatchesBank) report.failures.push(`${key}: runtime pathHash != bank`);
      if (!entry.pathHashRecomputeMatches) report.failures.push(`${key}: SHA-256 recompute != bank`);
      if (!entry.resolvedVersionMatches) report.failures.push(`${key}: resolvedVersion mismatch`);
      if (!entry.coordsValid) report.failures.push(`${key}: stop coordinates invalid`);
      if (!entry.stopIdPrefixOk) report.failures.push(`${key}: stop id prefix wrong (${runtime.stopIds[0]})`);
      if (siblingLeak.length) report.failures.push(`${key}: sibling stop leaked ${siblingLeak.join(',')}`);
      if (entry.siblingRelationUsed) report.failures.push(`${key}: sibling relation ${runtime.relationId} used`);
      if (runtime.relationId !== entry.expectedRelationId) report.failures.push(`${key}: relationId ${runtime.relationId} != official ${entry.expectedRelationId}`);
      if (runtime.pathInvalid) report.failures.push(`${key}: pathInvalid`);
      if (!runtime.validation?.ok) report.failures.push(`${key}: policy validation ${JSON.stringify(runtime.validation?.reasons)}`);
      console.log('integrity', key, 'stops', runtime.stopNames.length, 'pts', runtime.pathPoints,
        'orderOK', stopOrderMatches, 'hashOK', entry.pathHashMatchesBank && entry.pathHashRecomputeMatches,
        'policyOK', runtime.validation?.ok, 'maxGap', runtime.validation?.maxGapM, 'sym', runtime.timetableSymbol);
    }

    // Deferred patterns (if any) must not exist; composed short-turns must be present.
    for (const d of (ORDERS.deferredNoOsmSource || [])) {
      const present = await page.evaluate((names) => {
        const route = window.AKEMI_TAKASU_LINE_ROUTE_V1.ensureRoute();
        return Object.entries(route.systems || {}).filter(([, sys]) => {
          const s = (sys.stops || []).map((x) => x.name);
          return s.length === names.length && s.every((n, i) => n === names[i]);
        }).map(([k]) => k);
      }, d.stopNames);
      report.deferredAbsentAtRuntime[d.course] = {
        departure: d.departure, destination: d.destination, stopCount: d.stopCount, matchingSystems: present,
      };
      if (present.length) report.failures.push(`deferred pattern ${d.course} exists at runtime as ${present.join(',')}`);
      console.log('deferred absent', d.course, present.length === 0);
    }
    for (const key of ['18-takasu-seaside-from-shinurayasu', '18-shinurayasu-from-takasu']) {
      if (!report.integrity[key]) report.failures.push(`composed short-turn ${key} missing at runtime`);
      else console.log('composed present', key, true);
    }

    for (const key of SYSTEMS) {
      console.log('driving', key);
      try {
        const r = await driveOne(page, key);
        report.drives[key] = r;
        if (!r.ok) report.failures.push(`${key}: drive failed (end=${r.endReached}, jumps=${r.jumps}, monotonic=${r.visitOrderMonotonic}, last=${r.final?.currentName})`);
        console.log(r.ok ? 'DRIVE PASS' : 'DRIVE FAIL', key, 'registered', r.registeredStops, '/', r.meta?.stopCount, 'final', r.final?.currentName, 'monotonic', r.visitOrderMonotonic);
      } catch (e) {
        report.drives[key] = { key, ok: false, error: String(e.message || e) };
        report.failures.push(`${key}: drive threw ${e.message || e}`);
        console.log('DRIVE FAIL', key, e.message || e);
      }
    }

    // Regression: previously shipped routes must still load after the loader change.
    const regressionTargets = [
      { routeId: 'route-17', globalName: 'HINODE_LINE_17_ROUTE_V1', systemKey: '17-hinode-nanachome' },
      { routeId: 'route-16', globalName: 'HINODE_LINE_ROUTE_V1', systemKey: '16-hinode-nanachome' },
      { routeId: 'route-15', globalName: 'SHIONE_NO_MACHI_LINE_ROUTE_V1', systemKey: '15-takasu-seaside' },
      { routeId: 'route-14', globalName: 'BENTEN_TOMIOKA_LINE_ROUTE_V1', systemKey: '14-maihama' },
      { routeId: 'route-12', globalName: 'MAIHAMA_RESORT_LINE_ROUTE_V1', systemKey: '12-maihama-via-resort' },
    ];
    for (const t of regressionTargets) {
      try {
        await page.selectOption('#routeSelect', t.routeId);
        await page.waitForFunction((g) => window[g], t.globalName, { timeout: 25000 });
        await page.waitForTimeout(800);
        const r = await page.evaluate(({ g, sk }) => {
          const route = window[g].ensureRoute();
          const sys = route.systems[sk];
          return {
            stops: sys?.stops?.length || 0,
            pathPoints: sys?.path?.length || 0,
            pathHash: sys?.pathHash || null,
            stopNames: (sys?.stops || []).map((s) => s.name),
          };
        }, { g: t.globalName, sk: t.systemKey });
        report.regressions[t.routeId] = r;
        if (!r.stops) report.failures.push(`${t.routeId} regression: no stops`);
        console.log(`${t.routeId} regression`, r.stops, 'stops', r.pathPoints, 'pts');
      } catch (e) {
        report.regressions[t.routeId] = { error: String(e.message || e) };
        report.failures.push(`${t.routeId} regression: ${e.message || e}`);
      }
    }

    // Routes 15 and 17 must be bit-for-bit the same as when they shipped.
    const untouchedTargets = [
      { routeId: 'route-15', globalName: 'SHIONE_NO_MACHI_LINE_ROUTE_V1', build: ROUTE15_BUILD },
      { routeId: 'route-17', globalName: 'HINODE_LINE_17_ROUTE_V1', build: ROUTE17_BUILD },
    ];
    for (const t of untouchedTargets) {
      await page.selectOption('#routeSelect', t.routeId);
      await page.waitForFunction((g) => window[g], t.globalName, { timeout: 25000 });
      await page.evaluate(async (g) => { await window[g].resolveAllSystems(true); }, t.globalName);
      await page.waitForTimeout(500);
      report.siblingsUntouched[t.routeId] = {};
      for (const key of Object.keys(t.build.systems)) {
        const expected = t.build.systems[key];
        const actual = await page.evaluate(({ g, k }) => {
          const route = window[g].ensureRoute();
          const sys = route.systems[k];
          return {
            pathHash: sys?.pathHash || null,
            pathPoints: sys?.path?.length || 0,
            stopNames: (sys?.stops || []).map((s) => s.name),
          };
        }, { g: t.globalName, k: key });
        const same = actual.pathHash === expected.pathHash && actual.pathPoints === expected.pathPoints;
        report.siblingsUntouched[t.routeId][key] = {
          expectedPathHash: expected.pathHash, actualPathHash: actual.pathHash,
          expectedPathPoints: expected.pathPoints, actualPathPoints: actual.pathPoints,
          unchanged: same, stopNames: actual.stopNames,
        };
        if (!same) report.failures.push(`${t.routeId} ${key} changed: hash ${actual.pathHash} vs ${expected.pathHash}`);
        console.log(`${t.routeId} untouched`, key, same);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  report.fatalConsole = report.consoleErrors.filter((t) => !isIgnorable(t));
  report.fatalPageErrors = report.pageErrors.filter((t) => !isIgnorable(t));
  if (report.fatalConsole.length) report.failures.push(`console errors: ${report.fatalConsole.slice(0, 5).join(' | ')}`);
  if (report.fatalPageErrors.length) report.failures.push(`page errors: ${report.fatalPageErrors.slice(0, 5).join(' | ')}`);
  report.pass = report.failures.length === 0;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, '_local_validation_report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('PASS:', report.pass);
  if (report.failures.length) console.error('FAILURES', report.failures);
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
