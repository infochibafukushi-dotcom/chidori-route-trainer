'use strict';
/** z19 evidence screenshots for route-5 required locations */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8803;

function load(rel) {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(sandbox.window);
  return sandbox.window;
}

const PATH = load('horie-path-v1.js').HORIE_PATH_V1;
const PLAT = load('horie-platforms-v1.js').HORIE_PLATFORMS_V1;

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

function span(systemKey, fromName, toName) {
  const pts = PATH[systemKey].pathPoints;
  const plats = PLAT[systemKey];
  const a = nearest(pts, plats[fromName]);
  const b = nearest(pts, plats[toName]);
  const lo = Math.min(a.index, b.index);
  const hi = Math.max(a.index, b.index);
  const tip = pts[Math.min(hi, lo + Math.max(3, Math.floor((hi - lo) * 0.6)))];
  const base = pts[Math.max(lo, tip === pts[lo] ? lo : lo)];
  const headingDeg = Math.round(
    ((Math.atan2(tip.lng - pts[Math.max(lo, hi - 3)].lng, tip.lat - pts[Math.max(lo, hi - 3)].lat) * 180) / Math.PI + 360) % 360,
  );
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
  };
}

const SHOTS = [
  { file: '5-shinurayasu-urayasu-start-z19.png', ...span('5-shinurayasu', '浦安駅入口', 'フラワー通り') },
  { file: '5-shinurayasu-horie6-z19.png', ...span('5-shinurayasu', '南小入口', '清滝弁財天') },
  { file: '5-shinurayasu-tokai-z19.png', ...span('5-shinurayasu', '堀江中学校前', '東野中央') },
  { file: '5-shinurayasu-higashino-z19.png', ...span('5-shinurayasu', '東海大浦安高校前', '東野二丁目') },
  { file: '5-shinurayasu-shinurayasu-entry-z19.png', ...span('5-shinurayasu', '新浦安駅北口', '新浦安駅') },
  { file: '5-shinurayasu-shinurayasu-end-z19.png', ...span('5-shinurayasu', '新浦安駅北口', '新浦安駅') },
  { file: '5-ntt-urayasu-start-z19.png', ...span('5-ntt', '浦安駅入口', 'フラワー通り') },
  { file: '5-ntt-end-z19.png', ...span('5-ntt', '東野保育園', 'ＮＴＴ浦安前') },
  { file: '5-urayasu-shinurayasu-start-z19.png', ...span('5-urayasu', '新浦安駅', '新浦安駅北口') },
  { file: '5-urayasu-higashino-z19.png', ...span('5-urayasu', '第四街区公園入口', '東海大浦安高校前') },
  { file: '5-urayasu-tokai-z19.png', ...span('5-urayasu', '東野中央', '堀江中学校前') },
  { file: '5-urayasu-horie6-z19.png', ...span('5-urayasu', '清滝弁財天', '堀江一丁目') },
  { file: '5-urayasu-urayasu-end-z19.png', ...span('5-urayasu', '神明裏', '浦安駅入口') },
  { file: '5-tokai-start-z19.png', ...span('5-tokai', '新浦安駅', '新浦安駅北口') },
  { file: '5-tokai-end-z19.png', ...span('5-tokai', '東野中央', '東海大浦安高校前') },
  { file: '5-higashino-chuo-start-z19.png', ...span('5-higashino-chuo', '新浦安駅', '新浦安駅北口') },
  { file: '5-higashino-chuo-end-z19.png', ...span('5-higashino-chuo', '第四街区公園入口', '東野中央') },
];

function html(shot) {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%}#label{position:absolute;z-index:1000;left:10px;top:10px;background:rgba(0,0,0,.82);color:#fff;padding:10px 12px;font:13px/1.45 sans-serif;max-width:460px}</style>
</head><body><div id="label"></div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const shot = ${JSON.stringify(shot)};
document.getElementById('label').innerHTML =
  '<b>' + shot.label + '</b><br>' +
  shot.platforms.map(p => p.name + ' ' + p.pathDistM + 'm').join(' / ') + '<br>' +
  'heading ' + shot.headingDeg + '° | relation ' + shot.relationId + '<br>' +
  'resolvedVersion ' + shot.resolvedVersion + '<br>' +
  'pathHash ' + shot.pathHash.slice(0, 16) + '…';
const center = shot.platforms[shot.platforms.length - 1];
const map = L.map('map', { zoomControl: true }).setView([center.lat, center.lng], 19);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
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
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
