'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screenshots');
const PORT = 8881;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const SYSTEMS = Object.keys(BUILD.systems);
const EXPECTED_CACHE = 'chidori-route-map-v112';
const ROUTE20_PACK = [
  './chidori-line-stop-images-v1.css?v=112',
  './chidori-line-platforms-v1.js?v=112',
  './chidori-line-path-v1.js?v=112',
  './chidori-line-path-policy-v1.js?v=112',
  './chidori-line-stop-images-v1.js?v=112',
  './chidori-line-route-v1.js?v=112',
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function googleMapsMockSource() {
  return `(() => {
    const googleApi = { maps: { Map: class { setCenter(){} setZoom(){} addListener(){return{remove(){}}} }, Marker: class { setMap(){} setPosition(){} addListener(){return{remove(){}}} }, Polyline: class { setMap(){} setPath(){} }, LatLng: class { constructor(a,b){this._a=a;this._b=b;} lat(){return this._a;} lng(){return this._b;} }, event: { addListener(){return{remove(){}}} } } };
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
  fs.mkdirSync(SHOTS, { recursive: true });
  const report = { routeId: 'route-20', expectedCache: EXPECTED_CACHE, failures: [], pass: false, d1PutCount: 0 };
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    let d1Puts = 0;
    page.on('request', (req) => {
      if (req.method() === 'PUT' && /workers\.dev|chidori-route-api/i.test(req.url())) d1Puts += 1;
    });
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r20pwa`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.selectOption('#routeSelect', 'route-20');
    await page.waitForFunction(() => window.CHIDORI_LINE_ROUTE_V1 && window.CHIDORI_LINE_PATH_V1, null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SHOTS, 'route20-pc1280.png'), fullPage: false });
    const cacheInfo = await page.evaluate(async (pack) => {
      const names = await caches.keys();
      const cache = await caches.open(names.find((n) => n.includes('v112')) || names[0]);
      const keys = cache ? await cache.keys() : [];
      const hrefs = keys.map((r) => r.url.replace(location.origin + '/', './'));
      return { cacheNames: names, packPresent: pack.every((p) => hrefs.some((h) => h.endsWith(p.replace('./', '')))) };
    }, ROUTE20_PACK);
    report.cacheInfo = cacheInfo;
    report.loaderTag = await page.evaluate(() => document.querySelector('script[src*="route-assets-loader"]')?.src || null);
    if (!String(report.loaderTag).includes('v=112')) report.failures.push('loader not v112');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.selectOption('#routeSelect', 'route-20');
    await page.waitForFunction(() => window.CHIDORI_LINE_ROUTE_V1, null, { timeout: 20000 });
    const offlineHashes = await page.evaluate((keys) => {
      const route = window.CHIDORI_LINE_ROUTE_V1.ensureRoute();
      return Object.fromEntries(keys.map((k) => [k, route.systems[k]?.pathHash || window.CHIDORI_LINE_PATH_V1[k]?.pathHash]));
    }, SYSTEMS);
    report.offlineHashes = offlineHashes;
    for (const k of SYSTEMS) {
      if (offlineHashes[k] !== BUILD.systems[k].pathHash) report.failures.push(`${k}: offline hash`);
    }
    report.d1PutCount = d1Puts;
    if (d1Puts > 0) report.failures.push(`D1 PUT count ${d1Puts} > 0`);
    report.pass = report.failures.length === 0;
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(OUT, 'pwa-offline-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
