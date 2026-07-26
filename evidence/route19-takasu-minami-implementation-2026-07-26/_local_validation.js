'use strict';
/**
 * Minimal local smoke: serve repo, select route-19, confirm 2 systems + path hashes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = JSON.parse(fs.readFileSync(path.join(__dirname, '_build_summary.json'), 'utf8'));
const PORT = 8765 + Math.floor(Math.random() * 100);

function contentType(p) {
  if (p.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.webmanifest')) return 'application/manifest+json';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let rel = decodeURIComponent(u.pathname.replace(/^\//, '') || 'index.html');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('missing'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

const report = { routeId: 'route-19', failures: [], ok: false };

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.failures.push(`pageerror ${e.message}`));
  await page.addInitScript(() => {
    window.google = {
      maps: {
        Map: class {
          constructor() {}
          setCenter() {}
          setZoom() {}
          fitBounds() {}
          getDiv() { return document.createElement('div'); }
        },
        Marker: class { constructor() {} setMap() {} setPosition() {} setIcon() {} setTitle() {} addListener() {} },
        Polyline: class { constructor() {} setMap() {} setPath() {} setOptions() {} },
        LatLng: class { constructor(lat, lng) { this.lat = () => lat; this.lng = () => lng; } },
        LatLngBounds: class { extend() {} },
        SymbolPath: { FORWARD_CLOSED_ARROW: 0 },
        event: { addListener() {}, trigger() {} },
        MapTypeId: { ROADMAP: 'roadmap' },
      },
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?nocache=r19`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
  await page.waitForSelector('#routeSelect', { timeout: 15000 });
  const hasOption = await page.evaluate(() => !!document.querySelector('#routeSelect option[value="route-19"]'));
  if (!hasOption) report.failures.push('route-19 missing from #routeSelect');
  else {
    await page.selectOption('#routeSelect', 'route-19');
    await page.waitForFunction(() => window.TAKASU_MINAMI_LINE_ROUTE_V1 && window.TAKASU_MINAMI_LINE_PATH_V1 && window.TAKASU_MINAMI_LINE_PLATFORMS_V1 && window.TAKASU_MINAMI_LINE_PATH_POLICY_V1, null, { timeout: 30000 });
    await page.waitForTimeout(900);
  }
  const info = await page.evaluate(() => {
    const g = window.TAKASU_MINAMI_LINE_ROUTE_V1;
    const path = window.TAKASU_MINAMI_LINE_PATH_V1 || {};
    const route = (window.data?.routes || []).find((r) => r.id === 'route-19');
    return {
      hasGlobal: !!g,
      systemKeys: g ? Object.keys(g.SYSTEM_DEFINITIONS || {}) : [],
      pathKeys: Object.keys(path),
      hashes: Object.fromEntries(Object.entries(path).map(([k, v]) => [k, v.pathHash])),
      routeSystems: route ? Object.keys(route.systems || {}) : [],
      cacheHint: document.querySelector('script[src*="route-assets-loader"]')?.src || null,
    };
  });
  report.info = info;
  if (!info.hasGlobal) report.failures.push('TAKASU_MINAMI_LINE_ROUTE_V1 missing');
  for (const k of ['19-takasu-seaside', '19-shinurayasu']) {
    if (!info.systemKeys.includes(k)) report.failures.push(`missing system ${k}`);
    if (info.hashes[k] !== BUILD.systems[k].pathHash) report.failures.push(`hash mismatch ${k}`);
  }
  if (info.cacheHint && !/v=111/.test(info.cacheHint)) report.failures.push(`loader not v111: ${info.cacheHint}`);

  // sibling exclusives
  const leak = await page.evaluate(() => {
    const route = (window.data?.routes || []).find((r) => r.id === 'route-19');
    const names = Object.values(route?.systems || {}).flatMap((s) => (s.stops || s.outbound || []).map((x) => x.name || x));
    const bad = ['みなと南', '潮音の街', '高洲中央公園', '夢海の街', '高洲橋'];
    return bad.filter((b) => names.includes(b));
  });
  if (leak.length) report.failures.push(`sibling stop leak ${leak.join(',')}`);

  report.ok = report.failures.length === 0;
  fs.writeFileSync(path.join(__dirname, '_local_validation_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  if (!report.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
