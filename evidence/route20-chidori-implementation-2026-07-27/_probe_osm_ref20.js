'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_osm_ref20_22_probe.json');
const q = `[out:json][timeout:180];
(
  relation["type"="route"]["route"="bus"]["ref"="20"](35.61,139.88,35.67,139.95);
  relation["type"="route"]["route"="bus"]["ref"="22"](35.61,139.88,35.67,139.95);
  relation["type"="route_master"]["route_master"="bus"]["ref"="20"](35.61,139.88,35.67,139.95);
  relation["type"="route_master"]["route_master"="bus"]["ref"="22"](35.61,139.88,35.67,139.95);
);
out tags;`;

const hosts = ['overpass.kumi.systems', 'overpass-api.de', 'overpass.osm.jp'];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'chidori-route-trainer/r20', Accept: 'application/json' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(d);
        });
      })
      .on('error', reject);
  });
}

(async () => {
  let lastErr = null;
  for (const host of hosts) {
    try {
      console.log('try', host);
      const raw = await get(`https://${host}/api/interpreter?data=${encodeURIComponent(q)}`);
      const j = JSON.parse(raw);
      const els = (j.elements || []).map((e) => ({ id: e.id, type: e.type, tags: e.tags }));
      fs.writeFileSync(OUT, JSON.stringify(els, null, 2));
      console.log(JSON.stringify(els, null, 2));
      return;
    } catch (e) {
      lastErr = e;
      console.error('fail', host, e.message || e);
    }
  }
  throw lastErr;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
