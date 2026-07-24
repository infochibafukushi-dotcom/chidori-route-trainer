'use strict';
/** Fetch full OSM relations for 舞浜線 route 9 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18320324, 18320323, 3498220, 18419886, 18419885, 18419884];
const LABELS = {
  18320324: 'route9 master (candidate)',
  18320323: 'route9 variant (candidate)',
  3498220: 'route9 relation (candidate)',
  18419886: 'route9 outbound/variant (candidate)',
  18419885: 'route9 inbound/variant (candidate)',
  18419884: 'route9 variant (candidate)',
};
const UA = 'chidori-route-trainer/route9-maihama-research';

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

function nodeName(elements, ref) {
  const n = elements.find((e) => e.type === 'node' && e.id === ref);
  if (!n) return null;
  return n.tags?.name || n.tags?.['name:ja'] || n.tags?.ref || null;
}

function wayName(elements, ref) {
  const w = elements.find((e) => e.type === 'way' && e.id === ref);
  if (!w) return null;
  return w.tags?.name || w.tags?.['name:ja'] || w.tags?.ref || null;
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
    else if (m.type === 'way') name = wayName(elements, m.ref);
    else if (m.type === 'relation') {
      const child = elements.find((e) => e.type === 'relation' && e.id === m.ref);
      name = child?.tags?.name || child?.tags?.['name:ja'] || null;
    }
    names.push({
      role: m.role || '',
      type: m.type,
      ref: m.ref,
      name: name || null,
    });
  }
  return names;
}

function countWaysInBundle(json) {
  return (json.elements || []).filter((e) => e.type === 'way').length;
}

async function enrichRouteMaster(json, id, fetchChild) {
  const elements = json.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  if (!rel) return { json, mergedChildren: [] };
  const isMaster = rel.tags?.type === 'route_master' || rel.tags?.route_master != null;
  const wayMembers = (rel.members || []).filter((m) => m.type === 'way');
  const childRels = (rel.members || []).filter((m) => m.type === 'relation');
  if (!isMaster && wayMembers.length > 0) return { json, mergedChildren: [] };
  if (wayMembers.length > 0 && countWaysInBundle(json) > 0) {
    return { json, mergedChildren: [] };
  }
  if (childRels.length === 0) return { json, mergedChildren: [] };
  if (countWaysInBundle(json) > 0) {
    return {
      json,
      mergedChildren: childRels.map((m) => m.ref),
      note: 'child geometries already present via Overpass expansion',
    };
  }

  const seen = new Set(elements.map((e) => `${e.type}/${e.id}`));
  const mergedChildren = [];
  for (const m of childRels) {
    try {
      const childJson = await fetchChild(m.ref);
      mergedChildren.push(m.ref);
      for (const el of childJson.elements || []) {
        const key = `${el.type}/${el.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          elements.push(el);
        }
      }
    } catch (e) {
      console.error('merge child fail', id, '<-', m.ref, e.message || e);
    }
  }
  json.elements = elements;
  return { json, mergedChildren, note: 'merged child relation geometries into master bundle' };
}

function summarize(id, json, source, extra = {}) {
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
  const platforms = platformNamesFromRelation(json, id);
  console.log(
    id,
    LABELS[id] || '',
    'tags',
    rel?.tags?.name || rel?.tags?.ref || '',
    'ways',
    wayMembers.length,
    'wayElems',
    ways.length,
    'stops/platforms',
    stopMembers.length,
    'via',
    source
  );
  return {
    id,
    label: LABELS[id] || null,
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
    platformNames: platforms.map((p) => p.name).filter(Boolean),
    platformsDetail: platforms,
    file: `osm-relation-${id}.json`,
    ...extra,
  };
}

async function fetchOverpass(host, id) {
  const raw = await get(overpassUrl(host, id));
  return JSON.parse(raw);
}

async function fetchOsmApi06(id) {
  const raw = await get(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`);
  return JSON.parse(raw);
}

async function fetchRawRelation(id) {
  const hosts = ['overpass-api.de', 'overpass.kumi.systems'];
  let lastErr = null;
  for (const host of hosts) {
    try {
      console.log('fetch', id, 'via', host);
      const json = await fetchOverpass(host, id);
      return { json, source: host };
    } catch (e) {
      lastErr = e;
      console.error('fail', id, host, e.message || e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  try {
    console.log('fetch', id, 'via osm-api-0.6');
    const json = await fetchOsmApi06(id);
    return { json, source: 'api.openstreetmap.org/0.6' };
  } catch (e2) {
    console.error('fail', id, 'osm-api-0.6', e2.message || e2);
    throw new Error(
      `all fetch failed: overpass=${lastErr?.message || lastErr}; osm06=${e2.message || e2}`
    );
  }
}

async function fetchRelation(id) {
  const file = path.join(OUT, `osm-relation-${id}.json`);
  try {
    let { json, source } = await fetchRawRelation(id);
    const enrich = await enrichRouteMaster(json, id, async (childId) => {
      const r = await fetchRawRelation(childId);
      return r.json;
    });
    json = enrich.json;
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    return summarize(id, json, source, {
      mergedChildren: enrich.mergedChildren || [],
      mergeNote: enrich.note || null,
    });
  } catch (e) {
    return {
      id,
      label: LABELS[id] || null,
      ok: false,
      error: String(e.message || e),
    };
  }
}

async function main() {
  const summary = {
    fetchedAt: new Date().toISOString(),
    route: 'maihama-route9',
    relations: [],
  };
  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 2000));
  }

  const interest = [
    '京成ローズタウン',
    '富士見三丁目',
    '富士見五丁目',
    '東海大浦安高校入口',
    '東海大浦安高校前',
    '堀江六丁目',
    '舞浜駅',
    '浦安駅入口',
  ];
  summary.nameChecks = {};
  for (const relSum of summary.relations.filter((r) => r.ok)) {
    const names = relSum.platformNames || [];
    summary.nameChecks[relSum.id] = {
      label: LABELS[relSum.id],
      name: relSum.name,
      allNames: names,
      hits: interest.map((needle) => ({
        needle,
        found: names.some((n) => n && n.includes(needle)),
        matches: names.filter((n) => n && n.includes(needle)),
      })),
    };
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
