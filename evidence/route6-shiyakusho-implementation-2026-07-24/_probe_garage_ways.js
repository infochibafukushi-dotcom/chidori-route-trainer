'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

function hav(a, b) {
  const R = 6371000;
  const t = (d) => (d * Math.PI) / 180;
  const dLat = t(b.lat - a.lat);
  const dLng = t(b.lng - a.lng);
  const la1 = t(a.lat);
  const la2 = t(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const plat = { lat: 35.6270761, lng: 139.8979121 };
for (const id of [18396392, 18396393]) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${id}.json`), 'utf8'));
  const nodes = new Map(j.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  for (const w of j.elements.filter((e) => e.type === 'way')) {
    const coords = w.nodes.map((i) => nodes.get(i)).filter(Boolean).map((n) => ({ lat: n.lat, lng: n.lon }));
    if (!coords.length) continue;
    let best = Infinity;
    for (const c of coords) best = Math.min(best, hav(c, plat));
    if (best < 80) {
      console.log(
        id,
        'way',
        w.id,
        w.tags?.highway,
        w.tags?.service || '',
        w.tags?.name || '',
        'minD',
        best.toFixed(1),
        'nodes',
        coords.length,
      );
    }
  }
}
