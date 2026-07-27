'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const q = `[out:json][timeout:60];node["highway"="bus_stop"](35.64,139.885,35.648,139.892);out body;`;
https.get('https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(q), { headers: { 'User-Agent': 'probe' } }, (r) => {
  let d = '';
  r.on('data', (c) => (d += c));
  r.on('end', () => {
    const j = JSON.parse(d);
    for (const el of j.elements || []) {
      console.log(el.id, el.tags?.name, el.lat, el.lon);
    }
  });
});
