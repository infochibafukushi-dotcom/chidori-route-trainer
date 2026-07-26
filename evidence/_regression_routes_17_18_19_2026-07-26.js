'use strict';
/**
 * Final regression for routes 17/18/19:
 * path banks vs baseline 66c8596, switch 16→17→18→19→15→1, layout, no D1 PUT.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'route19-takasu-minami-implementation-2026-07-26');
const PORT = 8883;
const BASELINE = '66c8596';
const REPORT = path.join(OUT, '_final_regression_17_18_19.json');

const BANK_FILES = [
  ['route-3', 'urayasu-higashi-danchi-path-v1.js'],
  ['route-4', 'tomioka-path-v1.js'],
  ['route-5', 'horie-path-v1.js'],
  ['route-6', 'shiyakusho-path-v1.js'],
  ['route-9', 'maihama-line-path-v1.js'],
  ['route-10', 'takasu-line-path-v1.js'],
  ['route-11', 'symbol-road-line-path-v1.js'],
  ['route-12', 'maihama-resort-line-path-v1.js'],
  ['route-14', 'benten-tomioka-line-path-v1.js'],
  ['route-15', 'shione-no-machi-line-path-v1.js'],
  ['route-16', 'hinode-line-path-v1.js'],
];

const SWITCH = [
  { id: 'route-16', expectName: /日の出/, waitGlobal: 'HINODE_LINE_ROUTE_V1', api: 'HINODE_LINE_ROUTE_V1' },
  { id: 'route-17', expectName: /日の出/, waitGlobal: 'HINODE_LINE_17_ROUTE_V1', api: 'HINODE_LINE_17_ROUTE_V1' },
  { id: 'route-18', expectName: /明海|高洲/, waitGlobal: 'AKEMI_TAKASU_LINE_ROUTE_V1', api: 'AKEMI_TAKASU_LINE_ROUTE_V1' },
  { id: 'route-19', expectName: /高洲南/, waitGlobal: 'TAKASU_MINAMI_LINE_ROUTE_V1', api: 'TAKASU_MINAMI_LINE_ROUTE_V1' },
  { id: 'route-15', expectName: /潮音/, waitGlobal: 'SHIONE_NO_MACHI_LINE_ROUTE_V1', api: 'SHIONE_NO_MACHI_LINE_ROUTE_V1' },
  { id: 'route-1', expectName: /北栄/, waitGlobal: null, api: null },
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
    function Map() {}
    Map.prototype.setCenter = function () {};
    Map.prototype.setZoom = function () {};
    Map.prototype.setStreetView = function () {};
    Map.prototype.addListener = function () { return { remove() {} }; };
    function Marker() {}
    Marker.prototype.setPosition = function () {};
    Marker.prototype.setMap = function () {};
    Marker.prototype.addListener = function () { return { remove() {} }; };
    function Polyline() {}
    Polyline.prototype.setMap = function () {};
    Polyline.prototype.setPath = function () {};
    function StreetViewPanorama() {}
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
        res.writeHead(404); res.end('nf'); return;
      }
      let body = fs.readFileSync(filePath);
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

function hashSnapshot(label, file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return { label, file, ok: false, reason: 'missing-now' };
  const now = fs.readFileSync(full);
  let baseline;
  try {
    baseline = execSync(`git show ${BASELINE}:${file}`, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
  } catch (_) {
    return { label, file, ok: false, reason: 'missing-baseline' };
  }
  return { label, file, ok: Buffer.compare(now, baseline) === 0 };
}

(async () => {
  const report = {
    startedAt: new Date().toISOString(),
    baseline: BASELINE,
    pathHashRegression: {},
    switchTest: [],
    layout: {},
    d1Puts: [],
    pass: false,
  };
  for (const [label, file] of BANK_FILES) report.pathHashRegression[label] = hashSnapshot(label, file);
  const pathOk = Object.values(report.pathHashRegression).every((r) => r.ok);

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const puts = [];
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('request', (req) => {
      if (req.method() === 'PUT' && /workers\.dev|d1|cloudflare/i.test(req.url())) puts.push(req.url());
    });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=final171819`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.waitForSelector('#routeSelect', { timeout: 15000 });

    let prevSystems = null;
    for (const step of SWITCH) {
      const has = await page.evaluate((id) => !!document.querySelector(`#routeSelect option[value="${id}"]`), step.id);
      if (!has) { report.switchTest.push({ expect: step.id, ok: false, reason: 'option-missing' }); continue; }
      await page.selectOption('#routeSelect', step.id);
      if (step.waitGlobal) {
        await page.waitForFunction((g) => Boolean(window[g]), step.waitGlobal, { timeout: 30000 });
        await page.waitForSelector('#driveStartPause', { timeout: 25000 });
        await page.waitForTimeout(700);
        const state = await page.evaluate((apiName) => {
          const api = window[apiName];
          const route = api?.ensureRoute?.();
          const keys = route?.systems ? Object.keys(route.systems) : [];
          const first = keys[0] ? route.systems[keys[0]] : null;
          const names = (first?.stops || []).map((s) => s.name);
          return {
            routeId: route?.id || window.routeState?.routeId || null,
            routeName: route?.name || null,
            selectText: document.querySelector('#routeSelect')?.selectedOptions?.[0]?.textContent || '',
            systemKeys: keys,
            stopCount: names.length,
            firstStop: names[0] || null,
            lastStop: names.at(-1) || null,
          };
        }, step.api);
        const noMix = !prevSystems || !state.systemKeys.some((k) => prevSystems.includes(k));
        const ok = state.routeId === step.id
          && step.expectName.test(String(state.routeName || state.selectText || ''))
          && state.systemKeys.length > 0
          && state.stopCount > 0
          && noMix;
        // Special: 16 vs 17 must not share systemKeys
        if (step.id === 'route-17' && state.systemKeys.some((k) => k.startsWith('16-'))) {
          report.switchTest.push({ ...state, ok: false, reason: 'route16-system-leak' });
        } else {
          report.switchTest.push({ ...state, ok, expect: step.id, noMix });
        }
        prevSystems = state.systemKeys;
      } else {
        await page.waitForTimeout(1500);
        const state = await page.evaluate(() => {
          const sel = document.querySelector('#routeSelect');
          return {
            routeId: window.routeState?.routeId || sel?.value,
            selectText: sel?.selectedOptions?.[0]?.textContent || '',
            selectValue: sel?.value || null,
          };
        });
        const ok = (state.routeId === 'route-1' || state.selectValue === 'route-1')
          && step.expectName.test(String(state.selectText || ''));
        report.switchTest.push({ ...state, ok, expect: step.id, systemKeys: [] });
      }
    }

    await page.evaluate(() => { if (typeof go === 'function') go('home'); });
    await page.waitForTimeout(500);
    report.homeCopyrightOk = await page.evaluate(() => /山本信勝/.test(document.body.innerText));
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.waitForSelector('#routeSelect', { timeout: 10000 });

    async function layout(width, height, label) {
      await page.setViewportSize({ width, height });
      await page.selectOption('#routeSelect', 'route-17');
      await page.waitForFunction(() => Boolean(window.HINODE_LINE_17_ROUTE_V1), null, { timeout: 20000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `ui-${label}.png`), fullPage: false });
      return page.evaluate(({ w, h }) => {
        const scrollX = Math.max(document.body.scrollWidth - window.innerWidth, 0);
        const driveIds = ['drivePrevious', 'driveNext', 'driveStartPause', 'driveReset'];
        const buttonsOut = driveIds
          .map((id) => {
            const b = document.getElementById(id);
            if (!b) return null;
            const r = b.getBoundingClientRect();
            const inView = r.width > 0 && r.height > 0 && r.bottom <= h + 8 && r.right <= w + 8 && r.top >= -8 && r.left >= -8;
            return inView ? null : id;
          })
          .filter(Boolean);
        return { scrollX, buttonsOut };
      }, { w: width, h: height });
    }
    report.layout.pc1280 = await layout(1280, 800, 'pc1280');
    report.layout.sp390 = await layout(390, 844, 'sp390');
    report.d1Puts = puts;
    report.consoleErrors = consoleErrors.filter((t) => !/D1|CORS|workers\.dev|ERR_FAILED|Failed to load|Google Maps|manifest|Billing|Referer|panorama|Firebase/i.test(t));

    const switchOk = report.switchTest.every((s) => s.ok);
    const layoutOk = report.homeCopyrightOk
      && report.layout.pc1280.scrollX === 0 && report.layout.sp390.scrollX === 0
      && report.layout.pc1280.buttonsOut.length === 0 && report.layout.sp390.buttonsOut.length === 0;
    const d1Ok = puts.length === 0;
    const consoleOk = report.consoleErrors.length === 0;
    // 16/17 name collision check
    const r16 = report.switchTest.find((s) => s.expect === 'route-16');
    const r17 = report.switchTest.find((s) => s.expect === 'route-17');
    report.route16vs17Separated = Boolean(r16?.ok && r17?.ok && !(r17.systemKeys || []).some((k) => (r16.systemKeys || []).includes(k)));
    report.pass = pathOk && switchOk && layoutOk && d1Ok && consoleOk && report.route16vs17Separated;
    report.summary = { pathOk, switchOk, layoutOk, d1Ok, consoleOk, homeCopyrightOk: report.homeCopyrightOk, route16vs17Separated: report.route16vs17Separated };
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('switch', report.switchTest.map((s) => `${s.expect}:${s.ok ? 'OK' : 'FAIL'}(${s.routeName || s.reason || s.selectText || '?'}/${(s.systemKeys || []).length})`).join(' | '));
  console.log('PASS', report.pass);
  process.exit(report.pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
