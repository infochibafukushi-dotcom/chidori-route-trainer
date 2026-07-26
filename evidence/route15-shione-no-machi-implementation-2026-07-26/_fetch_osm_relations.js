'use strict';
/**
 * Fetch full OSM relations for 潮音の街線 route 15.
 *   18419865 新浦安駅⇒東京学館⇒高洲海浜公園 (ref=15)
 *   18419864 高洲海浜公園⇒東京学館⇒新浦安駅 (ref=15)
 * Also probes ref=15 bus relations / route_master in the Urayasu bbox so a
 * 高洲北小学校 variant (if it exists as its own relation) cannot be missed.
 *
 * Writes osm-relation-<id>.json + osm-relations-summary.json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18419865, 18419864];
const LABELS = {
  18419865: 'route15 新浦安駅⇒東京学館⇒高洲海浜公園',
  18419864: 'route15 高洲海浜公園⇒東京学館⇒新浦安駅',
};
const UA = 'chidori-route-trainer/route15-shione-no-machi-research';

const OVERPASS_HOSTS = ['overpass.kumi.systems', 'overpass-api.de', 'overpass.osm.jp'];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
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
    const n = m.type === 'node' ? elements.find((e) => e.type === 'node' && e.id === m.ref) : null;
    names.push({
      role: m.role || '', type: m.type, ref: m.ref, name: name || null,
      lat: n?.lat ?? null, lon: n?.lon ?? null, local_ref: n?.tags?.local_ref || null, tags: n?.tags || null,
    });
  }
  return names;
}

function summarizeWayAccessTags(json, wayMemberIds) {
  const elements = json.elements || [];
  const wayIdSet = new Set(wayMemberIds || []);
  const memberWays = elements.filter((e) => e.type === 'way' && wayIdSet.has(e.id));
  const target = memberWays.length > 0 ? memberWays : elements.filter((e) => e.type === 'way');
  const countKey = (map, key) => {
    const k = key == null || key === '' ? '(unset)' : String(key);
    map[k] = (map[k] || 0) + 1;
  };
  const access = {}; const bus = {}; const psv = {}; const highway = {};
  const withAnyRestrict = [];
  for (const w of target) {
    const t = w.tags || {};
    countKey(access, t.access); countKey(bus, t.bus); countKey(psv, t.psv); countKey(highway, t.highway);
    if (t.access != null || t.bus != null || t.psv != null) {
      withAnyRestrict.push({
        id: w.id, name: t.name || t['name:ja'] || null, access: t.access ?? null,
        bus: t.bus ?? null, psv: t.psv ?? null, highway: t.highway ?? null,
        vehicle: t.vehicle ?? null, motor_vehicle: t.motor_vehicle ?? null, oneway: t.oneway ?? null,
      });
    }
  }
  return {
    wayCountSummarized: target.length,
    summarizedFrom: memberWays.length > 0 ? 'relation-way-members' : 'all-way-elements',
    access, bus, psv, highway,
    waysWithAccessBusOrPsv: withAnyRestrict,
    waysWithAccessBusOrPsvCount: withAnyRestrict.length,
  };
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
  const platformMembers = members.filter((m) => /platform/.test(m.role || ''));
  const stopOnlyMembers = members.filter((m) => /^stop/.test(m.role || ''));
  const wayMembers = members.filter((m) => m.type === 'way');
  const platforms = platformNamesFromRelation(json, id);
  const platformNames = platforms.map((p) => p.name).filter(Boolean);
  const waysSummary = summarizeWayAccessTags(json, wayMembers.map((m) => m.ref));
  console.log(id, LABELS[id] || '', '| ways', wayMembers.length, '| wayElems', ways.length, '| platforms', platformMembers.length, '| via', source);
  return {
    id, label: LABELS[id] || null, ok: true, source,
    name: rel?.tags?.name || null, tags: rel?.tags || {},
    memberCount: members.length, wayMemberCount: wayMembers.length, wayElementCount: ways.length,
    stopRoleCount: stopOnlyMembers.length, platformMemberCount: platformMembers.length,
    nodeElementCount: nodes.length, memberRoles: roleCounts,
    platformNames, platformsDetail: platforms,
    wayMemberIds: wayMembers.map((m) => m.ref),
    waysSummary,
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

async function probeRefRelations() {
  const q = `[out:json][timeout:120];
relation["route"="bus"]["ref"="15"](35.60,139.85,35.70,139.96);
out tags;
relation["type"="route_master"]["ref"="15"](35.60,139.85,35.70,139.96);
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
    route: 'shione-no-machi-route15',
    lineName: '潮音の街線',
    knownPathSourceIds: IDS,
    relations: [],
  };

  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('probe ref=15 relations in bbox');
  summary.refProbe = await probeRefRelations();

  const interest = ['新浦安駅', '入船橋', '東京学館', '高洲中央公園', '潮音の街', '高洲海浜公園', '高洲北小学校', '高洲四丁目'];
  summary.nameChecks = {};
  for (const relSum of summary.relations.filter((r) => r.ok)) {
    const names = relSum.platformNames || [];
    summary.nameChecks[relSum.id] = {
      label: LABELS[relSum.id], name: relSum.name, stopCount: names.length, allNames: names,
      hits: interest.map((needle) => ({ needle, found: names.some((n) => n && n.includes(needle)), matches: names.filter((n) => n && n.includes(needle)) })),
    };
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');
  console.log(JSON.stringify(summary.relations.map((r) => ({ id: r.id, ok: r.ok, ways: r.wayMemberCount, platforms: r.platformMemberCount, name: r.name, error: r.error })), null, 2));
  for (const r of summary.relations.filter((x) => x.ok)) {
    console.log('---', r.id, r.name);
    console.log((r.platformNames || []).join(' > '));
  }
  console.log('=== ref=15 probe ===');
  for (const p of summary.refProbe || []) {
    console.log(p.type, p.id, JSON.stringify(p.tags || p));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
