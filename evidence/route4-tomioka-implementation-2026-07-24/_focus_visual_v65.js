'use strict';
/** Focus visual check: 舞浜駅 / TDL / 千鳥車庫 at z19 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots-focus-v65');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8792;

function load(rel) {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(sandbox.window);
  return sandbox.window;
}

const PATH = load('tomioka-path-v1.js').TOMIOKA_PATH_V1;
const PLAT = load('tomioka-platforms-v1.js').TOMIOKA_PLATFORMS_V1;

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

function windowAround(systemKey, stopName, pad = 12) {
  const pts = PATH[systemKey].pathPoints;
  const plat = PLAT[systemKey][stopName];
  const { index, dist } = nearest(pts, plat);
  const lo = Math.max(0, index - pad);
  const hi = Math.min(pts.length - 1, index + pad);
  const slice = pts.slice(lo, hi + 1);
  const heading = (() => {
    if (index >= pts.length - 1) {
      const a = pts[index - 1] || pts[index];
      const b = pts[index];
      return Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI;
    }
    const a = pts[index];
    const b = pts[Math.min(pts.length - 1, index + 3)];
    return Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI;
  })();
  return {
    points: slice,
    platform: { name: stopName, ...plat, pathDistM: Math.round(dist * 10) / 10 },
    headingDeg: Math.round(((heading % 360) + 360) % 360),
    pathHash: PATH[systemKey].pathHash,
    resolvedVersion: PATH[systemKey].resolvedVersion,
    relationId: PATH[systemKey].relationId,
  };
}

const SHOTS = [
  { file: 'focus-maihama-end-4-maihama-z19.png', label: '舞浜駅終点 4-maihama', ...windowAround('4-maihama', '舞浜駅') },
  { file: 'focus-maihama-pass-4-tdl-z19.png', label: '舞浜駅通過 4-tdl', ...windowAround('4-tdl', '舞浜駅') },
  { file: 'focus-maihama-start-4-urayasu-maihama-z19.png', label: '舞浜駅始発 4-urayasu-maihama', ...windowAround('4-urayasu-maihama', '舞浜駅') },
  { file: 'focus-tdl-end-4-tdl-z19.png', label: 'TDL終点 4-tdl', ...windowAround('4-tdl', '「東京ディズニーランド（Ｒ）」') },
  { file: 'focus-tdl-start-4-urayasu-tdl-z19.png', label: 'TDL始発 4-urayasu-tdl', ...windowAround('4-urayasu-tdl', '「東京ディズニーランド（Ｒ）」') },
  { file: 'focus-chidori-end-4-chidori-z19.png', label: '千鳥車庫終点 4-chidori', ...windowAround('4-chidori', '千鳥車庫') },
  { file: 'focus-chidori-start-4-urayasu-chidori-z19.png', label: '千鳥車庫始発 4-urayasu-chidori', ...windowAround('4-urayasu-chidori', '千鳥車庫') },
];

function html(shot) {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#map{margin:0;height:100%;width:100%}
#label{position:absolute;z-index:1000;left:10px;top:10px;background:rgba(0,0,0,.82);color:#fff;padding:10px 12px;font:13px/1.45 sans-serif;max-width:420px}
</style></head><body>
<div id="label"></div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const shot = ${JSON.stringify(shot)};
document.getElementById('label').innerHTML =
  '<b>' + shot.label + '</b><br>' +
  'platform→path ' + shot.platform.pathDistM + 'm<br>' +
  'heading ' + shot.headingDeg + '° | relation ' + shot.relationId + '<br>' +
  'resolvedVersion ' + shot.resolvedVersion + '<br>' +
  'pathHash ' + shot.pathHash.slice(0, 16) + '…';
const map = L.map('map', { zoomControl: true }).setView([shot.platform.lat, shot.platform.lng], 19);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
L.polyline(shot.points.map(p => [p.lat, p.lng]), { color: '#0b57d0', weight: 5, opacity: 0.9 }).addTo(map);
L.circleMarker([shot.platform.lat, shot.platform.lng], { radius: 8, color: '#b00020', fillColor: '#ff5252', fillOpacity: 0.95 }).addTo(map)
  .bindTooltip(shot.platform.name, { permanent: true, direction: 'right' });
const tip = shot.points[Math.min(shot.points.length - 1, Math.floor(shot.points.length * 0.7))];
const rad = shot.headingDeg * Math.PI / 180;
const arrow = [
  [tip.lat, tip.lng],
  [tip.lat + Math.cos(rad) * 0.00008, tip.lng + Math.sin(rad) * 0.00008],
];
L.polyline(arrow, { color: '#ff9800', weight: 4 }).addTo(map);
window.__READY__ = true;
</script></body></html>`;
}

function startServer() {
  return new Promise((resolve) => {
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
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const summary = [];
  for (let i = 0; i < SHOTS.length; i++) {
    await page.goto(`http://127.0.0.1:${PORT}/${i}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__READY__, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    const file = path.join(OUT, SHOTS[i].file);
    await page.screenshot({ path: file, fullPage: true });
    summary.push({
      file: SHOTS[i].file,
      label: SHOTS[i].label,
      platformDistM: SHOTS[i].platform.pathDistM,
      headingDeg: SHOTS[i].headingDeg,
      pathHashPrefix: SHOTS[i].pathHash.slice(0, 16),
    });
    console.log('saved', SHOTS[i].file, 'dist', SHOTS[i].platform.pathDistM);
  }
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
