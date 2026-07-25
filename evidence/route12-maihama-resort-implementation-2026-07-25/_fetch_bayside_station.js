'use strict';
/**
 * Find ベイサイド・ステーション platform for route-12 (official busstop 00020638).
 * OSM relations 18381677/18381676 lack this stop.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const QUERY = `
[out:json][timeout:60];
(
  node["highway"="bus_stop"]["name"~"ベイサイド"](35.62,139.86,35.64,139.90);
  node["public_transport"="platform"]["name"~"ベイサイド"](35.62,139.86,35.64,139.90);
  node["highway"="bus_stop"]["name"~"Bayside"](35.62,139.86,35.64,139.90);
);
out body;
`;

function postOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= endpoints.length) return reject(new Error('all overpass endpoints failed'));
      const url = new URL(endpoints[i++]);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'chidori-route-trainer/route12-bayside',
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode >= 400) {
              console.warn(url.hostname, res.statusCode, text.slice(0, 200));
              return tryNext();
            }
            try {
              resolve(JSON.parse(text));
            } catch (e) {
              console.warn('parse fail', url.hostname, text.slice(0, 200));
              tryNext();
            }
          });
        },
      );
      req.on('error', (err) => {
        console.warn(url.hostname, err.message);
        tryNext();
      });
      req.write(body);
      req.end();
    };
    tryNext();
  });
}

async function main() {
  const data = await postOverpass(QUERY);
  const nodes = (data.elements || []).filter((e) => e.type === 'node');
  const report = {
    fetchedAt: new Date().toISOString(),
    officialBusstopId: '00020638',
    officialName: '「ベイサイド・ステーション」',
    queryHint: 'name~ベイサイド / Bayside near TDS hotel area',
    count: nodes.length,
    candidates: nodes.map((n) => ({
      id: n.id,
      lat: n.lat,
      lon: n.lon,
      name: n.tags?.name || null,
      nameEn: n.tags?.['name:en'] || null,
      operator: n.tags?.operator || null,
      local_ref: n.tags?.local_ref || null,
      highway: n.tags?.highway || null,
      public_transport: n.tags?.public_transport || null,
      tags: n.tags || {},
    })),
  };
  fs.writeFileSync(path.join(OUT, '_bayside_station_candidates.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
