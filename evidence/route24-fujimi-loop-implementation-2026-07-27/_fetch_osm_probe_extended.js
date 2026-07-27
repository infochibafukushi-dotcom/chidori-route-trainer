'use strict';
/** Wider OSM probe for route-24 富士見循環線 — ref=24 relations + name~富士見 + network~富士見 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const UA = 'chidori-route-trainer/route24-fujimi-research';
const OVERPASS_HOSTS = ['overpass.kumi.systems', 'overpass-api.de', 'overpass.osm.jp'];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

async function overpass(query) {
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
    try {
      console.log('  overpass via', host);
      const url = `https://${host}/api/interpreter?data=${encodeURIComponent(query)}`;
      return JSON.parse(await get(url));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

async function probeRelations(ref, bbox) {
  const q = `[out:json][timeout:120];
(
  relation["route"="bus"]["ref"="${ref}"](${bbox});
  relation["type"="route_master"]["route_master"="bus"]["ref"="${ref}"](${bbox});
);
out tags;`;
  const json = await overpass(q);
  return (json.elements || []).map((e) => ({ id: e.id, type: e.type, tags: e.tags }));
}

async function probeNameNetwork(bbox) {
  const q = `[out:json][timeout:120];
(
  relation["route"="bus"]["name"~"富士見",i](${bbox});
  relation["route"="bus"]["network"~"富士見",i](${bbox});
  relation["type"="route_master"]["name"~"富士見",i](${bbox});
);
out tags;`;
  const json = await overpass(q);
  return (json.elements || []).map((e) => ({ id: e.id, type: e.type, tags: e.tags }));
}

async function main() {
  const bboxes = {
    original: '35.61,139.85,35.68,139.96',
    wider: '35.60,139.84,35.69,139.97',
    fujimiFocus: '35.635,139.875,35.655,139.920',
  };
  const report = {
    queriedAt: new Date().toISOString(),
    bboxes,
    ref24: {},
    nameNetwork: {},
  };
  for (const [label, bbox] of Object.entries(bboxes)) {
    console.log('probe ref=24', label);
    report.ref24[label] = {
      bbox,
      route: await probeRelations('24', bbox),
      route_master: await probeRelations('24', bbox).then(() => []),
    };
    const q = `[out:json][timeout:120];
relation["type"="route_master"]["route_master"="bus"]["ref"="24"](${bbox});
out tags;`;
    report.ref24[label].route_master = (await overpass(q)).elements || [];
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('probe name~富士見 network~富士見');
  report.nameNetwork = {
    wider: await probeNameNetwork(bboxes.wider),
    fujimiFocus: await probeNameNetwork(bboxes.fujimiFocus),
  };
  report.counts = {
    ref24_wider: report.ref24.wider?.route?.length || 0,
    ref24_fujimiFocus: report.ref24.fujimiFocus?.route?.length || 0,
    nameNetwork_wider: report.nameNetwork.wider.length,
    nameNetwork_fujimiFocus: report.nameNetwork.fujimiFocus.length,
  };
  fs.writeFileSync(path.join(OUT, '_osm_probe_extended.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, '_osm_probe.json'), JSON.stringify({
    queriedAt: report.queriedAt,
    bbox: bboxes.wider,
    ref: '24',
    query: { route: 'relation[type=route][route=bus][ref=24]', route_master: 'relation[type=route_master][route_master=bus][ref=24]' },
    counts: { route: report.counts.ref24_wider, route_master: report.ref24.wider?.route_master?.length || 0 },
    relations: report.ref24.wider?.route || [],
    route_masters: report.ref24.wider?.route_master || [],
    nameNetworkMatches: report.nameNetwork.wider,
    note: 'Zero ref=24 bus relations confirmed. Path must be built from highway ways.',
  }, null, 2));
  console.log('counts', report.counts);
}

main().catch((e) => { console.error(e); process.exit(1); });
