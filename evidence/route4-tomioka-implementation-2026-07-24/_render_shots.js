'use strict';
/** z19 evidence screenshots for route-4 key locations */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8788;

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
  return best;
}

function span(systemKey, fromName, toName) {
  const pts = PATH[systemKey].pathPoints;
  const plats = PLAT[systemKey];
  const a = nearest(pts, plats[fromName]);
  const b = nearest(pts, plats[toName]);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return {
    points: pts.slice(lo, hi + 1),
    platforms: [
      { name: fromName, ...plats[fromName] },
      { name: toName, ...plats[toName] },
    ].filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i),
  };
}

const SHOTS = [
  { file: '4-maihama-urayasu-start-z19.png', label: '4-maihama 浦安駅入口 始発', ...span('4-maihama', '浦安駅入口', 'フラワー通り') },
  { file: '4-maihama-maihama-end-z19.png', label: '4-maihama 舞浜駅 終点', ...span('4-maihama', 'オリエンタルランド本社前', '舞浜駅') },
  { file: '4-tdl-maihama-entry-z19.png', label: '4-tdl 舞浜駅 進入', ...span('4-tdl', 'オリエンタルランド本社前', '舞浜駅') },
  { file: '4-tdl-maihama-exit-z19.png', label: '4-tdl 舞浜駅→TDL 退出', ...span('4-tdl', '舞浜駅', '「東京ディズニーランド（Ｒ）」') },
  { file: '4-tdl-tdl-entry-z19.png', label: '4-tdl TDL 進入', ...span('4-tdl', '舞浜駅', '「東京ディズニーランド（Ｒ）」') },
  { file: '4-tdl-tdl-terminal-z19.png', label: '4-tdl TDL 終点', ...span('4-tdl', '舞浜駅', '「東京ディズニーランド（Ｒ）」') },
  { file: '4-chidori-undokoen-z19.png', label: '4-chidori 運動公園', ...span('4-chidori', '舞浜三丁目', '千鳥車庫') },
  { file: '4-chidori-chidori-entry-z19.png', label: '4-chidori 千鳥車庫進入', ...span('4-chidori', '運動公園', '千鳥車庫') },
  { file: '4-chidori-chidori-end-z19.png', label: '4-chidori 千鳥車庫終点', ...span('4-chidori', '運動公園', '千鳥車庫') },
  { file: '4-urayasu-maihama-start-z19.png', label: '4-urayasu-maihama 舞浜駅始発', ...span('4-urayasu-maihama', '舞浜駅', 'オリエンタルランド本社前') },
  { file: '4-urayasu-tdl-start-z19.png', label: '4-urayasu-tdl TDL始発', ...span('4-urayasu-tdl', '「東京ディズニーランド（Ｒ）」', '舞浜駅') },
  { file: '4-urayasu-chidori-start-z19.png', label: '4-urayasu-chidori 千鳥車庫始発', ...span('4-urayasu-chidori', '千鳥車庫', '運動公園') },
];

function html(shot) {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%}#label{position:absolute;z-index:1000;left:10px;top:10px;background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;font:13px sans-serif}</style>
</head><body><div id="label">${shot.label}<br/>${shot.points.length} pts</div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const PATH=${JSON.stringify(shot.points)};
const PLATS=${JSON.stringify(shot.platforms)};
const map=L.map('map').setView([PATH[0].lat,PATH[0].lng],19);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20}).addTo(map);
const line=L.polyline(PATH.map(p=>[p.lat,p.lng]),{color:'#ff2d55',weight:5}).addTo(map);
const mid=PATH[Math.floor(PATH.length/2)], mid2=PATH[Math.min(PATH.length-1,Math.floor(PATH.length/2)+1)];
const ang=Math.atan2(mid2.lng-mid.lng,mid2.lat-mid.lat)*180/Math.PI;
L.marker([mid.lat,mid.lng],{icon:L.divIcon({className:'',html:'<div style="transform:rotate('+ang+'deg);font-size:26px;color:#00e5ff;text-shadow:0 0 3px #000">▲</div>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map);
PLATS.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:9,color:'#0a0',fillColor:'#39ff14',fillOpacity:.9}).addTo(map).bindTooltip(p.name,{permanent:true,direction:'top'}));
L.circleMarker([PATH[0].lat,PATH[0].lng],{radius:7,fillColor:'#00bcd4',color:'#fff',fillOpacity:1}).addTo(map).bindTooltip('始点',{permanent:true});
L.circleMarker([PATH.at(-1).lat,PATH.at(-1).lng],{radius:7,fillColor:'#ff5722',color:'#fff',fillOpacity:1}).addTo(map).bindTooltip('終点',{permanent:true});
map.fitBounds(line.getBounds(),{padding:[40,40],maxZoom:19});
window.__READY__=false; map.whenReady(()=>setTimeout(()=>window.__READY__=true,2000));
</script></body></html>`;
}

async function main() {
  const pages = {};
  for (const s of SHOTS) pages[s.file.replace('.png', '')] = html(s);
  const server = http.createServer((req, res) => {
    const key = (req.url || '/').split('?')[0].replace(/^\//, '');
    if (!pages[key]) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pages[key]);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const s of SHOTS) {
    await page.goto(`http://127.0.0.1:${PORT}/${s.file.replace('.png', '')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, s.file), fullPage: true });
    console.log('wrote', s.file);
  }
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
