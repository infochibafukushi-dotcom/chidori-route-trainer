'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const PORT = 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u === '/') u = '/index.html';
      const fp = path.normalize(path.join(ROOT, u.replace(/^\//, '')));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404);
        res.end('nf');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(fp).pipe(res);
    });
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') resolve(null);
      else reject(err);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function googleMapsMockSource() {
  return `(() => {
    function LatLng(a, b) { this._lat = +a; this._lng = +b; }
    LatLng.prototype.lat = function () { return this._lat; };
    LatLng.prototype.lng = function () { return this._lng; };
    function Map() { this.setCenter = function () {}; this.setZoom = function () {}; this.setStreetView = function () {}; this.addListener = function () { return { remove() {} }; }; }
    function Marker() { this.setPosition = function () {}; this.setMap = function () {}; this.addListener = function () { return { remove() {} }; }; }
    function Polyline() { this.setMap = function () {}; this.setPath = function () {}; }
    function StreetViewPanorama() { this.setPosition = function () {}; this.setPov = function () {}; }
    function StreetViewService() { this.getPanorama = function (r, cb) { cb({ location: { latLng: r.location } }, 'OK'); }; }
    const g = { maps: { Map, Marker, Polyline, StreetViewPanorama, StreetViewService, StreetViewStatus: { OK: 'OK' }, LatLng, Size: function () {}, Point: function () {}, SymbolPath: { CIRCLE: 0 }, event: { addListener() { return { remove() {} }; }, clearInstanceListeners() {} } } };
    window.google = g;
    window.loadMaps = async () => g;
  })();`;
}

async function main() {
  const imagawaMeta = {};
  for (const f of ['imagawa-urayasu-maihama-path-v1o.js', 'imagawa-chidori-garage-path-v1.js', 'imagawa-route-v1.js', 'imagawa-path-policy-v3.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    imagawaMeta[f] = {
      bytes: s.length,
      sha256: crypto.createHash('sha256').update(s).digest('hex'),
    };
  }
  fs.writeFileSync(path.join(OUT, '_v5_imagawa_file_hashes.json'), JSON.stringify(imagawaMeta, null, 2));

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { checks: [], viewports: {}, imagawaMeta, pass: true };

  async function goRoutes(page) {
    await page.waitForFunction(() => typeof go === 'function' || document.getElementById('routeSelect'), null, {
      timeout: 20000,
    });
    const hasSelect = await page.locator('#routeSelect').count();
    if (!hasSelect) {
      const menu = page.locator('[data-go="routes"], button:has-text("路線")').first();
      if (await menu.count()) {
        await menu.click({ force: true }).catch(() => {});
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => {
        if (typeof go === 'function') go('routes');
        else if (typeof routes === 'function') routes();
      });
      await page.waitForTimeout(1000);
    }
    await page.waitForSelector('#routeSelect', { timeout: 15000 });
  }

  async function checkSystems(page, routeId, systems) {
    await goRoutes(page);
    await page.selectOption('#routeSelect', routeId);
    await page.waitForTimeout(900);
    if (!systems) {
      const meta = await page.evaluate(() => {
        const r = data.routes.find((x) => x.id === 'route-1');
        return {
          outbound: (r?.outbound || []).length,
          hasDrive: Boolean(document.getElementById('driveStartPause') || document.getElementById('driveNext')),
        };
      });
      report.checks.push({ routeId: 'route-1', ...meta });
      console.log('route-1', meta);
      return;
    }
    for (const k of systems) {
      await page.selectOption('#systemSelect', k);
      await page.waitForTimeout(500);
      const meta = await page.evaluate((key) => {
        const r = data.routes.find((x) => x.id === routeState.routeId);
        const s = r?.systems?.[key];
        return {
          stops: s?.stops?.length || 0,
          path: s?.path?.length || 0,
          pathHash: s?.pathHash || null,
          resolvedVersion: s?.resolvedVersion || null,
          first: s?.stops?.[0]?.name || null,
          last: s?.stops?.at(-1)?.name || null,
        };
      }, k);
      report.checks.push({ routeId, key: k, ...meta });
      console.log(routeId, k, meta.stops, meta.path, (meta.pathHash || '').slice(0, 12), meta.resolvedVersion);
    }
  }

  for (const vp of [
    { name: 'pc', width: 1280, height: 800 },
    { name: 'sp390', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=v5reg-${vp.name}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    await checkSystems(page, 'route-1', null);
    await checkSystems(page, 'route-2', [
      '2-maihama',
      '2-urayasu-maihama',
      '2-kitaguchi',
      '2-chidori',
      '2-urayasu-chidori',
    ]);
    await checkSystems(page, 'route-3', ['3-sogo', '3-urayasu', '3-symbol', '3-akeumi']);
    const patchesPresent = await page.evaluate(
      () => typeof window.URAYASU_HIGASHI_DANCHI_PATH_PATCHES_V3 !== 'undefined'
    );
    report.viewports[vp.name] = { patchesPresent, ok: !patchesPresent };
    if (patchesPresent) report.pass = false;
    console.log(vp.name, 'patchesPresent', patchesPresent);
    await page.screenshot({ path: path.join(OUT, `ui-${vp.name}-route3.png`) });
    await context.close();
  }

  // Expected route-3 hashes (unchanged geometry)
  const expected = {
    '3-sogo': '3daf39e59686b2b20d0c5d724cb14003a1e04dee55dd459b58527873ccc4eafa',
    '3-urayasu': 'a9ec5527f136b2ac832aac68f4f5be032d1717af8a708f38636b534f99cee2f7',
    '3-symbol': '1026178ab4987963bddc1c044e91fdaab3f87c63690e74b5f7b5295646c3d70b',
    '3-akeumi': '75b336c39143045eb52ad48cda9b08751674a11341656e02543b6b683d92bf5d',
  };
  for (const [key, hash] of Object.entries(expected)) {
    const row = report.checks.find((c) => c.key === key);
    if (!row || row.pathHash !== hash) {
      report.pass = false;
      console.log('HASH MISMATCH', key, row?.pathHash);
    }
  }

  fs.writeFileSync(path.join(OUT, '_v5_regression_report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) server.close();
  console.log(JSON.stringify({ pass: report.pass, viewports: report.viewports }, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
