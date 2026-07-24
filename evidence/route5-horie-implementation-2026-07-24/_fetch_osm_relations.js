'use strict';
/** Fetch full OSM relations for Horie route 5 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18417633, 18417632, 18417631];
const UA = 'chidori-route-trainer/route5-horie-research';

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': UA } }, (res) => {
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

function overpassUrl(host, id) {
  const q = `[out:json][timeout:180];relation(${id});(._;>;);out body;`;
  return `https://${host}/api/interpreter?data=${encodeURIComponent(q)}`;
}

function summarize(id, json, source) {
  const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
  const ways = (json.elements || []).filter((e) => e.type === 'way');
  const nodes = (json.elements || []).filter((e) => e.type === 'node');
  const members = rel?.members || [];
  const roleCounts = {};
  for (const m of members) {
    const role = m.role || '';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }
  const stopMembers = members.filter(
    (m) => /stop|platform|stop_entry_only|stop_exit_only/.test(m.role || '') || m.type === 'node'
  );
  const platformMembers = members.filter((m) => /platform/.test(m.role || ''));
  const stopOnlyMembers = members.filter((m) => /^stop/.test(m.role || ''));
  const wayMembers = members.filter((m) => m.type === 'way');
  console.log(
    id,
    'tags',
    rel?.tags?.name || rel?.tags?.ref || '',
    'ways',
    wayMembers.length,
    'stops',
    stopMembers.length,
    'nodes',
    nodes.length,
    'via',
    source
  );
  return {
    id,
    ok: true,
    source,
    name: rel?.tags?.name || null,
    tags: rel?.tags || {},
    memberCount: members.length,
    wayMemberCount: wayMembers.length,
    wayElementCount: ways.length,
    stopMemberCount: stopMembers.length,
    stopRoleCount: stopOnlyMembers.length,
    platformMemberCount: platformMembers.length,
    nodeElementCount: nodes.length,
    memberRoles: roleCounts,
    file: `osm-relation-${id}.json`,
  };
}

async function fetchOverpass(host, id) {
  const raw = await get(overpassUrl(host, id));
  return JSON.parse(raw);
}

/** OSM API 0.6 full relation + recursive members (rel/id/full) */
async function fetchOsmApi06(id) {
  const raw = await get(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`);
  return JSON.parse(raw);
}

async function fetchRelation(id) {
  const file = path.join(OUT, `osm-relation-${id}.json`);
  const hosts = ['overpass-api.de', 'overpass.kumi.systems'];
  let lastErr = null;
  for (const host of hosts) {
    try {
      console.log('fetch', id, 'via', host);
      const json = await fetchOverpass(host, id);
      fs.writeFileSync(file, JSON.stringify(json, null, 2));
      return summarize(id, json, host);
    } catch (e) {
      lastErr = e;
      console.error('fail', id, host, e.message || e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  try {
    console.log('fetch', id, 'via osm-api-0.6');
    const json = await fetchOsmApi06(id);
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    return summarize(id, json, 'api.openstreetmap.org/0.6');
  } catch (e2) {
    console.error('fail', id, 'osm-api-0.6', e2.message || e2);
    return {
      id,
      ok: false,
      error: String(lastErr?.message || lastErr),
      osmApiError: String(e2.message || e2),
    };
  }
}

async function main() {
  const summary = { fetchedAt: new Date().toISOString(), route: 'horie-route5', relations: [] };
  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 2000));
  }
  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
