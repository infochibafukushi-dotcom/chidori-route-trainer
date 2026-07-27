'use strict';
/**
 * Build platforms + pathPoints for route-25 舞浜・高洲線 from OSM relations.
 *
 * Rules:
 *  - Stop order comes from official-stop-orders.json (navi). Never reversed/truncated.
 *  - Four dedicated relations: 18352023/22/45/44 (総合公園 vs 高洲海浜公園 split).
 *  - route-10/15/18/19 relations は使用禁止。
 *
 * Writes maihama-takasu-line-*-v1.js at repo root,
 * plus _build_summary.json / _platforms_bank.json / _path_bank.json here.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

const PLATFORM_DIST_HARD_MAX = 30;
const PLATFORM_DIST_SOFT_MAX = 20;
const MAX_GAP_M = 30;
const MAX_JOIN_M = 1;
const GENERATED = '2026-07-27-maihama-takasu-line-v1';

/** OSM relations belonging to sibling routes. Present only so the guard below can assert non-use. */
const FORBIDDEN_SIBLING_RELATIONS = {
  10: [18381757, 18381756],
  15: [18419865, 18419864],
  18: [18352908, 18352907, 18417590],
  19: [18381771, 18381770],
};

/** Stops exclusive to sibling routes — must not appear in route-25 generated data. */
const FORBIDDEN_SIBLING_STOPS = {
  10: ['鉄鋼団地入口', '鉄鋼団地', 'みなと南'],
  15: ['潮音の街中央', '高洲中央公園'],
  18: ['新浦安駅', '新浦安駅北口', '夢海の街', '海風の街', '明海大学前'],
  19: ['浦安南高校特養ホーム', '高洲八丁目', '東京学館前', '高洲北小学校', '入船橋', '明海交差点'],
};
const FORBIDDEN_STOP_LIST = Object.entries(FORBIDDEN_SIBLING_STOPS)
  .flatMap(([route, names]) => names.map((name) => ({ route, name })));

/**
 * OSM ways that are access-restricted but legitimately driven by route 19.
 * Filled from the relation data at build time; every entry needs a written reason.
 */
const ACCESS_EXCEPTIONS = {};

const SYSTEMS = {
  '25-maihama-takasu-seaside': {
    relationId: 18352023,
    resolvedVersion: '2026-07-27-maihama25-maihama-takasu-seaside-v1',
    pathSource: 'osm-relation-18352023+startHint-maihama',
    platformByIndex: true,
    note: 'outbound 舞浜駅→高洲海浜公園。relation 18352023。',
  },
  '25-takasu-seaside-maihama': {
    relationId: 18352022,
    resolvedVersion: '2026-07-27-maihama25-takasu-seaside-maihama-v1',
    pathSource: 'osm-relation-18352022+startHint-takasu-seaside',
    platformByIndex: true,
    note: 'inbound 高洲海浜公園→舞浜駅。relation 18352022。',
  },
  '25-maihama-sogo': {
    relationId: 18352045,
    resolvedVersion: '2026-07-27-maihama25-maihama-sogo-v1',
    pathSource: 'osm-relation-18352045+startHint-maihama',
    platformByIndex: true,
    note: 'outbound 舞浜駅→総合公園。relation 18352045（高洲海浜公園行と分岐）。',
  },
  '25-sogo-maihama': {
    relationId: 18352044,
    resolvedVersion: '2026-07-27-maihama25-sogo-maihama-v1',
    pathSource: 'osm-relation-18352044+startHint-sogo',
    platformByIndex: true,
    note: 'inbound 総合公園→舞浜駅。relation 18352044。',
  },
};

const SYSTEM_ORDER = [
  '25-maihama-takasu-seaside',
  '25-takasu-seaside-maihama',
  '25-maihama-sogo',
  '25-sogo-maihama',
];

/** Verified composition may produce a contiguous subsequence of a through-service path. */
const ALLOWED_CONTIGUOUS_SLICE_PAIRS = [];

function loadRelation(id) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${id}.json`), 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  if (!rel) throw new Error(`relation ${id} missing`);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  const missingWays = (rel.members || [])
    .filter((m) => m.type === 'way' && !ways.has(m.ref))
    .map((m) => m.ref);
  if (missingWays.length) throw new Error(`relation ${id}: way members not downloaded: ${missingWays.join(',')}`);
  return { rel, nodes, ways, elements };
}

function platformMembers(rel, nodes) {
  const out = [];
  for (const m of rel.members || []) {
    if (m.type !== 'node') continue;
    if (!/platform|stop/.test(m.role || '')) continue;
    const n = nodes.get(m.ref);
    if (!n || !Number.isFinite(n.lat)) continue;
    out.push({
      role: m.role,
      platformId: m.ref,
      name: n.tags?.name || n.tags?.['name:ja'] || `node-${m.ref}`,
      lat: n.lat,
      lng: n.lon,
      tags: n.tags || {},
    });
  }
  return out;
}

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR((b.lng ?? b.lon) - (a.lng ?? a.lon));
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function wayCoords(way, nodes) {
  const coords = [];
  for (const nid of way.nodes || []) {
    const n = nodes.get(nid);
    if (n) coords.push({ lat: n.lat, lng: n.lon, nodeId: nid, wayId: way.id });
  }
  return coords;
}

function densifyWithinWay(coords, maxGap = 25) {
  if (coords.length < 2) return coords.map((c) => ({ ...c }));
  const out = [{ ...coords[0] }];
  for (let i = 1; i < coords.length; i++) {
    const a = out[out.length - 1];
    const b = coords[i];
    const d = haversine(a, b);
    if (d > maxGap) {
      const n = Math.ceil(d / maxGap);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, wayId: b.wayId, densified: true });
      }
    }
    out.push({ lat: b.lat, lng: b.lng, nodeId: b.nodeId, wayId: b.wayId });
  }
  return out;
}

const reverseCoords = (c) => c.slice().reverse();
const distEnds = (seq, p) => (seq.length ? { start: haversine(seq[0], p), end: haversine(seq[seq.length - 1], p) } : { start: Infinity, end: Infinity });

function buildPathFromWays(rel, nodes, ways, startHint = null) {
  const wayMembers = (rel.members || []).filter((m) => m.type === 'way');
  const pathPts = [];
  const usedWays = [];
  let cursor = null;
  let maxJoin = 0;
  let prevWayId = null;

  for (const m of wayMembers) {
    const way = ways.get(m.ref);
    if (!way) continue;
    let coords = wayCoords(way, nodes);
    if (coords.length < 2) continue;

    let flipped = false;
    if (cursor) {
      const forward = distEnds(coords, cursor);
      const rev = distEnds(reverseCoords(coords), cursor);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      const join = haversine(cursor, coords[0]);
      maxJoin = Math.max(maxJoin, join);
      const shared = cursor.nodeId != null && coords[0].nodeId != null && cursor.nodeId === coords[0].nodeId;
      if (!shared && join > MAX_JOIN_M) {
        throw new Error(`way join gap ${join.toFixed(3)}m > ${MAX_JOIN_M}m between ${prevWayId} and ${m.ref}`);
      }
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: Math.round(join * 1000) / 1000, flipped, sharedNode: shared });
    } else if (startHint) {
      const forward = distEnds(coords, startHint);
      const rev = distEnds(reverseCoords(coords), startHint);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: 0, flipped, startHint: true });
    } else {
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: 0, flipped: false });
    }

    const densified = densifyWithinWay(coords, 25);
    const skipFirst = Boolean(cursor)
      && (haversine(cursor, densified[0]) < 1
        || (cursor.nodeId != null && densified[0].nodeId != null && cursor.nodeId === densified[0].nodeId));
    for (const c of (skipFirst ? densified.slice(1) : densified)) pathPts.push({ lat: c.lat, lng: c.lng });
    const lastNode = coords[coords.length - 1];
    cursor = { lat: lastNode.lat, lng: lastNode.lng, nodeId: lastNode.nodeId };
    prevWayId = m.ref;
  }

  return { pathPoints: pathPts, usedWays, maxJoin_m: Math.round(maxJoin * 1000) / 1000 };
}

function normalizeKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '');
}

function sha256(points) {
  const payload = points.map((p) => `${Number(p.lat).toFixed(7)},${Number(p.lng).toFixed(7)}`).join(';');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function maxGap(points) {
  let max = 0;
  for (let i = 1; i < points.length; i++) max = Math.max(max, haversine(points[i - 1], points[i]));
  return Math.round(max * 10) / 10;
}

function nearestIndex(points, plat) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversine(points[i], plat);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, dist: bestD };
}

function slicePathToEnd(fullPath, startPlat, endPlat) {
  const start = nearestIndex(fullPath, startPlat);
  const si = start.index;
  let ei = nearestIndex(fullPath, endPlat).index;
  if (si > ei) {
    let bestEi = ei;
    let bestD = Infinity;
    for (let i = si; i < fullPath.length; i++) {
      const d = haversine(fullPath[i], endPlat);
      if (d < bestD) { bestD = d; bestEi = i; }
    }
    ei = bestEi;
  }
  return {
    pathPoints: fullPath.slice(si, ei + 1),
    si,
    ei,
    startDist: Math.round(start.dist * 10) / 10,
    endDist: Math.round(haversine(fullPath[ei], endPlat) * 10) / 10,
  };
}

/**
 * Match official stop names to relation platform nodes in official order.
 * Route-18 visits several similarly-named 高洲* stops, so an exact normalized match is tried
 * for every name first; loose containment is only a fallback and is recorded when used.
 */
function matchPlatforms(platforms, names) {
  const used = new Set();
  const matched = names.map((name) => ({ name, platform: null, loose: false }));

  names.forEach((name, idx) => {
    const nk = normalizeKey(name);
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      if (normalizeKey(platforms[i].name) === nk) {
        used.add(i);
        const p = platforms[i];
        matched[idx].platform = { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name };
        return;
      }
    }
  });

  names.forEach((name, idx) => {
    if (matched[idx].platform) return;
    const nk = normalizeKey(name);
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      const pk = normalizeKey(platforms[i].name);
      if (pk.includes(nk) || nk.includes(pk)) {
        used.add(i);
        const p = platforms[i];
        matched[idx].platform = { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name };
        matched[idx].loose = true;
        return;
      }
    }
  });

  return matched;
}

function collectAccessMeta(rel, ways) {
  const restricted = [];
  const permitted = [];
  const unresolved = [];
  const documentedExceptions = [];
  for (const m of (rel.members || []).filter((x) => x.type === 'way')) {
    const w = ways.get(m.ref);
    if (!w) continue;
    const t = w.tags || {};
    const restrictedAccess = t.access === 'no' || t.access === 'private' || t.access === 'permit'
      || t.vehicle === 'no' || t.motor_vehicle === 'no';
    if (!restrictedAccess) continue;
    const row = {
      id: w.id, name: t.name || null, access: t.access ?? null, bus: t.bus ?? null, psv: t.psv ?? null,
      vehicle: t.vehicle ?? null, motor_vehicle: t.motor_vehicle ?? null, highway: t.highway ?? null, oneway: t.oneway ?? null,
    };
    restricted.push(row);
    const busOk = t.bus === 'yes' || t.bus === 'designated' || t.psv === 'yes' || t.psv === 'designated';
    if (busOk) permitted.push(row);
    else if (ACCESS_EXCEPTIONS[w.id]) documentedExceptions.push({ ...row, reason: ACCESS_EXCEPTIONS[w.id] });
    else unresolved.push(row);
  }
  return {
    restrictedAccessWayCount: restricted.length,
    busPermittedRestrictedWayCount: permitted.length,
    documentedExceptionWayCount: documentedExceptions.length,
    unresolvedRestrictedWayCount: unresolved.length,
    restrictedWays: restricted,
    documentedExceptionWays: documentedExceptions,
    unresolvedWays: unresolved,
  };
}

/** bus / psv tags across every way member, recorded as required by the quality gate. */
function collectBusPsvTags(rel, ways) {
  const rows = [];
  const busCounts = {};
  const psvCounts = {};
  for (const m of (rel.members || []).filter((x) => x.type === 'way')) {
    const w = ways.get(m.ref);
    if (!w) continue;
    const t = w.tags || {};
    const bus = t.bus ?? '(unset)';
    const psv = t.psv ?? '(unset)';
    busCounts[bus] = (busCounts[bus] || 0) + 1;
    psvCounts[psv] = (psvCounts[psv] || 0) + 1;
    rows.push({
      id: w.id, name: t.name || null, highway: t.highway ?? null, oneway: t.oneway ?? null,
      bus: t.bus ?? null, psv: t.psv ?? null, access: t.access ?? null,
      vehicle: t.vehicle ?? null, motor_vehicle: t.motor_vehicle ?? null,
    });
  }
  return { busCounts, psvCounts, ways: rows };
}

function buildPathFromWayIdList(wayIds, nodes, ways, startHint = null) {
  const pathPts = [];
  const usedWays = [];
  let cursor = null;
  let maxJoin = 0;
  let prevWayId = null;

  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way) throw new Error(`way ${wayId} missing from downloaded elements`);
    let coords = wayCoords(way, nodes);
    if (coords.length < 2) continue;

    let flipped = false;
    if (cursor) {
      const forward = distEnds(coords, cursor);
      const rev = distEnds(reverseCoords(coords), cursor);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      const join = haversine(cursor, coords[0]);
      maxJoin = Math.max(maxJoin, join);
      const shared = cursor.nodeId != null && coords[0].nodeId != null && cursor.nodeId === coords[0].nodeId;
      if (!shared && join > MAX_JOIN_M) {
        throw new Error(`way join gap ${join.toFixed(3)}m > ${MAX_JOIN_M}m between ${prevWayId} and ${wayId}`);
      }
      usedWays.push({ wayId, role: '', gapFromPrev_m: Math.round(join * 1000) / 1000, flipped, sharedNode: shared });
    } else if (startHint) {
      const forward = distEnds(coords, startHint);
      const rev = distEnds(reverseCoords(coords), startHint);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      usedWays.push({ wayId, role: '', gapFromPrev_m: 0, flipped, startHint: true });
    } else {
      usedWays.push({ wayId, role: '', gapFromPrev_m: 0, flipped: false });
    }

    const densified = densifyWithinWay(coords, 25);
    const skipFirst = Boolean(cursor)
      && (haversine(cursor, densified[0]) < 1
        || (cursor.nodeId != null && densified[0].nodeId != null && cursor.nodeId === densified[0].nodeId));
    for (const c of (skipFirst ? densified.slice(1) : densified)) pathPts.push({ lat: c.lat, lng: c.lng });
    const lastNode = coords[coords.length - 1];
    cursor = { lat: lastNode.lat, lng: lastNode.lng, nodeId: lastNode.nodeId };
    prevWayId = wayId;
  }

  return { pathPoints: pathPts, usedWays, maxJoin_m: Math.round(maxJoin * 1000) / 1000 };
}

function wayMemberIds(rel) {
  return (rel.members || []).filter((m) => m.type === 'way').map((m) => m.ref);
}

function mergeWayMaps(...maps) {
  const out = new Map();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

function mergeNodeMaps(...maps) {
  const out = new Map();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

function finalizeSystemResult(key, def, {
  pathPoints, usedWays, maxJoin_m, platObjs, names, missing, looseMatches,
  platformDists, orderIssues, nanCount, sliceMeta, access, busPsv, compositionMeta,
}) {
  const maxPlatformDist = Math.max(0, ...platformDists.map((p) => p.dist));
  return {
    key,
    relationId: def.relationId,
    compositionRelations: def.composition
      ? [def.composition.prefixRelation, def.composition.suffixRelation]
      : [def.relationId],
    composition: def.composition || null,
    compositionMeta: compositionMeta || null,
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    pathHash: sha256(pathPoints),
    pathPoints,
    platforms: platObjs,
    names,
    missingPlatforms: missing,
    looseMatches,
    maxGap_m: maxGap(pathPoints),
    maxPlatformDist_m: maxPlatformDist,
    platformDists,
    orderIssues,
    nanCount,
    sliceMeta,
    usedWays,
    usedWayCount: usedWays.length,
    maxJoin_m,
    access,
    busPsv,
    note: def.note,
  };
}

function measurePlatforms(pathPoints, matched) {
  const platformDists = matched.filter((m) => m.platform).map((m) => {
    const ni = nearestIndex(pathPoints, m.platform);
    const dist = Math.round(ni.dist * 10) / 10;
    return { name: m.name, dist, pathIndex: ni.index, reviewRequired: dist > PLATFORM_DIST_SOFT_MAX && dist <= PLATFORM_DIST_HARD_MAX };
  });
  const orderIssues = [];
  let lastIdx = -1;
  for (const pd of platformDists) {
    if (pd.pathIndex < lastIdx) orderIssues.push({ name: pd.name, index: pd.pathIndex, prev: lastIdx });
    lastIdx = Math.max(lastIdx, pd.pathIndex);
  }
  let nanCount = 0;
  for (const p of pathPoints) {
    if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) nanCount += 1;
  }
  return { platformDists, orderIssues, nanCount };
}

function buildDedicatedSystem(key, def) {
  const order = ORDERS.systems[key];
  if (!order) throw new Error(`no official order for ${key}`);
  const names = order.stopNames;
  for (const { route, name } of FORBIDDEN_STOP_LIST) {
    if (names.includes(name)) throw new Error(`${key}: route-${route} exclusive stop ${name} present in official order`);
  }
  if (order.osmRelationId !== def.relationId) {
    throw new Error(`${key}: official order maps to relation ${order.osmRelationId} but builder uses ${def.relationId}`);
  }
  const loaded = loadRelation(def.relationId);
  const platforms = platformMembers(loaded.rel, loaded.nodes);

  const startPlatformSeed = platforms.find((p) => normalizeKey(p.name) === normalizeKey(names[0]));
  if (!startPlatformSeed) throw new Error(`${key}: start platform ${names[0]} missing in relation ${def.relationId}`);

  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, {
    lat: startPlatformSeed.lat, lng: startPlatformSeed.lng,
  });

  const matched = matchPlatforms(platforms, names);
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const looseMatches = matched.filter((m) => m.loose).map((m) => ({ name: m.name, osmName: m.platform?.osmName }));

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  const startPlat = matched[0]?.platform;
  const endPlat = matched[matched.length - 1]?.platform;
  if (startPlat && endPlat) {
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
  }

  const platObjs = {};
  if (def.platformByIndex) {
    platObjs.byIndex = matched.map((m) => (m.platform ? {
      lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
      role: m.platform.role, osmName: m.platform.osmName, name: m.name,
    } : null));
  }
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
      role: m.platform.role, osmName: m.platform.osmName,
    };
  }

  const measured = measurePlatforms(pathPoints, matched);
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    platObjs,
    names,
    missing,
    looseMatches,
    platformDists: measured.platformDists,
    orderIssues: measured.orderIssues,
    nanCount: measured.nanCount,
    sliceMeta: sliceMeta ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist, fullPathPoints: pathBuild.pathPoints.length } : null,
    access: collectAccessMeta(loaded.rel, loaded.ways),
    busPsv: collectBusPsvTags(loaded.rel, loaded.ways),
  });
}

/**
 * Outbound short: 新浦安駅(E) → 高洲海浜公園.
 * Proof: night prefix ways ≡ through ways[26..46]; continue on through to terminus.
 * Implemented as 18352908 from berth-E platform (verified identical to composition).
 */
function buildOutboundShortFromShinurayasu(key, def) {
  const order = ORDERS.systems[key];
  if (!order) throw new Error(`no official order for ${key}`);
  const names = order.stopNames;
  const comp = def.composition;
  const night = loadRelation(comp.prefixRelation);
  const through = loadRelation(comp.suffixRelation);

  const nightWays = wayMemberIds(night.rel);
  const throughWays = wayMemberIds(through.rel);
  const sharedNight = nightWays.slice(0, comp.sharedWayCount);
  const sharedThrough = throughWays.slice(comp.suffixWayStartIndexOnThrough, comp.suffixWayStartIndexOnThrough + comp.sharedWayCount);
  if (sharedNight.length !== comp.sharedWayCount || sharedThrough.some((id, i) => id !== sharedNight[i])) {
    throw new Error(`${key}: night prefix ways do not match through ways — composition proof broken`);
  }
  const composedWayIds = throughWays.slice(comp.suffixWayStartIndexOnThrough);
  if (composedWayIds[0] !== nightWays[0]) {
    throw new Error(`${key}: composed way list does not start with night's first way`);
  }

  const platforms = platformMembers(through.rel, through.nodes);
  const berthE = platforms.find((p) => p.platformId === comp.departurePlatform.nodeId);
  if (!berthE || berthE.tags?.local_ref !== 'E') {
    throw new Error(`${key}: berth-E platform node ${comp.departurePlatform.nodeId} missing or not local_ref=E`);
  }
  const nightBerthE = platformMembers(night.rel, night.nodes)
    .find((p) => p.platformId === comp.departurePlatform.nodeId);
  if (!nightBerthE) throw new Error(`${key}: night relation does not attest berth-E node`);

  const nodes = mergeNodeMaps(night.nodes, through.nodes);
  const ways = mergeWayMaps(night.ways, through.ways);
  const pathBuild = buildPathFromWayIdList(composedWayIds, nodes, ways, {
    lat: berthE.lat, lng: berthE.lng,
  });

  const matched = matchPlatforms(platforms, names);
  // Force 新浦安駅 to berth E (through relation's mid-route platform is already E).
  const startMatch = matched[0];
  if (!startMatch?.platform || startMatch.platform.platformId !== berthE.platformId) {
    throw new Error(`${key}: start platform is not berth-E node ${berthE.platformId}`);
  }
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const looseMatches = matched.filter((m) => m.loose).map((m) => ({ name: m.name, osmName: m.platform?.osmName }));

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  const startPlat = matched[0].platform;
  const endPlat = matched[matched.length - 1]?.platform;
  if (startPlat && endPlat) {
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
  }

  const platObjs = {};
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
      role: m.platform.role, osmName: m.platform.osmName,
    };
  }
  if (platObjs[names[0]]) platObjs[names[0]].local_ref = 'E';

  const measured = measurePlatforms(pathPoints, matched);
  const syntheticRel = {
    members: composedWayIds.map((id) => ({ type: 'way', ref: id, role: '' })),
  };
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    platObjs,
    names,
    missing,
    looseMatches,
    platformDists: measured.platformDists,
    orderIssues: measured.orderIssues,
    nanCount: measured.nanCount,
    sliceMeta: sliceMeta ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist, fullPathPoints: pathBuild.pathPoints.length } : null,
    access: collectAccessMeta(syntheticRel, ways),
    busPsv: collectBusPsvTags(syntheticRel, ways),
    compositionMeta: {
      sharedWayIds: sharedNight,
      composedWayCount: composedWayIds.length,
      berthENodeId: berthE.platformId,
      joinNode: comp.joinNode,
      equivalentTo: '18352908 from berth-E to 高洲海浜公園',
    },
  });
}

/**
 * Inbound short: 高洲海浜公園 → 新浦安駅(X).
 * 18352907 ways[0..12] end at join 288384935; then 18352908 rotary to berth X.
 */
function buildInboundShortToShinurayasu(key, def) {
  const order = ORDERS.systems[key];
  if (!order) throw new Error(`no official order for ${key}`);
  const names = order.stopNames;
  const comp = def.composition;
  const inbound = loadRelation(comp.prefixRelation);
  const outbound = loadRelation(comp.suffixRelation);

  const inboundWays = wayMemberIds(inbound.rel);
  const prefixIds = inboundWays.slice(0, comp.prefixWayEndIndexInclusive + 1);
  const lastPrefix = inbound.ways.get(prefixIds[prefixIds.length - 1]);
  if (!lastPrefix || !(lastPrefix.nodes || []).includes(comp.joinNode)) {
    throw new Error(`${key}: prefix last way does not contain join node ${comp.joinNode}`);
  }
  for (const wid of comp.suffixWayIds) {
    if (!outbound.ways.has(wid)) throw new Error(`${key}: suffix way ${wid} missing from ${comp.suffixRelation}`);
  }
  const firstSuffix = outbound.ways.get(comp.suffixWayIds[0]);
  if (!(firstSuffix.nodes || []).includes(comp.joinNode)) {
    throw new Error(`${key}: first suffix way does not start at join node`);
  }

  const nodes = mergeNodeMaps(inbound.nodes, outbound.nodes);
  // Inject berth X node so platform coords are available even if not a relation member.
  nodes.set(SHINURAYASU_BERTH_X.nodeId, {
    type: 'node', id: SHINURAYASU_BERTH_X.nodeId,
    lat: SHINURAYASU_BERTH_X.lat, lon: SHINURAYASU_BERTH_X.lng,
    tags: {
      bus: 'yes', highway: 'bus_stop', local_ref: 'X', name: '新浦安駅',
      note: SHINURAYASU_BERTH_X.note, operator: '京成トランジットバス;東京ベイシティ交通',
      public_transport: 'platform',
    },
  });
  const ways = mergeWayMaps(inbound.ways, outbound.ways);
  const composedWayIds = [...prefixIds, ...comp.suffixWayIds];

  const inboundPlatforms = platformMembers(inbound.rel, inbound.nodes);
  const startSeed = inboundPlatforms.find((p) => normalizeKey(p.name) === normalizeKey(names[0]));
  if (!startSeed) throw new Error(`${key}: start ${names[0]} missing on ${comp.prefixRelation}`);

  const pathBuild = buildPathFromWayIdList(composedWayIds, nodes, ways, {
    lat: startSeed.lat, lng: startSeed.lng,
  });

  const midNames = names.slice(0, -1);
  const matchedMid = matchPlatforms(inboundPlatforms, midNames);
  const matched = [
    ...matchedMid,
    {
      name: names[names.length - 1],
      loose: false,
      platform: {
        lat: SHINURAYASU_BERTH_X.lat,
        lng: SHINURAYASU_BERTH_X.lng,
        platformId: SHINURAYASU_BERTH_X.nodeId,
        role: 'platform_exit_only',
        osmName: '新浦安駅',
        tags: { local_ref: 'X', note: SHINURAYASU_BERTH_X.note },
      },
    },
  ];
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const looseMatches = matched.filter((m) => m.loose).map((m) => ({ name: m.name, osmName: m.platform?.osmName }));

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  const startPlat = matched[0]?.platform;
  const endPlat = matched[matched.length - 1]?.platform;
  if (startPlat && endPlat) {
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
  }

  const platObjs = {};
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
      role: m.platform.role, osmName: m.platform.osmName,
      local_ref: m.platform.tags?.local_ref || null,
      note: m.platform.tags?.note || null,
    };
  }

  const measured = measurePlatforms(pathPoints, matched);
  const endDist = measured.platformDists.find((p) => p.name === names[names.length - 1]);
  if (!endDist || endDist.dist > PLATFORM_DIST_HARD_MAX) {
    throw new Error(`${key}: berth-X stop-to-path ${endDist?.dist}m exceeds hard max`);
  }

  const syntheticRel = {
    members: composedWayIds.map((id) => ({ type: 'way', ref: id, role: '' })),
  };
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    platObjs,
    names,
    missing,
    looseMatches,
    platformDists: measured.platformDists,
    orderIssues: measured.orderIssues,
    nanCount: measured.nanCount,
    sliceMeta: sliceMeta ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist, fullPathPoints: pathBuild.pathPoints.length } : null,
    access: collectAccessMeta(syntheticRel, ways),
    busPsv: collectBusPsvTags(syntheticRel, ways),
    compositionMeta: {
      prefixWayIds: prefixIds,
      suffixWayIds: comp.suffixWayIds,
      joinNode: comp.joinNode,
      arrivalBerth: 'X',
      arrivalNodeId: SHINURAYASU_BERTH_X.nodeId,
      arrivalStopToPath_m: endDist.dist,
    },
  });
}

function buildSystem(key, def) {
  if (def.composition?.kind === 'verified-berth-departure + verified-join') {
    return buildOutboundShortFromShinurayasu(key, def);
  }
  if (def.composition?.kind === 'verified-join + attested-alighting-berth') {
    return buildInboundShortToShinurayasu(key, def);
  }
  return buildDedicatedSystem(key, def);
}

const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;

const isReverseOf = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[b.length - 1 - i]));
const isPrefixOf = (a, b) => a.length <= b.length && a.every((p, i) => samePoint(p, b[i]));

/** Would `a` be reproducible by cutting a contiguous run out of `b`? That is splicing. */
function isContiguousSliceOf(a, b) {
  if (!a.length || a.length > b.length) return false;
  for (let i = 0; i + a.length <= b.length; i++) {
    if (a.every((p, j) => samePoint(p, b[i + j]))) return true;
  }
  return false;
}

function main() {
  const platformsBank = {};
  const pathBank = {};
  const allForbiddenRelations = Object.values(FORBIDDEN_SIBLING_RELATIONS).flat();
  const summary = {
    generatedAt: new Date().toISOString(),
    line: '舞浜・高洲線',
    routeId: 'route-25',
    displayCode: '25',
    generated: GENERATED,
    policy: {
      stopOrderSource: 'official-stop-orders.json（京成バスナビ個別便通過時刻表・2段凡例ゲートで【２５系統】に確定）',
      pathSource: 'OSM route relation way members（方向補正あり）。18352023/22/45/44 を独立構築',
      googleDirectionsUsed: false,
      reverseReuseForbidden: true,
      truncationReuseForbidden: true,
      siblingRouteSeparation: 'route-10/15/18/19 relations は使用禁止',
      forbiddenSiblingRelations: FORBIDDEN_SIBLING_RELATIONS,
      forbiddenSiblingStops: FORBIDDEN_SIBLING_STOPS,
      maxGap_m: MAX_GAP_M,
      maxJoin_m: MAX_JOIN_M,
      platformDistSoftMax_m: PLATFORM_DIST_SOFT_MAX,
      platformDistHardMax_m: PLATFORM_DIST_HARD_MAX,
      allowedContiguousSlicePairs: ALLOWED_CONTIGUOUS_SLICE_PAIRS,
    },
    accessExceptions: ACCESS_EXCEPTIONS,
    systems: {},
    blockers: [],
    warnings: [],
  };

  for (const key of SYSTEM_ORDER) {
    const def = SYSTEMS[key];
    const relIds = def.composition
      ? [def.composition.prefixRelation, def.composition.suffixRelation]
      : [def.relationId];
    for (const rid of relIds) {
      if (allForbiddenRelations.includes(rid)) {
        throw new Error(`${key}: relation ${rid} belongs to a sibling route and must never be used for route 25`);
      }
    }
    const sys = buildSystem(key, def);
    platformsBank[key] = sys.platforms;
    pathBank[key] = {
      relationId: sys.relationId,
      compositionRelations: sys.compositionRelations,
      composition: sys.composition,
      pathSource: sys.pathSource,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      pathPoints: sys.pathPoints,
    };
    summary.systems[key] = {
      stops: sys.names.length,
      pathPoints: sys.pathPoints.length,
      relationId: sys.relationId,
      compositionRelations: sys.compositionRelations,
      composition: sys.composition,
      compositionMeta: sys.compositionMeta,
      pathSource: sys.pathSource,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      maxGap_m: sys.maxGap_m,
      maxJoin_m: sys.maxJoin_m,
      maxPlatformDist_m: sys.maxPlatformDist_m,
      nanCount: sys.nanCount,
      missingPlatforms: sys.missingPlatforms,
      looseMatches: sys.looseMatches,
      platformDists: sys.platformDists,
      orderIssues: sys.orderIssues,
      sliceMeta: sys.sliceMeta,
      usedWayCount: sys.usedWayCount,
      usedWays: sys.usedWays,
      access: sys.access,
      busPsv: sys.busPsv,
      note: sys.note,
    };

    if (sys.missingPlatforms.length) summary.blockers.push(`${key}: missing platforms ${sys.missingPlatforms.join(',')}`);
    if (sys.nanCount) summary.blockers.push(`${key}: ${sys.nanCount} NaN/null coordinates`);
    if (sys.maxGap_m > MAX_GAP_M) summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m > ${MAX_GAP_M}m`);
    if (sys.maxJoin_m > MAX_JOIN_M) summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m > ${MAX_JOIN_M}m`);
    if (sys.orderIssues.length) summary.blockers.push(`${key}: platform order issues ${JSON.stringify(sys.orderIssues)}`);
    if (sys.access.unresolvedRestrictedWayCount > 0) {
      summary.blockers.push(`${key}: unresolved access-restricted ways ${JSON.stringify(sys.access.unresolvedWays)}`);
    }
    if (sys.looseMatches.length) {
      summary.warnings.push(`${key}: loose platform name matches ${JSON.stringify(sys.looseMatches)}`);
    }
    for (const pd of sys.platformDists) {
      if (pd.dist > PLATFORM_DIST_HARD_MAX) summary.blockers.push(`${key}: ${pd.name} stop-to-path ${pd.dist}m > ${PLATFORM_DIST_HARD_MAX}m`);
      else if (pd.dist > PLATFORM_DIST_SOFT_MAX) summary.warnings.push(`${key}: ${pd.name} stop-to-path ${pd.dist}m reviewRequired`);
    }
    if (sys.access.documentedExceptionWayCount > 0) {
      summary.warnings.push(`${key}: documented access exception ways ${sys.access.documentedExceptionWays.map((w) => w.id).join(',')}`);
    }
    for (const name of Object.keys(sys.platforms)) {
      const hit = FORBIDDEN_STOP_LIST.find((f) => f.name === name);
      if (hit) summary.blockers.push(`${key}: route-${hit.route} exclusive stop ${name} leaked into platforms`);
    }
    console.log(key, 'stops', sys.names.length, 'pts', sys.pathPoints.length, 'maxGap', sys.maxGap_m, 'maxJoin', sys.maxJoin_m, 'maxPlat', sys.maxPlatformDist_m, 'hash', sys.pathHash.slice(0, 12));
  }

  const hashes = Object.entries(pathBank).map(([k, v]) => [k, v.pathHash]);
  summary.pathHashDistinct = new Set(hashes.map((h) => h[1])).size === hashes.length;
  if (!summary.pathHashDistinct) summary.blockers.push('duplicate pathHash across systems');

  summary.reverseChecks = [
    { a: '25-maihama-takasu-seaside', b: '25-takasu-seaside-maihama' },
    { a: '25-maihama-sogo', b: '25-sogo-maihama' },
  ].map(({ a, b }) => ({ a, b, isExactReverse: isReverseOf(pathBank[a].pathPoints, pathBank[b].pathPoints) }));
  for (const r of summary.reverseChecks) {
    if (r.isExactReverse) summary.blockers.push(`${r.b} is an exact reverse of ${r.a} — must come from its own relation`);
  }

  summary.prefixChecks = [];

  summary.spliceChecks = [
    { a: '25-maihama-takasu-seaside', b: '25-maihama-sogo' },
    { a: '25-maihama-sogo', b: '25-maihama-takasu-seaside' },
    { a: '25-takasu-seaside-maihama', b: '25-sogo-maihama' },
    { a: '25-sogo-maihama', b: '25-takasu-seaside-maihama' },
    { a: '25-maihama-takasu-seaside', b: '25-takasu-seaside-maihama' },
    { a: '25-maihama-sogo', b: '25-sogo-maihama' },
  ].map(({ a, b }) => {
    const isContiguousSlice = isContiguousSliceOf(pathBank[a].pathPoints, pathBank[b].pathPoints);
    return { a, b, isContiguousSlice, allowed: false };
  });
  for (const s of summary.spliceChecks) {
    if (s.isContiguousSlice && !s.allowed) {
      summary.blockers.push(`${s.a} path is a contiguous slice of ${s.b} — splicing detected`);
    }
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2), 'utf8');

  fs.writeFileSync(
    path.join(ROOT, 'maihama-takasu-line-platforms-v1.js'),
    '// Auto-generated OSM platforms for 舞浜・高洲線 系統25 (route-25).\n'
    + '// Official stop order: Keisei Bus Navi 2026-07-27（【２５系統】凡例ゲート）。10/15/18/19系統は除外。\n'
    + '// NEVER use route-10/15/18/19 relations or their path assets.\n'
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.MAIHAMA_TAKASU_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, 'maihama-takasu-line-path-v1.js'),
    '// Auto-generated OSM road path geometry for 舞浜・高洲線 系統25 (route-25).\n'
    + '// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n'
    + '// Own relations only: 18352023/22/45/44. 総合公園 vs 高洲海浜公園 are separate systems.\n'
    + '// NEVER use route-10/15/18/19 relations or reverse one system for another.\n'
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.MAIHAMA_TAKASU_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
    'utf8',
  );

  console.log('pathHashDistinct', summary.pathHashDistinct);
  console.log('reverseChecks', JSON.stringify(summary.reverseChecks));
  console.log('prefixChecks', JSON.stringify(summary.prefixChecks));
  console.log('spliceChecks', JSON.stringify(summary.spliceChecks));
  console.log('warnings', summary.warnings);
  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('wrote maihama-takasu-line-platforms-v1.js and maihama-takasu-line-path-v1.js');
}

main();
