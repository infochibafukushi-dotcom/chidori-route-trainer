'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8883;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function googleMapsMockSource() {
  return `(() => {
    function LatLng(lat, lng) { this._lat = Number(lat); this._lng = Number(lng); }
    LatLng.prototype.lat = function () { return this._lat; };
    LatLng.prototype.lng = function () { return this._lng; };
    function Map(el) { this.el = el; }
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
    function StreetViewPanorama() {}
    StreetViewPanorama.prototype.setPosition = function () {};
    StreetViewPanorama.prototype.setPov = function () {};
    function StreetViewService() {}
    StreetViewService.prototype.getPanorama = function (req, cb) { try { cb({ location: { latLng: req.location } }, 'OK'); } catch (e) {} };
    const googleApi = { maps: { Map, Marker, Polyline, StreetViewPanorama, StreetViewService, StreetViewStatus: { OK: 'OK' }, LatLng, Size: function () {}, Point: function () {}, SymbolPath: { CIRCLE: 0 }, event: { addListener() { return { remove() {} }; } } } };
    window.google = googleApi; window.loadMaps = async () => googleApi;
  })();`;
}
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.normalize(path.join(ROOT, urlPath.replace(/^\//, '')));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('nf'); return;
      }
      let body = fs.readFileSync(filePath);
      if (urlPath === '/index.html') {
        let html = body.toString('utf8').replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
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
(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('PE:' + e.message));
  page.on('console', (m) => logs.push(m.type() + ':' + m.text()));
  await page.addInitScript({ content: googleMapsMockSource() });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
  await page.selectOption('#routeSelect', 'route-22');
  await page.waitForFunction(() => window.WAKASHIO_DORI_LINE_22_ROUTE_V1, null, { timeout: 30000 });
  const before = await page.evaluate(async () => {
    const api = window.WAKASHIO_DORI_LINE_22_ROUTE_V1;
    routeState.routeId = 'route-22';
    if (typeof routes === 'function') routes();
    try {
      await api.resolveAllSystems(true);
      return { ok: true, systems: Object.keys(api.ensureRoute().systems || {}), mapStatus: document.getElementById('mapStatus')?.textContent, btn: !!document.getElementById('driveStartPause') };
    } catch (e) {
      return { ok: false, err: String(e.message || e), mapStatus: document.getElementById('mapStatus')?.textContent, btn: !!document.getElementById('driveStartPause') };
    }
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({
    btn: !!document.getElementById('driveStartPause'),
    mapStatus: document.getElementById('mapStatus')?.textContent,
    hidden: document.getElementById('mapStatus')?.hidden,
  }));
  console.log(JSON.stringify({ before, after, logs: logs.filter((l) => !/chidori-boot|sw-/i.test(l)).slice(0, 30) }, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
