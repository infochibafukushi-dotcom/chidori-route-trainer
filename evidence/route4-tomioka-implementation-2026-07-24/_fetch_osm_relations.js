'use strict';
/** Fetch full OSM relations for Tomioka route 4 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [9983006, 18323875, 18417665, 18417664, 18323876, 18417666];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'chidori-route-trainer/route4-research' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} ${url}`));
          else resolve(d);
        });
      })
      .on('error', reject);
  });
}

async function fetchRelation(id) {
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(`[out:json][timeout:180];relation(${id});(._;>;);out body;`)}`;
  console.log('fetch', id);
  const raw = await get(url);
  const json = JSON.parse(raw);
  const file = path.join(OUT, `osm-relation-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
  const ways = (json.elements || []).filter((e) => e.type === 'way');
  const nodes = (json.elements || []).filter((e) => e.type === 'node');
  const members = rel?.members || [];
  const stopMembers = members.filter((m) => /stop|platform|stop_entry_only|stop_exit_only/.test(m.role || '') || m.type === 'node');
  const wayMembers = members.filter((m) => m.type === 'way');
  console.log(id, 'tags', rel?.tags?.name || rel?.tags?.ref || '', 'ways', wayMembers.length, 'stops', stopMembers.length, 'nodes', nodes.length);
  return {
    id,
    name: rel?.tags?.name || null,
    tags: rel?.tags || {},
    memberCount: members.length,
    wayMemberCount: wayMembers.length,
    stopMemberCount: stopMembers.length,
    file: path.basename(file),
  };
}

async function main() {
  const summary = { fetchedAt: new Date().toISOString(), relations: [] };
  for (const id of IDS) {
    try {
      summary.relations.push(await fetchRelation(id));
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error('fail', id, e.message || e);
      summary.relations.push({ id, error: String(e.message || e) });
      // retry once via alternative endpoint
      try {
        await new Promise((r) => setTimeout(r, 3000));
        const url = `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(`[out:json][timeout:180];relation(${id});(._;>;);out body;`)}`;
        const raw = await get(url);
        const json = JSON.parse(raw);
        fs.writeFileSync(path.join(OUT, `osm-relation-${id}.json`), JSON.stringify(json, null, 2));
        summary.relations.push({ id, retried: true, ok: true });
        console.log('retry ok', id);
      } catch (e2) {
        summary.relations.push({ id, retryError: String(e2.message || e2) });
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
