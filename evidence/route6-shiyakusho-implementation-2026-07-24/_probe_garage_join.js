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

function wayCoords(j, wayId) {
  const nodes = new Map(j.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const w = j.elements.find((e) => e.type === 'way' && e.id === wayId);
  return w.nodes.map((id) => {
    const n = nodes.get(id);
    return { id, lat: n.lat, lng: n.lon };
  });
}

const outJ = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relation-18396393.json'), 'utf8'));
const inJ = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relation-18396392.json'), 'utf8'));
const aisle = wayCoords(outJ, 1296818464);
const roadOut = wayCoords(outJ, 286387770);
const roadIn = wayCoords(inJ, 1337358420);
const trunk = wayCoords(inJ, 30176278);

console.log('aisle', aisle);
console.log('--- matches aisle ends to other ways ---');
for (const [label, coords] of [
  ['286387770', roadOut],
  ['1337358420', roadIn],
  ['30176278', trunk],
]) {
  for (const a of [aisle[0], aisle.at(-1)]) {
    let best = Infinity;
    let bestC = null;
    for (const c of coords) {
      const d = hav(a, c);
      if (d < best) {
        best = d;
        bestC = c;
      }
    }
    console.log('aisle', a.id, '->', label, 'best', best.toFixed(2), 'm at', bestC.id);
  }
}
