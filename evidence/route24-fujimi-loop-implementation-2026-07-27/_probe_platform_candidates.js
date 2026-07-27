'use strict';
/** Probe all OSM platform candidates for duplicate-name stops and path distances. */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const hw = JSON.parse(fs.readFileSync(path.join(OUT, '_osm_highways.json'), 'utf8'));

const NAMES = ['東海大浦安高校前', '富士見三丁目', '富士見五丁目', '堀江橋', '見明川歩道橋', '弁天橋', '東野三丁目'];

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR((b.lng ?? b.lon) - (a.lng ?? a.lon));
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'probe' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

async function overpass(q) {
  for (const host of ['overpass.kumi.systems', 'overpass-api.de']) {
    try {
      return JSON.parse(await get(`https://${host}/api/interpreter?data=${encodeURIComponent(q)}`));
    } catch (_) {}
  }
  throw new Error('overpass failed');
}

function nearestHighwayDist(plat, nodes, ways) {
  let best = Infinity;
  for (const [, way] of ways) {
    const hw = way.tags?.highway;
    if (!hw || ['footway', 'path', 'steps', 'cycleway', 'pedestrian'].includes(hw)) continue;
    for (const nid of way.nodes || []) {
      const n = nodes.get(nid);
      if (!n) continue;
      best = Math.min(best, haversine(plat, { lat: n.lat, lng: n.lon }));
    }
  }
  return Math.round(best * 10) / 10;
}

async function main() {
  const nodes = new Map();
  const ways = new Map();
  for (const el of hw.elements || []) {
    if (el.type === 'node') nodes.set(el.id, el);
    if (el.type === 'way' && el.tags?.highway) ways.set(el.id, el);
  }

  const q = `[out:json][timeout:120];
(
  node["public_transport"="platform"]["name"~"${NAMES.join('|')}",i](35.628,139.878,35.652,139.918);
  node["highway"="bus_stop"]["name"~"${NAMES.join('|')}",i](35.628,139.878,35.652,139.918);
);
out body;`;
  const json = await overpass(q);
  const byName = {};
  for (const el of json.elements || []) {
    const name = el.tags?.name || el.tags?.['name:ja'];
    if (!name) continue;
    for (const target of NAMES) {
      if (name === target || name.includes(target)) {
        if (!byName[target]) byName[target] = [];
        byName[target].push({
          id: el.id,
          name,
          lat: el.lat,
          lng: el.lon,
          tags: el.tags,
          hwDist_m: nearestHighwayDist({ lat: el.lat, lng: el.lon }, nodes, ways),
        });
      }
    }
  }

  const current = {
    '東海大浦安高校前': [6778610692, 6796278429, 6778610693],
    '富士見三丁目': [6778604859],
    '富士見五丁目': [12367548464],
  };

  console.log(JSON.stringify({ byName, current }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
