'use strict';
/**
 * Fetch full OSM relations for 大三角線 route 37.
 * Also probes ref=9 as separation guard (NOT used for route-37 geometry).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18323271, 18323272];
const LABELS = {
  18323271: 'route37 南行徳駅⇒豊受神社⇒舞浜駅・TDS (network=舞浜線 tag — verify ref=37)',
  18323272: 'route37 TDS・舞浜駅⇒豊受神社⇒南行徳駅 (network=大三角線)',
};
const UA = 'chidori-route-trainer/route37-daisankaku-research';
const OVERPASS_HOSTS = ['overpass.kumi.systems', 'overpass-api.de', 'overpass.osm.jp'];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} ${url}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

function overpassUrl(host, query) {
  return `https://${host}/api/interpreter?data=${encodeURIComponent(query)}`;
}

async function overpass(query) {
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
    try {
      console.log('  overpass via', host);
      const raw = await get(overpassUrl(host, query));
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
      console.error('  fail', host, e.message || e);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastErr;
}

async function fetchRawRelation(id) {
  const q = `[out:json][timeout:180];relation(${id});(._;>;);out body;`;
  try {
    return { json: await overpass(q), source: 'overpass' };
  } catch (e) {
    console.log('  fallback osm-api-0.6', id);
    const raw = await get(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`);
    return { json: JSON.parse(raw), source: 'api.openstreetmap.org/0.6' };
  }
}

function nodeName(elements, ref) {
  const n = elements.find((e) => e.type === 'node' && e.id === ref);
  if (!n) return null;
  return n.tags?.name || n.tags?.['name:ja'] || n.tags?.ref || null;
}

function platformNamesFromRelation(json, id) {
  const elements = json.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  if (!rel) return [];
  const names = [];
  for (const m of rel.members || []) {
    if (!/platform|stop/.test(m.role || '')) continue;
    let name = null;
    if (m.type === 'node') name = nodeName(elements, m.ref);
    const n = m.type === 'node' ? elements.find((e) => e.type === 'node' && e.id === m.ref) : null;
    names.push({
      role: m.role || '', type: m.type, ref: m.ref, name: name || null,
      lat: n?.lat ?? null, lon: n?.lon ?? null, local_ref: n?.tags?.local_ref || null,
    });
  }
  return names;
}

function summarize(id, json, source) {
  const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
  const members = rel?.members || [];
  const roleCounts = {};
  for (const m of members) roleCounts[m.role || ''] = (roleCounts[m.role || ''] || 0) + 1;
  const platformMembers = members.filter((m) => /platform/.test(m.role || ''));
  const wayMembers = members.filter((m) => m.type === 'way');
  const platforms = platformNamesFromRelation(json, id);
  const platformNames = platforms.map((p) => p.name).filter(Boolean);
  console.log(id, LABELS[id] || '', '| ways', wayMembers.length, '| platforms', platformMembers.length, '| via', source);
  console.log('  network:', rel?.tags?.network, '| ref:', rel?.tags?.ref, '| name:', rel?.tags?.name);
  return {
    id, label: LABELS[id] || null, ok: true, source,
    name: rel?.tags?.name || null, tags: rel?.tags || {},
    memberCount: members.length, wayMemberCount: wayMembers.length,
    platformMemberCount: platformMembers.length, memberRoles: roleCounts,
    platformNames, platformsDetail: platforms,
    wayMemberIds: wayMembers.map((m) => m.ref),
    file: `osm-relation-${id}.json`,
  };
}

async function fetchRelation(id) {
  const file = path.join(OUT, `osm-relation-${id}.json`);
  try {
    console.log('fetch', id, LABELS[id] || '');
    const { json, source } = await fetchRawRelation(id);
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    return summarize(id, json, source);
  } catch (e) {
    return { id, label: LABELS[id] || null, ok: false, error: String(e.message || e) };
  }
}

async function probeRefRelations(ref) {
  const q = `[out:json][timeout:120];
relation["route"="bus"]["ref"="${ref}"](35.61,139.85,35.68,139.96);
out tags;`;
  try {
    const json = await overpass(q);
    return (json.elements || []).map((e) => ({ id: e.id, type: e.type, tags: e.tags }));
  } catch (e) {
    return [{ error: String(e.message || e) }];
  }
}

async function main() {
  const summary = {
    fetchedAt: new Date().toISOString(),
    route: 'daisankaku-route37',
    lineName: '大三角線',
    knownPathSourceIds: IDS,
    separationGuard: 'ref=9 relations are listed but NEVER used for route-37 geometry.',
    relations: [],
  };

  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('probe ref=9 (route-9 舞浜線 guard)');
  summary.refProbe9 = await probeRefRelations('9');

  for (const relSum of summary.relations.filter((r) => r.ok)) {
    console.log('---', relSum.id, relSum.name);
    console.log((relSum.platformNames || []).join(' > '));
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations.json'), JSON.stringify(summary, null, 2));
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
