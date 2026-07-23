'use strict';
/**
 * z19 evidence screenshots for route-3 v5 road-structure confirmation.
 * Shows path, platforms, used OSM ways, direction arrows, span endpoints.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const PORT = 8785;
const ZOOM = 19;
const VIEWPORT = { width: 1280, height: 900 };

function loadWindowModule(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = { window: {} };
  new Function('window', raw)(sandbox.window);
  return sandbox.window;
}

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestIdx(pathPts, target) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pathPts.length; i++) {
    const d = haversine(pathPts[i], target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { idx: best, dist: bestD };
}

function spanBetweenStops(pathPts, platforms, fromName, toName) {
  const fromP = platforms.find((p) => p.name === fromName);
  const toP = platforms.find((p) => p.name === toName);
  if (!fromP || !toP) throw new Error(`missing platform ${fromName}->${toName}`);
  const a = nearestIdx(pathPts, fromP);
  const b = nearestIdx(pathPts, toP);
  const lo = Math.min(a.idx, b.idx);
  const hi = Math.max(a.idx, b.idx);
  return {
    points: pathPts.slice(lo, hi + 1),
    fromIdx: a.idx,
    toIdx: b.idx,
    fromDist: a.dist,
    toDist: b.dist,
    from: fromP,
    to: toP,
  };
}

const PATH = loadWindowModule('urayasu-higashi-danchi-path-v1.js').URAYASU_HIGASHI_DANCHI_PATH_V1;
const PLAT = loadWindowModule('urayasu-higashi-danchi-platforms-v1.js')
  .URAYASU_HIGASHI_DANCHI_PLATFORMS_V1;

function plats(systemKey) {
  const block = PLAT.systems?.[systemKey] || PLAT[systemKey] || {};
  if (Array.isArray(block)) {
    return block.map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng ?? p.lon,
    }));
  }
  return Object.entries(block).map(([name, p]) => ({
    name,
    lat: p.lat,
    lng: p.lng ?? p.lon,
  }));
}

function pathPts(systemKey) {
  const block = PATH.systems?.[systemKey] || PATH[systemKey];
  if (!block?.pathPoints) throw new Error('missing pathPoints for ' + systemKey);
  return block.pathPoints;
}

const rotarySeq = JSON.parse(
  fs.readFileSync(path.join(OUT, 'shinurayasu-rotary-way-sequence.json'), 'utf8')
);
const kairakuSeq = JSON.parse(
  fs.readFileSync(path.join(OUT, 'kairaku-mihama-way-sequence.json'), 'utf8')
);
const akeumiTags = JSON.parse(fs.readFileSync(path.join(OUT, 'akeumi5-way-tags.json'), 'utf8'));

function wayGeomsFromSeq(seq) {
  const ways = seq.orderedWaySequence || seq.orderedWays || [];
  return ways.map((w) => ({
    wayId: w.wayId,
    elevated: !!w.elevated,
    roleHint: w.roleHint || null,
    start: w.startCoord,
    end: w.endCoord,
    sample: w.sampleMidpoint,
  }));
}

const sogoPlats = plats('3-sogo');
const urayasuPlats = plats('3-urayasu');
const symbolPlats = plats('3-symbol');
// 3-akeumi platforms are sliced from 3-sogo at runtime; reuse sogo platform coords.
const akeumiPlats = sogoPlats;

const A_sogo = spanBetweenStops(pathPts('3-sogo'), sogoPlats, '海楽', '美浜東団地');
const A_urayasu = spanBetweenStops(pathPts('3-urayasu'), urayasuPlats, '美浜東団地', '海楽');
const B_entry = spanBetweenStops(pathPts('3-sogo'), sogoPlats, '美浜東団地', '新浦安駅');
const B_exit = spanBetweenStops(pathPts('3-sogo'), sogoPlats, '新浦安駅', '入船中央エステート');
const B_symbol_exit = spanBetweenStops(pathPts('3-symbol'), symbolPlats, '新浦安駅', '入船中央エステート');
const C_akeumi = spanBetweenStops(pathPts('3-akeumi'), akeumiPlats, 'ハイアットリージェンシー', '明海五丁目');

// Loop focus: middle third of 美浜東団地→新浦安駅 (station bay / loop)
const loopPts = B_entry.points.slice(
  Math.floor(B_entry.points.length * 0.45),
  Math.floor(B_entry.points.length * 0.95)
);

const SHOTS = [
  {
    file: '3-sogo-kairaku-mihama-z19.png',
    label: '3-sogo 海楽→美浜東団地 z19 (Symbol Road bridge=yes over cloverleaf)',
    points: A_sogo.points,
    platforms: [A_sogo.from, A_sogo.to],
    spanEnds: [A_sogo.points[0], A_sogo.points.at(-1)],
    ways: wayGeomsFromSeq(kairakuSeq),
    direction: 'SE',
  },
  {
    file: '3-urayasu-mihama-kairaku-z19.png',
    label: '3-urayasu 美浜東団地→海楽 z19 (inbound opposite carriageway)',
    points: A_urayasu.points,
    platforms: [A_urayasu.from, A_urayasu.to],
    spanEnds: [A_urayasu.points[0], A_urayasu.points.at(-1)],
    ways: [],
    direction: 'NW',
  },
  {
    file: '3-sogo-shinurayasu-entry-z19.png',
    label: '3-sogo 新浦安駅 進入 z19 (美浜東団地→新浦安駅 approach)',
    points: B_entry.points.slice(0, Math.ceil(B_entry.points.length * 0.55)),
    platforms: [B_entry.from, B_entry.to],
    spanEnds: [B_entry.points[0], B_entry.points[Math.ceil(B_entry.points.length * 0.55) - 1]],
    ways: wayGeomsFromSeq(rotarySeq).filter((w) => w.roleHint === 'entry' || w.roleHint === 'service'),
    direction: 'SE',
  },
  {
    file: '3-sogo-shinurayasu-loop-z19.png',
    label: '3-sogo 新浦安駅 周回/乗り場 z19 (service loop bus=yes)',
    points: loopPts,
    platforms: [B_entry.to],
    spanEnds: [loopPts[0], loopPts.at(-1)],
    ways: wayGeomsFromSeq(rotarySeq).filter((w) => w.roleHint === 'loop_or_bay'),
    direction: 'CW',
  },
  {
    file: '3-sogo-shinurayasu-exit-z19.png',
    label: '3-sogo 新浦安駅 退出→入船中央エステート z19',
    points: B_exit.points,
    platforms: [B_exit.from, B_exit.to],
    spanEnds: [B_exit.points[0], B_exit.points.at(-1)],
    ways: wayGeomsFromSeq(rotarySeq).filter((w) => w.roleHint === 'exit_or_return'),
    direction: 'SE',
  },
  {
    file: '3-symbol-shinurayasu-exit-z19.png',
    label: '3-symbol 新浦安駅 退出 z19 (SE exit corridor shared)',
    points: B_symbol_exit.points,
    platforms: [B_symbol_exit.from, B_symbol_exit.to],
    spanEnds: [B_symbol_exit.points[0], B_symbol_exit.points.at(-1)],
    ways: [],
    direction: 'SE',
  },
  {
    file: '3-akeumi-akeumi5-end-z19.png',
    label: '3-akeumi ハイアット→明海五丁目 z19 (way 238904764 tertiary oneway)',
    points: C_akeumi.points,
    platforms: [C_akeumi.from, C_akeumi.to],
    spanEnds: [C_akeumi.points[0], C_akeumi.points.at(-1)],
    ways: [
      {
        wayId: 238904764,
        elevated: false,
        roleHint: 'end',
        start: akeumiTags.way_238904764.geometry[0]
          ? {
              lat: akeumiTags.way_238904764.geometry[0].lat,
              lng: akeumiTags.way_238904764.geometry[0].lon,
            }
          : null,
        end: akeumiTags.way_238904764.geometry.at(-1)
          ? {
              lat: akeumiTags.way_238904764.geometry.at(-1).lat,
              lng: akeumiTags.way_238904764.geometry.at(-1).lon,
            }
          : null,
      },
    ],
    direction: 'NE',
  },
];

function buildHtml(shot) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#111}
  #label{position:absolute;z-index:1000;left:12px;top:12px;background:rgba(0,0,0,.78);color:#fff;
    font:13px/1.4 sans-serif;padding:8px 12px;border-radius:6px;max-width:78%}
</style>
</head><body>
<div id="label">${shot.label}<br/>path ${shot.points.length}pts · dir ${shot.direction} · z${ZOOM}</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const PATH = ${JSON.stringify(shot.points)};
  const PLATS = ${JSON.stringify(shot.platforms || [])};
  const ENDS = ${JSON.stringify(shot.spanEnds || [])};
  const WAYS = ${JSON.stringify(shot.ways || [])};
  const map = L.map('map', { zoomControl: true }).setView([PATH[0].lat, PATH[0].lng], ${ZOOM});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, attribution: '© OSM'
  }).addTo(map);
  const latlngs = PATH.map(p => [p.lat, p.lng]);
  const line = L.polyline(latlngs, { color: '#ff2d55', weight: 5, opacity: 0.95 }).addTo(map);
  // direction arrow mid-path
  const mid = PATH[Math.floor(PATH.length / 2)];
  const mid2 = PATH[Math.min(PATH.length - 1, Math.floor(PATH.length / 2) + 1)];
  const ang = Math.atan2(mid2.lng - mid.lng, mid2.lat - mid.lat) * 180 / Math.PI;
  L.marker([mid.lat, mid.lng], {
    icon: L.divIcon({
      className: '',
      html: '<div style="transform:rotate('+ang+'deg);font-size:28px;color:#00e5ff;text-shadow:0 0 3px #000">▲</div>',
      iconSize: [28,28], iconAnchor: [14,14]
    })
  }).addTo(map);
  PATH.forEach((p, i) => {
    if (i % Math.max(1, Math.floor(PATH.length / 12)) !== 0 && i !== PATH.length - 1) return;
    L.circleMarker([p.lat, p.lng], { radius: 3, color:'#111', weight:1, fillColor:'#fff200', fillOpacity:1 }).addTo(map);
  });
  PLATS.forEach(p => {
    L.circleMarker([p.lat, p.lng], { radius: 9, color:'#0a0', weight:2, fillColor:'#39ff14', fillOpacity:0.85 })
      .addTo(map).bindTooltip(p.name, {permanent:true, direction:'top', offset:[0,-8]});
  });
  ENDS.forEach((p, i) => {
    L.circleMarker([p.lat, p.lng], { radius: 7, color:'#fff', weight:2, fillColor: i===0?'#00bcd4':'#ff5722', fillOpacity:1 })
      .addTo(map).bindTooltip(i===0?'始点':'終点', {permanent:true, direction:'right'});
  });
  WAYS.forEach(w => {
    if (w.start && w.end) {
      L.polyline([[w.start.lat,w.start.lng],[w.end.lat,w.end.lng]], {
        color: w.elevated ? '#9c27b0' : '#2196f3', weight: 2, dashArray: '4 4', opacity: 0.8
      }).addTo(map).bindTooltip('way '+w.wayId+(w.elevated?' bridge':'')+(w.roleHint?' '+w.roleHint:''), {sticky:true});
    }
  });
  map.fitBounds(line.getBounds(), { padding: [50,50], maxZoom: ${ZOOM} });
  window.__READY__ = false;
  map.whenReady(() => { setTimeout(() => { window.__READY__ = true; }, 2200); });
</script>
</body></html>`;
}

function startServer(pages) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = (req.url || '/').split('?')[0];
      const key = u.replace(/^\//, '') || 'index';
      const html = pages[key];
      if (!html) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main() {
  const pages = {};
  for (const shot of SHOTS) {
    pages[shot.file.replace('.png', '')] = buildHtml(shot);
  }
  const server = await startServer(pages);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const results = [];
  for (const shot of SHOTS) {
    const url = `http://127.0.0.1:${PORT}/${shot.file.replace('.png', '')}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 30000 });
    const outPath = path.join(OUT, shot.file);
    await page.screenshot({ path: outPath, fullPage: true });
    results.push({ file: shot.file, points: shot.points.length, ok: fs.existsSync(outPath) });
    console.log('wrote', shot.file, shot.points.length, 'pts');
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, '_v5_shots_report.json'), JSON.stringify(results, null, 2));
  console.log('done', results.length, 'shots');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
