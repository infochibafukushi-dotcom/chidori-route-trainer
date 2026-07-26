'use strict';
/**
 * Fetch full OSM relations for 日の出線 route 17 (日の出東・東京電力経由).
 * Known seeds:
 *   18396569 新浦安駅⇒東京電力⇒日の出七丁目 (ref=17)
 *   18396568 日の出七丁目⇒東京電力⇒新浦安駅 (ref=17)
 * Additional ref=17 relations (Bay City variants) are DISCOVERED via Overpass, not assumed.
 *
 * Also probes ref=16 bus relations / route_master in the Urayasu bbox.
 * ref=16 is fetched ONLY as a separation guard: route 16 (プラウド新浦安パークマリーナ・
 * 海風の街経由) is a DIFFERENT system that also terminates at 日の出七丁目. We record its
 * ids/tags so we can prove we never mixed 16 geometry into 17.
 *
 * Writes osm-relation-<id>.json + osm-relations-summary.json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const SEED_IDS = [18396569, 18396568];
/** route-16 relations. Fetching or using any of these for route-17 geometry is forbidden. */
const FORBIDDEN_ROUTE16_IDS = new Set([18396562, 18396563]);
const LABELS = {
  18396569: 'route17 新浦安駅⇒東京電力⇒日の出七丁目 (seed)',
  18396568: 'route17 日の出七丁目⇒東京電力⇒新浦安駅 (seed)',
};
const UA = 'chidori-route-trainer/route17-hinode-research';

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

const overpassUrl = (host, query) => `https://${host}/api/interpreter?data=${encodeURIComponent(query)}`;

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
  if (FORBIDDEN_ROUTE16_IDS.has(id)) {
    throw new Error(`route-16 relation ${id} must never be fetched for route-17 geometry`);
  }
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
relation["route"="bus"]["ref"="${ref}"](35.60,139.85,35.70,139.96);
out tags;
relation["type"="route_master"]["ref"="${ref}"](35.60,139.85,35.70,139.96);
out tags;`;
  try {
    const json = await overpass(q);
    return (json.elements || []).map((e) => ({ id: e.id, type: e.type, tags: e.tags }));
  } catch (e) {
    return [{ error: String(e.message || e) }];
  }
}

/** Any bus relation touching 日の出東 / 東京電力 platforms — catches ref-less or oddly tagged variants. */
async function probeByPlatformName() {
  const q = `[out:json][timeout:150];
node["highway"="bus_stop"]["name"~"日の出東|東京電力|アールフォーラム|日の出小学校|日の出保育園"](35.60,139.85,35.70,139.96)->.p;
rel(bn.p)["route"="bus"];
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
    route: 'hinode-route17',
    lineName: '日の出線',
    seedIds: SEED_IDS,
    separationGuard: 'ref=16 (プラウド新浦安パークマリーナ・海風の街経由) relations 18396562/18396563 are listed but NEVER used for route-17 geometry.',
    relations: [],
  };

  console.log('probe ref=17 relations in bbox');
  summary.refProbe17 = await probeRefRelations('17');
  await new Promise((r) => setTimeout(r, 1500));
  console.log('probe ref=16 relations in bbox (separation guard)');
  summary.refProbe16 = await probeRefRelations('16');
  await new Promise((r) => setTimeout(r, 1500));
  console.log('probe by route-17 exclusive platform names');
  summary.platformProbe = await probeByPlatformName();
  await new Promise((r) => setTimeout(r, 1500));

  const discovered = (summary.refProbe17 || [])
    .filter((e) => e.type === 'relation' && e.tags?.route === 'bus')
    .map((e) => e.id);
  const ids = [...new Set([...SEED_IDS, ...discovered])].filter((id) => !FORBIDDEN_ROUTE16_IDS.has(id));
  summary.fetchedIds = ids;
  summary.discoveredBeyondSeeds = discovered.filter((id) => !SEED_IDS.includes(id));
  console.log('IDS TO FETCH', JSON.stringify(ids));

  for (const id of ids) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 1500));
  }

  const interest = [
    '新浦安駅', '日の出七丁目', 'ベイシティ浦安', '日の出東', '東京電力', '日の出小学校',
    '日の出保育園入口', 'アールフォーラム', '順天堂大学', '日の出 東口', '日の出正門',
    'プラウド新浦安パークマリーナ', '日の出中学校', '日の出西', '明海大学', '入船中央エステート',
    '海風の街',
  ];
  summary.nameChecks = {};
  for (const relSum of summary.relations.filter((r) => r.ok)) {
    const names = relSum.platformNames || [];
    summary.nameChecks[relSum.id] = {
      label: relSum.label, name: relSum.name, stopCount: names.length, allNames: names,
      hits: interest.map((needle) => ({ needle, found: names.some((n) => n && n.includes(needle)), matches: names.filter((n) => n && n.includes(needle)) })),
    };
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');
  for (const r of summary.relations) {
    console.log('---', r.id, r.ok ? r.name : `ERROR ${r.error}`, '| ways', r.wayMemberCount, '| platforms', r.platformMemberCount);
    if (r.ok) console.log((r.platformNames || []).join(' > '));
  }
  console.log('=== ref=17 probe ===');
  for (const p of summary.refProbe17 || []) console.log(p.type, p.id, JSON.stringify(p.tags || p));
  console.log('=== ref=16 probe (SEPARATION GUARD, NOT USED) ===');
  for (const p of summary.refProbe16 || []) console.log(p.type, p.id, JSON.stringify(p.tags || p));
  console.log('=== platform-name probe ===');
  for (const p of summary.platformProbe || []) console.log(p.type, p.id, JSON.stringify(p.tags || p));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
