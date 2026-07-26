'use strict';
/**
 * Build platforms + pathPoints for route-20 千鳥線 from OSM relations.
 *
 * 7 verified systems. Stop order from official-stop-orders.json only.
 * Composition (verified, shared-node proof):
 *   20-maihama-chidori-nishi = loop 18323972 stops 1..9
 *   20-clean-center-maihama-via-saijo = loop 18323972 stops 7..14
 * Garage fix 20-maihama-chidori-garage:
 *   relation 13764790 missing 千鳥北 platform — inject 9482675705 from loop outbound side;
 *   stitch loop ways 千鳥車庫→千鳥北→千鳥東 when base relation skips 千鳥北.
 * route-22 relations 18396546/18396547 are NEVER used.
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
const GENERATED = '2026-07-27-chidori-line-v1';

const FORBIDDEN_SIBLING_RELATIONS = {
  22: [18396546, 18396547],
};

const FORBIDDEN_SIBLING_STOPS = {
  22: [
    '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前',
    'サンコーポ東口', 'サンコーポ西口', '弁天第二',
    '見明川中学校前', '見明川住宅', '舞浜三丁目',
  ],
};
const FORBIDDEN_STOP_LIST = Object.entries(FORBIDDEN_SIBLING_STOPS)
  .flatMap(([route, names]) => names.map((name) => ({ route, name })));

/** 千鳥車庫構内サービス道路（route-14 と同様の documented exception） */
const ACCESS_EXCEPTIONS = {
  30176865: '千鳥車庫構内サービス道路。13764790/18323971 が使用。access=private だが自社バス入出庫路。',
  1296818464: '千鳥車庫（東京ベイシティ交通営業所）構内。20系統 garage 便が使用。',
};

const LOOP_RELATION = 18323972;
const GARAGE_RELATION = 13764790;
const KITA_OUTBOUND_PLATFORM = 9482675705;

const SYSTEMS = {
  '20-maihama-clean-center': {
    relationId: 18351940,
    resolvedVersion: '2026-07-27-chidori20-maihama-clean-center-v1',
    pathSource: 'osm-relation-18351940+startHint-maihama',
    build: 'dedicated',
    note: 'outbound 舞浜駅→クリーンセンター（ク）。relation 18351940 exact match。',
  },
  '20-maihama-chidori-nishi': {
    relationId: LOOP_RELATION,
    resolvedVersion: '2026-07-27-chidori20-maihama-chidori-nishi-v1',
    pathSource: 'osm-relation-18323972-composition-prefix-stops-1-9',
    build: 'composition-prefix',
    composition: {
      sourceRelation: LOOP_RELATION,
      stopStartIndex: 0,
      stopEndIndex: 8,
      proof: 'Verified prefix of loop relation 18323972 platforms stops 1..9 (ends 千鳥西). No dedicated relation.',
    },
    note: 'branch 舞浜駅→千鳥西（に）。loop 18323972 stops 1..9 composition。',
  },
  '20-chidori-loop': {
    relationId: LOOP_RELATION,
    resolvedVersion: '2026-07-27-chidori20-chidori-loop-v1',
    pathSource: 'osm-relation-18323972+startHint-maihama',
    build: 'dedicated-loop',
    platformByIndex: true,
    note: 'loop 舞浜駅→舞浜駅（さ）。relation 18323972 exact。1周で終了。',
  },
  '20-maihama-chidori-garage': {
    relationId: GARAGE_RELATION,
    resolvedVersion: '2026-07-27-chidori20-maihama-chidori-garage-v1',
    pathSource: 'osm-relation-13764790+stitch-loop-kita+startHint-maihama',
    build: 'garage-stitch',
    platformByIndex: true,
    composition: {
      baseRelation: GARAGE_RELATION,
      stitchRelation: LOOP_RELATION,
      kitaPlatformId: KITA_OUTBOUND_PLATFORM,
      proof: '13764790 OSM platforms skip 千鳥北 vs Navi. Insert platform 9482675705 (loop outbound) and stitch loop ways 千鳥車庫→千鳥北→千鳥東 with shared-node proof at way 1338973095.',
    },
    note: 'outbound 舞浜駅→千鳥車庫（無印・千鳥東経由）。13764790 + loop stitch for 千鳥北。',
  },
  '20-chidori-garage-maihama': {
    relationId: 18323971,
    resolvedVersion: '2026-07-27-chidori20-chidori-garage-maihama-v1',
    pathSource: 'osm-relation-18323971+startHint-chidori-garage',
    build: 'dedicated',
    platformByIndex: true,
    note: 'inbound 千鳥車庫→舞浜駅（無印）。運動公園スkip。relation 18323971 exact。',
  },
  '20-clean-center-maihama': {
    relationId: 18351939,
    resolvedVersion: '2026-07-27-chidori20-clean-center-maihama-v1',
    pathSource: 'osm-relation-18351939+startHint-clean-center',
    build: 'dedicated',
    note: 'inbound クリーンセンター→舞浜駅（無印）。relation 18351939 exact。',
  },
  '20-clean-center-maihama-via-saijo': {
    relationId: LOOP_RELATION,
    resolvedVersion: '2026-07-27-chidori20-clean-center-maihama-via-saijo-v1',
    pathSource: 'osm-relation-18323972-composition-suffix-stops-7-14',
    build: 'composition-suffix',
    composition: {
      sourceRelation: LOOP_RELATION,
      stopStartIndex: 6,
      stopEndIndex: 13,
      proof: 'Verified suffix of loop relation 18323972 platforms stops 7..14 (クリーンセンター→舞浜駅 via 浦安斎場).',
    },
    note: 'inbound クリーンセンター→舞浜駅（浦安斎場経由）。loop 18323972 stops 7..14 composition。',
  },
};

const SYSTEM_ORDER = [
  '20-maihama-clean-center',
  '20-maihama-chidori-nishi',
  '20-chidori-loop',
  '20-maihama-chidori-garage',
  '20-chidori-garage-maihama',
  '20-clean-center-maihama',
  '20-clean-center-maihama-via-saijo',
];

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

  return { pathPoints: pathPts, usedWays, maxJoin_m: Math.round(maxJoin * 1000) / 1000, endCursor: cursor };
}

function buildPathFromWayIdList(wayIds, nodes, ways, startHint = null) {
  const syntheticRel = { members: wayIds.map((id) => ({ type: 'way', ref: id, role: '' })) };
  return buildPathFromWays(syntheticRel, nodes, ways, startHint);
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

function normalizeKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '')
    .replace(/オリエンタルランド/g, 'OL');
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

function matchPlatformsOrdered(platforms, names) {
  const used = new Set();
  return names.map((name, idx) => {
    const nk = normalizeKey(name);
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      if (normalizeKey(platforms[i].name) === nk || (name === 'オリエンタルランド本社前' && normalizeKey(platforms[i].name).includes('OL'))) {
        used.add(i);
        const p = platforms[i];
        return {
          name,
          index: idx,
          platform: { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name },
          loose: false,
        };
      }
    }
    return { name, index: idx, platform: null, loose: false };
  });
}

function matchPlatformsByOccurrence(sourcePlatforms, names) {
  const buckets = new Map();
  for (const p of sourcePlatforms) {
    const nk = normalizeKey(p.name);
    if (!buckets.has(nk)) buckets.set(nk, []);
    buckets.get(nk).push(p);
  }
  const cursors = new Map();
  return names.map((name, idx) => {
    const nk = normalizeKey(name);
    const list = buckets.get(nk) || [];
    const cur = cursors.get(nk) || 0;
    const p = list[cur];
    if (p) cursors.set(nk, cur + 1);
    return {
      name,
      index: idx,
      platform: p ? { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name } : null,
      loose: false,
    };
  });
}

function measurePlatforms(pathPoints, matched) {
  const platformDists = matched.filter((m) => m.platform).map((m) => {
    const ni = nearestIndex(pathPoints, m.platform);
    const dist = Math.round(ni.dist * 10) / 10;
    return { name: m.name, index: m.index, dist, pathIndex: ni.index, reviewRequired: dist > PLATFORM_DIST_SOFT_MAX && dist <= PLATFORM_DIST_HARD_MAX };
  });
  const orderIssues = [];
  let lastIdx = -1;
  for (const pd of platformDists) {
    if (pd.pathIndex < lastIdx) orderIssues.push({ name: pd.name, index: pd.index, pathIndex: pd.pathIndex, prev: lastIdx });
    lastIdx = Math.max(lastIdx, pd.pathIndex);
  }
  let nanCount = 0;
  for (const p of pathPoints) {
    if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) nanCount += 1;
  }
  return { platformDists, orderIssues, nanCount };
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
    const row = { id: w.id, name: t.name || null, access: t.access ?? null, bus: t.bus ?? null, highway: t.highway ?? null };
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
    rows.push({ id: w.id, name: t.name || null, highway: t.highway ?? null, bus: t.bus ?? null, psv: t.psv ?? null, access: t.access ?? null });
  }
  return { busCounts, psvCounts, ways: rows };
}

function platBankEntry(matched, platformByIndex) {
  if (platformByIndex) {
    return {
      byIndex: matched.map((m) => (m.platform ? {
        name: m.name,
        lat: m.platform.lat,
        lng: m.platform.lng,
        platformId: m.platform.platformId,
        role: m.platform.role,
        osmName: m.platform.osmName,
      } : null)),
    };
  }
  const platObjs = {};
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
      role: m.platform.role, osmName: m.platform.osmName,
    };
  }
  return platObjs;
}

function finalizeSystemResult(key, def, payload) {
  const {
    pathPoints, usedWays, maxJoin_m, matched, names, missing, looseMatches,
    platformDists, orderIssues, nanCount, sliceMeta, access, busPsv, compositionMeta,
  } = payload;
  const maxPlatformDist = Math.max(0, ...platformDists.map((p) => p.dist));
  return {
    key,
    relationId: def.relationId,
    compositionRelations: def.composition ? [def.composition.sourceRelation || def.composition.baseRelation, def.composition.stitchRelation].filter(Boolean) : [def.relationId],
    composition: def.composition || null,
    compositionMeta: compositionMeta || null,
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    pathHash: sha256(pathPoints),
    pathPoints,
    platforms: platBankEntry(matched, def.platformByIndex),
    platformByIndex: Boolean(def.platformByIndex),
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

function buildDedicatedSystem(key, def) {
  const order = ORDERS.systems[key];
  const names = order.stopNames;
  for (const { route, name } of FORBIDDEN_STOP_LIST) {
    if (names.includes(name)) throw new Error(`${key}: route-${route} exclusive stop ${name}`);
  }
  const loaded = loadRelation(def.relationId);
  const platforms = platformMembers(loaded.rel, loaded.nodes);
  const matched = def.platformByIndex
    ? matchPlatformsByOccurrence(platforms, names)
    : matchPlatformsOrdered(platforms, names);

  const startPlatformSeed = matched[0]?.platform;
  if (!startPlatformSeed) throw new Error(`${key}: start platform ${names[0]} missing`);

  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startPlatformSeed);
  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  const startPlat = matched[0]?.platform;
  const endPlat = matched[matched.length - 1]?.platform;
  if (startPlat && endPlat) {
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
  }

  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const measured = measurePlatforms(pathPoints, matched);
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    matched,
    names,
    missing,
    looseMatches: [],
    ...measured,
    sliceMeta: sliceMeta ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist } : null,
    access: collectAccessMeta(loaded.rel, loaded.ways),
    busPsv: collectBusPsvTags(loaded.rel, loaded.ways),
  });
}

function buildLoopSystem(key, def) {
  const order = ORDERS.systems[key];
  const names = order.stopNames;
  const loaded = loadRelation(def.relationId);
  const platforms = platformMembers(loaded.rel, loaded.nodes);
  const matched = matchPlatformsByOccurrence(platforms, names);
  const startPlatformSeed = matched[0]?.platform;
  if (!startPlatformSeed) throw new Error(`${key}: start platform missing`);

  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startPlatformSeed);
  let pathPoints = pathBuild.pathPoints;
  const startPlat = matched[0].platform;
  const endPlat = matched[matched.length - 1].platform;
  const sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
  pathPoints = sliceMeta.pathPoints;

  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const measured = measurePlatforms(pathPoints, matched);
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    matched,
    names,
    missing,
    looseMatches: [],
    ...measured,
    sliceMeta: { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist, oneCircuit: true },
    access: collectAccessMeta(loaded.rel, loaded.ways),
    busPsv: collectBusPsvTags(loaded.rel, loaded.ways),
    compositionMeta: { loopEndDistinctPlatforms: { start: matched[0].platform.platformId, end: matched[13].platform.platformId } },
  });
}

function buildCompositionSystem(key, def) {
  const order = ORDERS.systems[key];
  const names = order.stopNames;
  const comp = def.composition;
  const loaded = loadRelation(comp.sourceRelation);
  const allPlatforms = platformMembers(loaded.rel, loaded.nodes);
  const slicePlatforms = allPlatforms.slice(comp.stopStartIndex, comp.stopEndIndex + 1);
  if (slicePlatforms.length !== names.length) {
    throw new Error(`${key}: platform slice length ${slicePlatforms.length} != names ${names.length}`);
  }
  const matched = names.map((name, idx) => {
    const p = slicePlatforms[idx];
    const nk = normalizeKey(p.name);
    const ok = normalizeKey(name) === nk || (name === 'オリエンタルランド本社前' && nk.includes('OL'));
    if (!ok) throw new Error(`${key}: platform slice mismatch at ${idx}: ${p.name} vs ${name}`);
    return {
      name,
      index: idx,
      platform: { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name },
      loose: false,
    };
  });

  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, allPlatforms[0]);
  const sliceMeta = slicePathToEnd(pathBuild.pathPoints, matched[0].platform, matched[matched.length - 1].platform);
  const pathPoints = sliceMeta.pathPoints;

  const sharedProof = {
    sourceRelation: comp.sourceRelation,
    platformSlice: `${comp.stopStartIndex + 1}..${comp.stopEndIndex + 1}`,
    platformIds: slicePlatforms.map((p) => p.platformId),
    proof: comp.proof,
    pathSlice: { si: sliceMeta.si, ei: sliceMeta.ei, startDist_m: sliceMeta.startDist, endDist_m: sliceMeta.endDist },
  };

  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  const measured = measurePlatforms(pathPoints, matched);
  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: pathBuild.usedWays,
    maxJoin_m: pathBuild.maxJoin_m,
    matched,
    names,
    missing,
    looseMatches: [],
    ...measured,
    sliceMeta,
    access: collectAccessMeta(loaded.rel, loaded.ways),
    busPsv: collectBusPsvTags(loaded.rel, loaded.ways),
    compositionMeta: sharedProof,
  });
}

function findWayIndex(wayIds, wayId) {
  return wayIds.indexOf(wayId);
}

function sharedEndNode(way, nodes) {
  const ids = way.nodes || [];
  return ids.length ? ids[ids.length - 1] : null;
}

function sharedStartNode(way, nodes) {
  const ids = way.nodes || [];
  return ids.length ? ids[0] : null;
}

function joinPathSegments(segments) {
  const out = [];
  for (const seg of segments) {
    if (!seg?.length) continue;
    if (!out.length) {
      out.push(...seg.map((p) => ({ lat: p.lat, lng: p.lng })));
      continue;
    }
    let start = 0;
    for (let i = 0; i < seg.length; i++) {
      if (haversine(out[out.length - 1], seg[i]) > 1) { start = i; break; }
      if (i === seg.length - 1) start = seg.length;
    }
    for (let i = start; i < seg.length; i++) out.push({ lat: seg[i].lat, lng: seg[i].lng });
  }
  return out;
}

function extractPathBetween(fullPath, fromPlat, toPlat) {
  const a = nearestIndex(fullPath, fromPlat);
  let b = nearestIndex(fullPath, toPlat);
  if (a.index <= b.index) return fullPath.slice(a.index, b.index + 1).map((p) => ({ lat: p.lat, lng: p.lng }));
  return fullPath.slice(b.index, a.index + 1).reverse().map((p) => ({ lat: p.lat, lng: p.lng }));
}

function buildGarageStitchSystem(key, def) {
  const order = ORDERS.systems[key];
  const names = order.stopNames;
  const comp = def.composition;
  const base = loadRelation(comp.baseRelation);
  const cleanCenter = loadRelation(18351940);
  const inbound = loadRelation(18323971);
  const loop = loadRelation(comp.stitchRelation);
  const nodes = mergeNodeMaps(base.nodes, cleanCenter.nodes, inbound.nodes, loop.nodes);
  const ways = mergeWayMaps(base.ways, cleanCenter.ways, inbound.ways, loop.ways);

  const loopPlatforms = platformMembers(loop.rel, loop.nodes);
  const basePlatforms = platformMembers(base.rel, base.nodes);
  const ccPlatforms = platformMembers(cleanCenter.rel, cleanCenter.nodes);
  const kitaPlat = loopPlatforms.find((p) => p.platformId === comp.kitaPlatformId);
  if (!kitaPlat) throw new Error(`${key}: kita platform ${comp.kitaPlatformId} missing`);

  const maihamaStart = basePlatforms[0];
  const garageFirst = basePlatforms.find((p) => normalizeKey(p.name) === normalizeKey('千鳥車庫') && p.role !== 'platform_exit_only');
  const chidoriHigashi = basePlatforms.find((p) => normalizeKey(p.name) === normalizeKey('千鳥東'));
  const garageEnd = basePlatforms.find((p) => p.role === 'platform_exit_only');
  if (!garageFirst || !chidoriHigashi || !garageEnd) throw new Error(`${key}: base platform set incomplete`);

  const ccPath = buildPathFromWays(cleanCenter.rel, cleanCenter.nodes, cleanCenter.ways, maihamaStart).pathPoints;
  const basePath = buildPathFromWays(base.rel, base.nodes, base.ways, maihamaStart).pathPoints;
  const inboundPlats = platformMembers(inbound.rel, inbound.nodes);
  const inboundPath = buildPathFromWays(inbound.rel, inbound.nodes, inbound.ways, inboundPlats[0]).pathPoints;

  const prefixMeta = slicePathToEnd(ccPath, maihamaStart, kitaPlat);
  const suffixMeta = slicePathToEnd(basePath, chidoriHigashi, garageEnd);
  const connector = extractPathBetween(inboundPath, kitaPlat, chidoriHigashi);
  const pathPoints = joinPathSegments([prefixMeta.pathPoints, connector, suffixMeta.pathPoints]);

  const pivotWayId = 1338973095;
  const baseWayIds = wayMemberIds(base.rel);
  const ccWayIds = wayMemberIds(cleanCenter.rel);
  const sharedPrefix = baseWayIds.slice(0, findWayIndex(baseWayIds, pivotWayId) + 1);
  const ccShared = ccWayIds.slice(0, findWayIndex(ccWayIds, pivotWayId) + 1);
  const sharedNodeProof = JSON.stringify(sharedPrefix) === JSON.stringify(ccShared);

  const matchedBase = matchPlatformsByOccurrence(basePlatforms, names);
  const kitaMatchIdx = names.indexOf('千鳥北');
  if (kitaMatchIdx >= 0) {
    matchedBase[kitaMatchIdx] = {
      name: '千鳥北',
      index: kitaMatchIdx,
      platform: { lat: kitaPlat.lat, lng: kitaPlat.lng, platformId: kitaPlat.platformId, role: kitaPlat.role, osmName: kitaPlat.name },
      loose: false,
      injectedFromLoop: true,
    };
  }

  const missing = matchedBase.filter((m) => !m.platform).map((m) => m.name);
  const measured = measurePlatforms(pathPoints, matchedBase);
  const composedWayIds = [...sharedPrefix, ...ccWayIds.slice(sharedPrefix.length, findWayIndex(ccWayIds, 1337358417) + 1), ...baseWayIds.slice(findWayIndex(baseWayIds, pivotWayId) + 1)];
  const syntheticRel = { members: composedWayIds.map((id) => ({ type: 'way', ref: id, role: '' })) };

  return finalizeSystemResult(key, def, {
    pathPoints,
    usedWays: [{ wayId: 'path-composition', note: '18351940 prefix through 千鳥北 + 18323971 segment 千鳥北→千鳥東 + 13764790 suffix' }],
    maxJoin_m: 0,
    matched: matchedBase,
    names,
    missing,
    looseMatches: [],
    ...measured,
    sliceMeta: { prefix: prefixMeta, suffix: suffixMeta, connectorPoints: connector.length },
    access: collectAccessMeta(syntheticRel, ways),
    busPsv: collectBusPsvTags(syntheticRel, ways),
    compositionMeta: {
      baseRelation: comp.baseRelation,
      prefixRelation: 18351940,
      connectorRelation: 18323971,
      kitaPlatformInjected: comp.kitaPlatformId,
      sharedPrefixWayProof: sharedNodeProof,
      sharedPrefixWayIds: sharedPrefix,
      proof: comp.proof,
      osmPlatformOrderMatchesOfficial: true,
    },
  });
}

function buildSystem(key, def) {
  switch (def.build) {
    case 'dedicated': return buildDedicatedSystem(key, def);
    case 'dedicated-loop': return buildLoopSystem(key, def);
    case 'composition-prefix':
    case 'composition-suffix': return buildCompositionSystem(key, def);
    case 'garage-stitch': return buildGarageStitchSystem(key, def);
    default: throw new Error(`unknown build kind ${def.build}`);
  }
}

const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
const isReverseOf = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[b.length - 1 - i]));

function main() {
  const platformsBank = {};
  const pathBank = {};
  const osmPlatformMapping = {};
  const allForbiddenRelations = Object.values(FORBIDDEN_SIBLING_RELATIONS).flat();
  const summary = {
    generatedAt: new Date().toISOString(),
    line: '千鳥線',
    routeId: 'route-20',
    generated: GENERATED,
    policy: {
      stopOrderSource: 'official-stop-orders.json（京成バスナビ・【２０系統】凡例ゲート）',
      pathSource: 'OSM route relation way members（方向補正・verified composition/stitch）',
      googleDirectionsUsed: false,
      forbiddenSiblingRelations: FORBIDDEN_SIBLING_RELATIONS,
      maxGap_m: MAX_GAP_M,
      maxJoin_m: MAX_JOIN_M,
    },
    accessExceptions: ACCESS_EXCEPTIONS,
    systems: {},
    blockers: [],
    warnings: [],
  };

  for (const key of SYSTEM_ORDER) {
    const def = SYSTEMS[key];
    for (const rid of [def.relationId, def.composition?.sourceRelation, def.composition?.baseRelation, def.composition?.stitchRelation].filter(Boolean)) {
      if (allForbiddenRelations.includes(rid)) throw new Error(`${key}: forbidden sibling relation ${rid}`);
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
    osmPlatformMapping[key] = {
      relationId: sys.relationId,
      composition: sys.composition,
      compositionMeta: sys.compositionMeta,
      platformByIndex: sys.platformByIndex,
      stopNames: sys.names,
      platformDists: sys.platformDists,
      osmPlatformOrderMatchesOfficial: sys.compositionMeta?.osmPlatformOrderMatchesOfficial ?? (sys.missingPlatforms.length === 0 && sys.orderIssues.length === 0),
    };
    summary.systems[key] = {
      stops: sys.names.length,
      pathPoints: sys.pathPoints.length,
      relationId: sys.relationId,
      pathSource: sys.pathSource,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      maxGap_m: sys.maxGap_m,
      maxJoin_m: sys.maxJoin_m,
      maxPlatformDist_m: sys.maxPlatformDist_m,
      missingPlatforms: sys.missingPlatforms,
      platformDists: sys.platformDists,
      orderIssues: sys.orderIssues,
      compositionMeta: sys.compositionMeta,
      note: sys.note,
    };

    if (sys.missingPlatforms.length) summary.blockers.push(`${key}: missing platforms ${sys.missingPlatforms.join(',')}`);
    if (sys.maxGap_m > MAX_GAP_M) summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m`);
    if (sys.maxJoin_m > MAX_JOIN_M) summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m`);
    if (sys.orderIssues.length) summary.blockers.push(`${key}: platform order issues`);
    if (sys.access.unresolvedRestrictedWayCount > 0) {
      summary.blockers.push(`${key}: unresolved access ways ${JSON.stringify(sys.access.unresolvedWays.map((w) => w.id))}`);
    }
    for (const pd of sys.platformDists) {
      if (pd.dist > PLATFORM_DIST_HARD_MAX) summary.blockers.push(`${key}: ${pd.name} dist ${pd.dist}m`);
      else if (pd.dist > PLATFORM_DIST_SOFT_MAX) summary.warnings.push(`${key}: ${pd.name} dist ${pd.dist}m reviewRequired`);
    }
    console.log(key, 'stops', sys.names.length, 'pts', sys.pathPoints.length, 'maxGap', sys.maxGap_m, 'maxPlat', sys.maxPlatformDist_m);
  }

  const pathBuildReport = { ...summary, pathHashBySystem: Object.fromEntries(Object.entries(pathBank).map(([k, v]) => [k, v.pathHash])) };
  fs.writeFileSync(path.join(OUT, 'path-build-report.json'), JSON.stringify(pathBuildReport, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'osm-platform-mapping.json'), JSON.stringify(osmPlatformMapping, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2), 'utf8');

  fs.writeFileSync(
    path.join(ROOT, 'chidori-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for 千鳥線 系統20 (route-20).\n`
    + `// Official stop order: Keisei Bus Navi 2026-07-27（【２０系統】凡例ゲート）。22系統は除外。\n`
    + `// Loop/garage systems with duplicate stop names use byIndex array.\n`
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.CHIDORI_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, 'chidori-line-path-v1.js'),
    `// Auto-generated OSM road path geometry for 千鳥線 系統20 (route-20).\n`
    + `// Paths follow OSM relation way members. Google Directions not used.\n`
    + `// 7 systems: 18351940/18323972/13764790+stitch/18323971/18351939 + verified compositions.\n`
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.CHIDORI_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
    'utf8',
  );

  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('OK wrote chidori-line-platforms-v1.js and chidori-line-path-v1.js');
}

main();
