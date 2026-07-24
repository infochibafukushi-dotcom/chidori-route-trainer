'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'chidori-route4-research' } }, (res) => {
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

async function fetchRelation(id) {
  const q = `[out:json][timeout:180];relation(${id});(._;>;);out body;`;
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  let lastErr;
  for (const ep of endpoints) {
    try {
      const url = `${ep}?data=${encodeURIComponent(q)}`;
      console.log('fetch', id, ep);
      const raw = await get(url);
      fs.writeFileSync(path.join(OUT, `osm-relation-${id}.json`), raw);
      const j = JSON.parse(raw);
      const rel = (j.elements || []).find((e) => e.type === 'relation' && e.id === id);
      console.log('ok', id, rel?.tags?.name, 'members', rel?.members?.length);
      return j;
    } catch (e) {
      lastErr = e;
      console.error('fail', id, e.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

async function searchRef4() {
  const q = `[out:json][timeout:180];relation["route"="bus"]["ref"="4"]["operator"~"ベイ|Bay|京成|東京ベイ"];out tags;`;
  const url = `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(q)}`;
  console.log('search ref=4');
  const raw = await get(url);
  fs.writeFileSync(path.join(OUT, '_osm_ref4_search.json'), raw);
  const j = JSON.parse(raw);
  for (const e of j.elements || []) {
    console.log(e.id, e.tags?.name, e.tags?.from, '->', e.tags?.to);
  }
}

async function main() {
  await fetchRelation(18323875);
  await searchRef4();
  // print stops for 18323875
  const j = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relation-18323875.json'), 'utf8'));
  const rel = j.elements.find((e) => e.type === 'relation' && e.id === 18323875);
  const nodes = new Map(j.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  let i = 0;
  for (const m of rel.members || []) {
    if (m.type !== 'node') continue;
    if (!/stop|platform/.test(m.role || '')) continue;
    const n = nodes.get(m.ref);
    console.log(++i, m.role, n?.tags?.name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
