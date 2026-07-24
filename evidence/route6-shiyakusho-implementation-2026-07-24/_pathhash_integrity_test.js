'use strict';
/**
 * pathHash integrity: intact systems pass; one in-memory point mutation must block driving.
 * Does NOT modify production files on disk.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_pathhash_integrity_report.json');
const PORT = 8806;
const SYSTEMS = [
  '6-maihama',
  '6-chidori',
  '6-urayasu-maihama',
  '6-tokai',
  '6-urayasu-chidori',
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
    function Marker() {}
    Marker.prototype.setPosition = function () {};
    Marker.prototype.setMap = function () {};
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
        res.writeHead(404);
        res.end('nf');
        return;
      }
      let body = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      if (rel === 'index.html') {
        let html = body.toString('utf8');
        html = html.replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
        html = html.replace('</head>', `<script>${googleMapsMockSource()}</script></head>`);
        body = Buffer.from(html, 'utf8');
      }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      navigator.serviceWorker?.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister()));
    } catch (e) { /* ignore */ }
  });
  const page = await context.newPage();
  const report = {
    startedAt: new Date().toISOString(),
    intact: {},
    tamper: null,
    restore: null,
    productionFilesUnchanged: true,
    pass: false,
  };

  try {
    await page.addInitScript({ content: googleMapsMockSource() });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r6pathhash`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => window.SHIYAKUSHO_ROUTE_V1 && window.SHIYAKUSHO_PATH_V1 && window.SHIYAKUSHO_PATH_POLICY_V1,
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(800);

    for (const key of SYSTEMS) {
      const result = await page.evaluate(async (systemKey) => {
        const api = window.SHIYAKUSHO_ROUTE_V1;
        api.setSelectedSystemKey(systemKey);
        try {
          const system = await api.resolveSystem(systemKey, { force: true });
          const bank = window.SHIYAKUSHO_PATH_V1[systemKey];
          const recomputed = await api.hashPathSha256(system.path);
          return {
            ok: true,
            pathInvalid: Boolean(system.pathInvalid),
            pathHash: system.pathHash,
            bankHash: bank.pathHash,
            recomputed,
            hashMatch: recomputed === bank.pathHash,
            resolvedVersion: system.resolvedVersion,
            expectedVersion: api.expectedResolvedVersion(systemKey),
            pathPoints: system.path.length,
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, key);
      report.intact[key] = result;
    }

    await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
    await page.waitForSelector('#routeSelect', { timeout: 15000 });
    await page.selectOption('#routeSelect', 'route-6');
    await page.waitForSelector('#driveStartPause', { timeout: 20000 });
    await page.waitForTimeout(500);

    report.tamper = await page.evaluate(async () => {
      const key = '6-maihama';
      const api = window.SHIYAKUSHO_ROUTE_V1;
      api.setSelectedSystemKey(key);
      const beforeButton = Boolean(document.getElementById('driveStartPause'));
      const bank = window.SHIYAKUSHO_PATH_V1[key];
      const mid = Math.floor(bank.pathPoints.length / 2);
      const original = { lat: bank.pathPoints[mid].lat, lng: bank.pathPoints[mid].lng };
      const bankHash = bank.pathHash;
      bank.pathPoints[mid] = { lat: original.lat + 0.0002, lng: original.lng + 0.0002 };

      let threw = null;
      try {
        await api.resolveSystem(key, { force: true });
      } catch (error) {
        threw = error instanceof Error ? error.message : String(error);
      }
      const live = data.routes.find((r) => r.id === 'route-6')?.systems?.[key];
      const invalidAfterResolve = Boolean(live?.pathInvalid);
      const issuesAfterResolve = (live?.pathIssues || []).map((i) => i.message).join(' / ');
      routes();
      const deadline = Date.now() + 8000;
      let statusText = '';
      while (Date.now() < deadline) {
        statusText = document.getElementById('mapStatus')?.textContent || '';
        if (statusText.includes('pathHash不一致') || statusText.includes('市役所線の走行データを確認できません')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const afterButton = Boolean(document.getElementById('driveStartPause'));
      bank.pathPoints[mid] = original;
      return {
        systemKey: key,
        bankHash,
        originalPoint: original,
        beforeButton,
        threw,
        pathInvalid: invalidAfterResolve || Boolean(live?.pathInvalid),
        issueText: issuesAfterResolve || (live?.pathIssues || []).map((i) => i.message).join(' / '),
        messageHasPathHash: String(threw || '').includes('pathHash不一致') || statusText.includes('pathHash不一致'),
        messageHasShiyakushoBanner: String(threw || '').includes('市役所線の走行データを確認できません')
          || statusText.includes('市役所線の走行データを確認できません'),
        statusText,
        afterButton,
        driveBlocked: beforeButton && !afterButton && statusText.includes('pathHash不一致'),
      };
    });

    report.restore = await page.evaluate(async () => {
      const key = '6-maihama';
      const api = window.SHIYAKUSHO_ROUTE_V1;
      try {
        const system = await api.resolveSystem(key, { force: true });
        routes();
        await new Promise((r) => setTimeout(r, 1000));
        return {
          ok: true,
          pathInvalid: Boolean(system.pathInvalid),
          startButton: Boolean(document.getElementById('driveStartPause')),
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    const intactOk = SYSTEMS.every((key) => {
      const row = report.intact[key];
      return row?.ok && row.hashMatch && !row.pathInvalid && row.resolvedVersion === row.expectedVersion;
    });
    const tamperOk = Boolean(
      report.tamper?.pathInvalid
      && report.tamper?.messageHasPathHash
      && report.tamper?.messageHasShiyakushoBanner
      && report.tamper?.driveBlocked,
    );
    const restoreOk = Boolean(report.restore?.ok && !report.restore?.pathInvalid && report.restore?.startButton);
    report.pass = intactOk && tamperOk && restoreOk;
    report.finishedAt = new Date().toISOString();
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    intactOk: SYSTEMS.every((k) => report.intact[k]?.ok && report.intact[k]?.hashMatch),
    tamperBlocked: report.tamper?.pathInvalid,
    tamperReason: report.tamper?.issueText || report.tamper?.threw,
    restoreOk: report.restore?.ok && report.restore?.startButton,
    out: OUT,
  }, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
