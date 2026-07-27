'use strict';
const fs = require('fs');
const path = require('path');
const hw = JSON.parse(fs.readFileSync(path.join(__dirname, '_osm_highways.json'), 'utf8'));
for (const el of hw.elements || []) {
  if (el.type !== 'node') continue;
  const n = el.tags?.name || el.tags?.['name:ja'] || '';
  if (/堀江橋|見明川歩道橋/.test(n)) console.log(el.id, n, el.lat, el.lon, el.tags?.highway, el.tags?.public_transport);
}
