'use strict';
/**
 * Fetch full OSM relations for 舞浜リゾート線 route 12.
 * Path sources: 18381678 (master), 18381677 (outbound 浦安→舞浜), 18381676 (inbound).
 * FORBIDDEN as route-12 canonical: 9983006, 18323875 (route-4).
 *   Optional doc-only fetch into _forbidden_route4_*.json — never use as path source.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18381678, 18381677, 18381676];
const LABELS = {
  18381678: 'route12 route_master',
  18381677: 'route12 浦安→舞浜 (outbound)',
  18381676: 'route12 舞浜→浦安 (inbound)',
};
const UA = 'chidori-route-trainer/route12-maihama-resort-research';

/** Never use as route-12 canonical path source. Doc-only optional fetch allowed. */
const FORBIDDEN_ROUTE4 = [9983006, 18323875];

const OVERPASS_HOSTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'maps.mail.ru/osm/tools/overpass',
];

/** Platform-name needles that suggest TDL / Disney contamination (route-4 territory). */
const TDL_NEEDLES = [
  'TDL',
  '東京ディズニーランド',
  'ディズニーランド',
  'ディズニーシー',
  '東京ディズニーシー',
  'TDS',
  'ディズニーリゾートライン',
  'リゾートゲートウェイ',
  'ベイサイド・ステーション',
  '東京ディズニー',
];

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
    const n = m.type === 'node' ? elements.find((e) => e.type === 'node' && e.id === m.ref) : null;
    names.push({
      role: m.role || '',
      type: m.type,
      ref: m.ref,
      name: name || null,
      lat: n?.lat ?? null,
      lon: n?.lon ?? null,
      local_ref: n?.tags?.local_ref || null,
      tags: n?.tags || null,
    });
  }
  return names;
}

function detectTdlContamination(platformNames) {
  const hits = [];
  for (const name of platformNames || []) {
    if (!name) continue;
    for (const needle of TDL_NEEDLES) {
      if (name.includes(needle)) {
        hits.push({ name, needle });
        break;
      }
    }
  }
  return {
    contaminated: hits.length > 0,
    hits,
  };
}

function summarizeWayAccessTags(json, wayMemberIds) {
  const elements = json.elements || [];
  const wayIdSet = new Set(wayMemberIds || []);
  const memberWays = elements.filter((e) => e.type === 'way' && wayIdSet.has(e.id));
  const allWays = elements.filter((e) => e.type === 'way');
  const target = memberWays.length > 0 ? memberWays : allWays;

  const countKey = (map, key) => {
    const k = key == null || key === '' ? '(unset)' : String(key);
    map[k] = (map[k] || 0) + 1;
  };

  const access = {};
  const bus = {};
  const psv = {};
  const highway = {};
  const withAnyRestrict = [];
  for (const w of target) {
    const t = w.tags || {};
    countKey(access, t.access);
    countKey(bus, t.bus);
    countKey(psv, t.psv);
    countKey(highway, t.highway);
    if (t.access != null || t.bus != null || t.psv != null) {
      withAnyRestrict.push({
        id: w.id,
        name: t.name || t['name:ja'] || null,
        access: t.access ?? null,
        bus: t.bus ?? null,
        psv: t.psv ?? null,
        highway: t.highway ?? null,
      });
    }
  }

  return {
    wayCountSummarized: target.length,
    summarizedFrom: memberWays.length > 0 ? 'relation-way-members' : 'all-way-elements',
    access,
    bus,
    psv,
    highway,
    waysWithAccessBusOrPsv: withAnyRestrict,
    waysWithAccessBusOrPsvCount: withAnyRestrict.length,
  };
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
    if (FORBIDDEN_ROUTE4.includes(m.ref)) {
      console.warn('SKIP forbidden route-4 child (doc-only)', m.ref);
      continue;
    }
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
    (m) => /stop|platform|stop_entry_only|stop_exit_only/.test(m.role || '') || m.type === 'node',
  );
  const platformMembers = members.filter((m) => /platform/.test(m.role || ''));
  const stopOnlyMembers = members.filter((m) => /^stop/.test(m.role || ''));
  const wayMembers = members.filter((m) => m.type === 'way');
  const platforms = platformNamesFromRelation(json, id);
  const platformNames = platforms.map((p) => p.name).filter(Boolean);
  const tdl = detectTdlContamination(platformNames);
  const waysSummary = summarizeWayAccessTags(
    json,
    wayMembers.map((m) => m.ref),
  );
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
    'tdl?',
    tdl.contaminated,
    'via',
    source,
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
    platformNames,
    platformsDetail: platforms,
    wayMemberIds: wayMembers.map((m) => m.ref),
    waysSummary,
    tdlContamination: tdl,
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

async function fetchRawRelation(id, { allowForbidden = false } = {}) {
  if (FORBIDDEN_ROUTE4.includes(id) && !allowForbidden) {
    throw new Error(
      `FORBIDDEN route-4 relation ${id} (use allowForbidden for doc-only fetch)`,
    );
  }
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
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
    throw new Error(
      `all fetch failed: overpass=${lastErr?.message || lastErr}; osm06=${e2.message || e2}`,
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

async function fetchForbiddenRoute4DocOnly(id) {
  const file = path.join(OUT, `_forbidden_route4_${id}.json`);
  try {
    const { json, source } = await fetchRawRelation(id, { allowForbidden: true });
    const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
    const platforms = platformNamesFromRelation(json, id);
    const platformNames = platforms.map((p) => p.name).filter(Boolean);
    const wayMembers = (rel?.members || []).filter((m) => m.type === 'way');
    const waysSummary = summarizeWayAccessTags(
      json,
      wayMembers.map((m) => m.ref),
    );
    const tdl = detectTdlContamination(platformNames);
    const payload = {
      label: 'FORBIDDEN route-4 — documentation only; do NOT use as route-12 canonical',
      forbidden: true,
      route4: true,
      pathSourceAllowed: false,
      fetchedAt: new Date().toISOString(),
      source,
      id,
      name: rel?.tags?.name || null,
      tags: rel?.tags || {},
      wayMemberCount: wayMembers.length,
      platformNames,
      waysSummary,
      tdlContamination: tdl,
      note: '9983006 / 18323875 are route-4 (富岡線等). Never treat as route-12 path source.',
      elements: json.elements,
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    console.log('doc-only forbidden route-4 written', file);
    return {
      id,
      ok: true,
      forbidden: true,
      route4: true,
      pathSourceAllowed: false,
      source,
      name: rel?.tags?.name || null,
      tags: rel?.tags || {},
      wayMemberCount: wayMembers.length,
      platformNames,
      waysSummary,
      tdlContamination: tdl,
      file: `_forbidden_route4_${id}.json`,
    };
  } catch (e) {
    return {
      id,
      ok: false,
      forbidden: true,
      route4: true,
      pathSourceAllowed: false,
      error: String(e.message || e),
    };
  }
}

async function main() {
  const summary = {
    fetchedAt: new Date().toISOString(),
    route: 'maihama-resort-route12',
    knownPathSourceIds: IDS,
    forbiddenRoute4Ids: FORBIDDEN_ROUTE4,
    forbiddenNote:
      '9983006 and 18323875 are route-4 and must NOT be used as route-12 canonical. Optional doc-only fetch only.',
    relations: [],
    forbiddenRoute4: [],
  };

  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 2000));
  }

  for (const id of FORBIDDEN_ROUTE4) {
    summary.forbiddenRoute4.push(await fetchForbiddenRoute4DocOnly(id));
    await new Promise((r) => setTimeout(r, 2000));
  }

  const interest = [
    '浦安駅',
    '浦安駅入口',
    '舞浜',
    '舞浜駅',
    '舞浜リゾート',
    'イクスピアリ',
    'ディズニー',
    'TDL',
    'TDS',
    '東京ディズニーランド',
    '千鳥',
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
      tdlContamination: relSum.tdlContamination || detectTdlContamination(names),
    };
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');

  const out77 = summary.relations.find((r) => r.id === 18381677);
  const out76 = summary.relations.find((r) => r.id === 18381676);
  console.log(
    JSON.stringify(
      {
        ok: summary.relations.map((r) => ({
          id: r.id,
          ok: r.ok,
          ways: r.wayMemberCount,
          platforms: r.platformMemberCount,
          name: r.name,
          tdl: r.tdlContamination?.contaminated ?? null,
        })),
        outbound18381677Platforms: out77?.platformNames || [],
        inbound18381676Platforms: out76?.platformNames || [],
        outboundTdl: out77?.tdlContamination || null,
        inboundTdl: out76?.tdlContamination || null,
        forbiddenRoute4: summary.forbiddenRoute4.map((f) => ({
          id: f.id,
          ok: f.ok,
          name: f.name,
          pathSourceAllowed: false,
          platforms: f.platformNames || [],
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
