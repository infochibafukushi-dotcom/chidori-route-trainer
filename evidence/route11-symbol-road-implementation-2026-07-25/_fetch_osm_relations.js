'use strict';
/**
 * Fetch full OSM relations for シンボルロード線 route 11.
 * Path sources: 18352885 (master), 18352884 (outbound), 18352883 (inbound).
 * FORBIDDEN as path source unless later confirmed: 18419852
 *   (optional fetch into _forbidden_candidate_18419852.json for documentation only).
 * Do NOT treat 高洲海浜公園 as implementable without official confirmation.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const IDS = [18352885, 18352884, 18352883];
const LABELS = {
  18352885: 'route11 route_master',
  18352884: 'route11 浦安駅入口→日の出南 (outbound)',
  18352883: 'route11 日の出南→浦安駅入口 (inbound)',
};
const UA = 'chidori-route-trainer/route11-symbol-road-research';

/** Never use as a path source unless later confirmed. Doc-only optional fetch allowed. */
const FORBIDDEN_PATH_SOURCE = [18419852];

/** Approx Urayasu / シンボルロード area (~35.64, 139.90) */
const BBOX = {
  south: 35.62,
  west: 139.88,
  north: 35.67,
  east: 139.93,
};

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

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} POST ${url}`));
          else resolve(d);
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const OVERPASS_HOSTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'maps.mail.ru/osm/tools/overpass',
];

function overpassUrl(host, id) {
  const q = `[out:json][timeout:180];relation(${id});(._;>;);out body;`;
  return `https://${host}/api/interpreter?data=${encodeURIComponent(q)}`;
}

function ref11SearchQuery() {
  const { south, west, north, east } = BBOX;
  // Prefer bbox; also include around-center fallback in same query via union
  return `[out:json][timeout:180];
(
  relation["type"="route"]["route"="bus"]["ref"="11"](${south},${west},${north},${east});
  relation["type"="route_master"]["route_master"="bus"]["ref"="11"](${south},${west},${north},${east});
  relation["type"="route"]["route"="bus"]["ref"="11"](around:12000,35.64,139.90);
  relation["type"="route_master"]["route_master"="bus"]["ref"="11"](around:12000,35.64,139.90);
);
out tags;`;
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
    if (FORBIDDEN_PATH_SOURCE.includes(m.ref)) {
      console.warn('SKIP forbidden path-source child (doc-only)', m.ref);
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
    platformNames: platforms.map((p) => p.name).filter(Boolean),
    platformsDetail: platforms,
    wayMemberIds: wayMembers.map((m) => m.ref),
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
  if (FORBIDDEN_PATH_SOURCE.includes(id) && !allowForbidden) {
    throw new Error(
      `FORBIDDEN path-source relation ${id} (use allowForbidden for doc-only fetch)`,
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

async function fetchForbiddenCandidateDocOnly(id) {
  const file = path.join(OUT, `_forbidden_candidate_${id}.json`);
  try {
    const { json, source } = await fetchRawRelation(id, { allowForbidden: true });
    const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
    const platforms = platformNamesFromRelation(json, id);
    const wayMembers = (rel?.members || []).filter((m) => m.type === 'way');
    const payload = {
      label: 'FORBIDDEN path source — documentation only; do NOT use for route11 implementation',
      forbidden: true,
      pathSourceAllowed: false,
      fetchedAt: new Date().toISOString(),
      source,
      id,
      name: rel?.tags?.name || null,
      tags: rel?.tags || {},
      wayMemberCount: wayMembers.length,
      platformNames: platforms.map((p) => p.name).filter(Boolean),
      note: '高洲海浜公園等は公式確認なしでは実装対象にしない',
      elements: json.elements,
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    console.log('doc-only forbidden candidate written', file);
    return {
      id,
      ok: true,
      forbidden: true,
      pathSourceAllowed: false,
      source,
      name: rel?.tags?.name || null,
      tags: rel?.tags || {},
      wayMemberCount: wayMembers.length,
      platformNames: platforms.map((p) => p.name).filter(Boolean),
      file: `_forbidden_candidate_${id}.json`,
    };
  } catch (e) {
    return {
      id,
      ok: false,
      forbidden: true,
      pathSourceAllowed: false,
      error: String(e.message || e),
    };
  }
}

function mapRef11Candidates(elements) {
  const seen = new Set();
  const candidates = [];
  for (const e of elements || []) {
    if (e.type !== 'relation' || seen.has(e.id)) continue;
    seen.add(e.id);
    const tags = e.tags || {};
    candidates.push({
      id: e.id,
      name: tags.name || tags['name:ja'] || null,
      from: tags.from || null,
      to: tags.to || null,
      ref: tags.ref || null,
      type: tags.type || null,
      route: tags.route || tags.route_master || null,
      tags,
      isKnownPathSource: IDS.includes(e.id),
      isForbiddenPathSource: FORBIDDEN_PATH_SOURCE.includes(e.id),
      note:
        /高洲海浜公園/.test(tags.name || '') || /高洲海浜公園/.test(tags.to || '')
          ? 'NOT implementable without official confirmation (高洲海浜公園)'
          : null,
    });
  }
  return candidates;
}

function enrichSearchWithKnown(out) {
  // Overpass spatial queries sometimes omit route_master; ensure known IDs appear
  for (const id of IDS) {
    if (out.candidates.some((c) => c.id === id)) continue;
    const file = path.join(OUT, `osm-relation-${id}.json`);
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rel = (json.elements || []).find((e) => e.type === 'relation' && e.id === id);
    if (!rel?.tags) continue;
    out.candidates.push(...mapRef11Candidates([{ type: 'relation', id, tags: rel.tags }]));
    out.noteMaster =
      (out.noteMaster ? out.noteMaster + '; ' : '') +
      `relation ${id} added from direct fetch (not returned by Overpass spatial query)`;
  }
  out.candidateCount = out.candidates.length;
  fs.writeFileSync(path.join(OUT, 'osm-ref11-search.json'), JSON.stringify(out, null, 2));
  return out;
}

async function searchRef11() {
  const q = ref11SearchQuery();
  const body = `data=${encodeURIComponent(q)}`;
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
    const url = `https://${host}/api/interpreter`;
    try {
      console.log('search ref=11 POST via', host);
      const raw = await post(url, body);
      const json = JSON.parse(raw);
      const candidates = mapRef11Candidates(json.elements);
      const out = {
        fetchedAt: new Date().toISOString(),
        ok: true,
        query: {
          type: 'route|route_master',
          route: 'bus',
          ref: '11',
          bbox: BBOX,
          around: { lat: 35.64, lon: 139.9, radiusM: 12000 },
        },
        source: host,
        method: 'POST',
        candidateCount: candidates.length,
        candidates,
        knownPathSourceIds: IDS,
        forbiddenPathSourceIds: FORBIDDEN_PATH_SOURCE,
        warning:
          'Do not treat 高洲海浜公園 variants as implementable without official confirmation. Do not use 18419852 as a path source unless later confirmed.',
      };
      fs.writeFileSync(path.join(OUT, 'osm-ref11-search.json'), JSON.stringify(out, null, 2));
      console.log('ref=11 candidates:', candidates.length);
      return enrichSearchWithKnown(out);
    } catch (e) {
      lastErr = e;
      console.error('search fail', host, e.message || e);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // Last resort: tag info from already-fetched relations + OSM API metadata for forbidden id
  try {
    console.log('search ref=11 fallback via known relation tags');
    const candidates = [];
    for (const id of [...IDS, ...FORBIDDEN_PATH_SOURCE]) {
      const file =
        FORBIDDEN_PATH_SOURCE.includes(id)
          ? path.join(OUT, `_forbidden_candidate_${id}.json`)
          : path.join(OUT, `osm-relation-${id}.json`);
      if (!fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const els = json.elements || (json.id ? [json] : []);
      const rel = els.find((e) => e.type === 'relation' && e.id === id) || (json.tags ? json : null);
      if (!rel || !rel.tags) continue;
      candidates.push(...mapRef11Candidates([{ type: 'relation', id, tags: rel.tags }]));
    }
    const out = {
      fetchedAt: new Date().toISOString(),
      ok: true,
      partial: true,
      query: { note: 'Overpass search failed; assembled from fetched relation tags only', bbox: BBOX },
      source: 'local-fetched-relations',
      method: 'fallback',
      overpassError: String(lastErr?.message || lastErr),
      candidateCount: candidates.length,
      candidates,
      knownPathSourceIds: IDS,
      forbiddenPathSourceIds: FORBIDDEN_PATH_SOURCE,
      warning:
        'Partial search only. Do not treat 高洲海浜公園 variants as implementable without official confirmation. Do not use 18419852 as a path source unless later confirmed.',
    };
    fs.writeFileSync(path.join(OUT, 'osm-ref11-search.json'), JSON.stringify(out, null, 2));
    console.log('ref=11 fallback candidates:', candidates.length);
    return enrichSearchWithKnown(out);
  } catch (e2) {
    const fail = {
      fetchedAt: new Date().toISOString(),
      ok: false,
      error: String(lastErr?.message || lastErr),
      fallbackError: String(e2.message || e2),
      bbox: BBOX,
    };
    fs.writeFileSync(path.join(OUT, 'osm-ref11-search.json'), JSON.stringify(fail, null, 2));
    return fail;
  }
}

async function main() {
  const summary = {
    fetchedAt: new Date().toISOString(),
    route: 'symbol-road-route11',
    knownPathSourceIds: IDS,
    forbiddenPathSourceIds: FORBIDDEN_PATH_SOURCE,
    forbiddenNote:
      '18419852 must NOT be used as a path source unless later confirmed. Optional doc-only fetch only.',
    takasuKaihinParkNote:
      '高洲海浜公園 must NOT be treated as implementable without official confirmation.',
    relations: [],
    forbiddenCandidate: null,
    ref11Search: null,
  };

  for (const id of IDS) {
    summary.relations.push(await fetchRelation(id));
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Optional documentation-only fetch of forbidden candidate
  summary.forbiddenCandidate = await fetchForbiddenCandidateDocOnly(18419852);
  await new Promise((r) => setTimeout(r, 2000));

  summary.ref11Search = await searchRef11();

  const interest = [
    '浦安駅入口',
    '浦安駅',
    '日の出南',
    'シンボル',
    '高洲海浜公園',
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
      hasTakasuKaihinPark: names.some((n) => /高洲海浜公園/.test(n || '')),
    };
  }

  fs.writeFileSync(path.join(OUT, 'osm-relations-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done');

  const out84 = summary.relations.find((r) => r.id === 18352884);
  const out83 = summary.relations.find((r) => r.id === 18352883);
  const known = new Set(IDS);
  const extras = (summary.ref11Search?.candidates || []).filter((c) => !known.has(c.id));
  console.log(
    JSON.stringify(
      {
        ok: summary.relations.map((r) => ({
          id: r.id,
          ok: r.ok,
          ways: r.wayMemberCount,
          platforms: r.platformMemberCount,
          name: r.name,
        })),
        outbound18352884Platforms: out84?.platformNames || [],
        inbound18352883Platforms: out83?.platformNames || [],
        extraRef11Relations: extras.map((c) => ({
          id: c.id,
          name: c.name,
          from: c.from,
          to: c.to,
          forbidden: c.isForbiddenPathSource,
          note: c.note,
        })),
        forbiddenCandidate: summary.forbiddenCandidate
          ? {
              id: summary.forbiddenCandidate.id,
              ok: summary.forbiddenCandidate.ok,
              name: summary.forbiddenCandidate.name,
              pathSourceAllowed: false,
            }
          : null,
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
