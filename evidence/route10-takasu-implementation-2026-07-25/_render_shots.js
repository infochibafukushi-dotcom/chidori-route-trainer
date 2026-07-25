'use strict';
/** z19/z20 evidence screenshots for route-10 高洲線 required locations */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8821;

function load(rel) {
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(sandbox.window);
  return sandbox.window;
}

const PATH = load('takasu-line-path-v1.js').TAKASU_LINE_PATH_V1;
const PLAT = load('takasu-line-platforms-v1.js').TAKASU_LINE_PLATFORMS_V1;

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearest(pathPts, target) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pathPts.length; i++) {
    const d = haversine(pathPts[i], target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: bestD };
}

function span(systemKey, fromName, toName, opts = {}) {
  const pts = PATH[systemKey].pathPoints;
  const plats = PLAT[systemKey];
  const a = nearest(pts, plats[fromName]);
  const b = nearest(pts, plats[toName]);
  const lo = Math.min(a.index, b.index);
  const hi = Math.max(a.index, b.index);
  const tip = pts[Math.min(hi, lo + Math.max(3, Math.floor((hi - lo) * 0.6)))];
  const headingDeg = Math.round(
    ((Math.atan2(tip.lng - pts[Math.max(lo, hi - 3)].lng, tip.lat - pts[Math.max(lo, hi - 3)].lat) * 180) / Math.PI + 360) % 360,
  );
  const focus = opts.centerName ? plats[opts.centerName] : plats[toName];
  return {
    systemKey,
    label: `${systemKey} ${fromName}→${toName}`,
    points: pts.slice(lo, hi + 1),
    platforms: [
      { name: fromName, ...plats[fromName], pathDistM: Math.round(a.dist * 10) / 10 },
      { name: toName, ...plats[toName], pathDistM: Math.round(b.dist * 10) / 10 },
    ].filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i),
    headingDeg,
    pathHash: PATH[systemKey].pathHash,
    resolvedVersion: PATH[systemKey].resolvedVersion,
    relationId: PATH[systemKey].relationId,
    zoom: opts.zoom || 19,
    center: focus,
  };
}

const SHOTS = [
  { file: '10-minato-shinurayasu-start-z19.png', ...span('10-minato-minami', '新浦安駅', '入船中央エステート') },
  { file: '10-minato-meikai-crossing-z19.png', ...span('10-minato-minami', '入船中央エステート', '明海交差点') },
  { file: '10-minato-irifunebashi-z19.png', ...span('10-minato-minami', '明海交差点', '入船橋') },
  { file: '10-minato-gakkan-z19.png', ...span('10-minato-minami', '高洲北小学校', '東京学館前') },
  { file: '10-minato-takasu4-branch-z20.png', ...span('10-minato-minami', '高洲三丁目', '鉄鋼団地入口', { zoom: 20, centerName: '高洲四丁目' }) },
  { file: '10-minato-steel-entry-z19.png', ...span('10-minato-minami', '高洲四丁目', '鉄鋼団地入口') },
  { file: '10-minato-arai-z19.png', ...span('10-minato-minami', '鉄鋼団地入口', 'アライプロバンス') },
  { file: '10-minato-minato2-z19.png', ...span('10-minato-minami', 'アライプロバンス', 'みなと第二') },
  { file: '10-minato-minato-end-z19.png', ...span('10-minato-minami', 'みなと第二', 'みなと南') },
  { file: '10-shinurayasu-minato-start-z19.png', ...span('10-shinurayasu', 'みなと南', 'みなと第二') },
  { file: '10-shinurayasu-steel-entry-z19.png', ...span('10-shinurayasu', 'アライプロバンス', '鉄鋼団地入口') },
  { file: '10-shinurayasu-takasu4-z20.png', ...span('10-shinurayasu', '鉄鋼団地入口', '高洲三丁目', { zoom: 20, centerName: '高洲四丁目' }) },
  { file: '10-shinurayasu-gakkan-z19.png', ...span('10-shinurayasu', '高洲二丁目', '東京学館前') },
  { file: '10-shinurayasu-irifunebashi-z19.png', ...span('10-shinurayasu', '高洲北小学校', '入船橋') },
  { file: '10-shinurayasu-station-entry-z19.png', ...span('10-shinurayasu', '入船中央エステート', '新浦安駅') },
  { file: '10-shinurayasu-station-end-z19.png', ...span('10-shinurayasu', '明海交差点', '新浦安駅') },
];

function html(shot) {
  const zoom = shot.zoom || 19;
  const center = shot.center || shot.platforms[shot.platforms.length - 1];
  return `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%}#label{position:absolute;z-index:1000;left:10px;top:10px;background:rgba(0,0,0,.82);color:#fff;padding:10px 12px;font:13px/1.45 sans-serif;max-width:460px}</style>
</head><body><div id="label"></div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const shot = ${JSON.stringify(shot)};
document.getElementById('label').innerHTML =
  '<b>' + shot.label + '</b><br>' +
  'systemKey: ' + shot.systemKey + '<br>' +
  shot.platforms.map(p => p.name + ' ' + p.pathDistM + 'm').join(' / ') + '<br>' +
  'heading ' + shot.headingDeg + '° | relation ' + shot.relationId + '<br>' +
  'resolvedVersion ' + shot.resolvedVersion + '<br>' +
  'pathHash ' + shot.pathHash.slice(0, 16) + '…';
const center = ${JSON.stringify({ lat: center.lat, lng: center.lng })};
const zoom = ${zoom};
const map = L.map('map', { zoomControl: true }).setView([center.lat, center.lng], zoom);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OSM' }).addTo(map);
L.polyline(shot.points.map(p => [p.lat, p.lng]), { color: '#0b57d0', weight: 5, opacity: 0.9 }).addTo(map);
shot.platforms.forEach((p) => {
  L.circleMarker([p.lat, p.lng], { radius: 7, color: '#b00020', fillColor: '#ff5252', fillOpacity: 0.95 })
    .addTo(map).bindTooltip(p.name, { permanent: true, direction: 'right' });
});
const tip = shot.points[Math.min(shot.points.length - 1, Math.floor(shot.points.length * 0.7))];
const rad = shot.headingDeg * Math.PI / 180;
L.polyline([[tip.lat, tip.lng], [tip.lat + Math.cos(rad) * 0.00008, tip.lng + Math.sin(rad) * 0.00008]], { color: '#ff9800', weight: 4 }).addTo(map);
window.__READY__ = true;
</script></body></html>`;
}

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

async function captureUiShots(browser, serverPort) {
  const ROOT_DIR = path.resolve(__dirname, '..', '..');
  const uiServer = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const rel = urlPath.replace(/^\//, '');
    const filePath = path.normalize(path.join(ROOT_DIR, rel));
    if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    let body = fs.readFileSync(filePath);
    if (rel === 'index.html') {
      let htmlDoc = body.toString('utf8');
      htmlDoc = htmlDoc.replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
      htmlDoc = htmlDoc.replace('</head>', `<script>${googleMapsMockSource()}</script></head>`);
      body = Buffer.from(htmlDoc, 'utf8');
    }
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    res.end(body);
  });
  const uiPort = serverPort + 1;
  await new Promise((r) => uiServer.listen(uiPort, '127.0.0.1', r));

  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pcPage = await pc.newPage();
  await pcPage.addInitScript({ content: googleMapsMockSource() });
  await pcPage.goto(`http://127.0.0.1:${uiPort}/index.html?nocache=r10ui`, { waitUntil: 'domcontentloaded' });
  await pcPage.waitForTimeout(1200);
  await pcPage.evaluate(() => typeof go === 'function' && go('routes'));
  await pcPage.waitForSelector('#routeSelect', { timeout: 15000 });
  await pcPage.selectOption('#routeSelect', 'route-10');
  await pcPage.waitForTimeout(800);
  await pcPage.screenshot({ path: path.join(OUT, 'ui-pc-route10.png') });
  await pc.close();

  const sp = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const spPage = await sp.newPage();
  await spPage.addInitScript({ content: googleMapsMockSource() });
  await spPage.goto(`http://127.0.0.1:${uiPort}/index.html?nocache=r10uisp`, { waitUntil: 'domcontentloaded' });
  await spPage.waitForTimeout(1200);
  await spPage.evaluate(() => typeof go === 'function' && go('routes'));
  await spPage.waitForSelector('#routeSelect', { timeout: 15000 });
  await spPage.selectOption('#routeSelect', 'route-10');
  await spPage.waitForTimeout(800);
  await spPage.screenshot({ path: path.join(OUT, 'ui-sp390-route10.png') });
  await sp.close();
  uiServer.close();
}

async function main() {
  const server = http.createServer((req, res) => {
    const id = Number((req.url || '').replace('/', ''));
    if (!Number.isFinite(id) || !SHOTS[id]) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html(SHOTS[id]));
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const summary = [];
  for (let i = 0; i < SHOTS.length; i++) {
    await page.goto(`http://127.0.0.1:${PORT}/${i}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__READY__, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const file = path.join(OUT, SHOTS[i].file);
    await page.screenshot({ path: file, fullPage: true });
    summary.push({ file: SHOTS[i].file, label: SHOTS[i].label, headingDeg: SHOTS[i].headingDeg });
    console.log('saved', SHOTS[i].file);
  }
  await page.close();
  await captureUiShots(browser, PORT);
  console.log('saved ui-pc-route10.png');
  console.log('saved ui-sp390-route10.png');
  summary.push({ file: 'ui-pc-route10.png', label: 'route-10 PC UI' });
  summary.push({ file: 'ui-sp390-route10.png', label: 'route-10 SP390 UI' });
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
