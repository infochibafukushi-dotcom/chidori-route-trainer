'use strict';
/**
 * Build platforms + pathPoints for route-11 シンボルロード線 from OSM relations.
 * Official stop order: evidence/route11-symbol-road-implementation-2026-07-25/official-stop-orders.json
 *
 * v69+ safe rules (maihama/takasu):
 * - densifyWithinWay only
 * - join shared node or ≤1m else throw
 * - densify BEFORE skipping shared first node
 * - startHintFromStopName from start platform
 * - normalize OSM name 日の出南（墓地公園） → 日の出南
 * - NEVER reverse outbound for inbound — use relation 18352883
 * - NEVER use relation 18419852 (forbidden)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

const FORBIDDEN_RELATIONS = new Set([18419852]);

function loadRelation(id) {
  if (FORBIDDEN_RELATIONS.has(id)) {
    throw new Error(`FORBIDDEN relation ${id}`);
  }
  const p = path.join(OUT, `osm-relation-${id}.json`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  if (!rel) throw new Error(`relation ${id} missing`);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
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

function densifyWithinWay(coords, maxGap = 25) {
  if (coords.length < 2) {
    return coords.map((c) => ({ lat: c.lat, lng: c.lng, nodeId: c.nodeId, wayId: c.wayId }));
  }
  const out = [{ lat: coords[0].lat, lng: coords[0].lng, nodeId: coords[0].nodeId, wayId: coords[0].wayId }];
  for (let i = 1; i < coords.length; i++) {
    const a = out[out.length - 1];
    const b = coords[i];
    const d = haversine(a, b);
    if (d > maxGap) {
      const n = Math.ceil(d / maxGap);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
          wayId: b.wayId,
          densified: true,
        });
      }
    }
    out.push({ lat: b.lat, lng: b.lng, nodeId: b.nodeId, wayId: b.wayId });
  }
  return out;
}

function wayCoords(way, nodes) {
  const coords = [];
  for (const nid of way.nodes || []) {
    const n = nodes.get(nid);
    if (n) coords.push({ lat: n.lat, lng: n.lon, nodeId: nid, wayId: way.id });
  }
  return coords;
}

function reverseCoords(coords) {
  return coords.slice().reverse();
}

function distEnds(seq, point) {
  if (!seq.length) return { start: Infinity, end: Infinity };
  return {
    start: haversine(seq[0], point),
    end: haversine(seq[seq.length - 1], point),
  };
}

function buildPathFromWays(rel, nodes, ways, startHint = null, options = {}) {
  const MAX_JOIN_M = options.maxJoinM ?? 1;
  const verifiedJoins = options.verifiedJoins || {};
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
    let join = 0;
    if (cursor) {
      const forward = distEnds(coords, cursor);
      const rev = distEnds(reverseCoords(coords), cursor);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      join = haversine(cursor, coords[0]);
      maxJoin = Math.max(maxJoin, join);
      const shared =
        cursor.nodeId != null
        && coords[0].nodeId != null
        && cursor.nodeId === coords[0].nodeId;
      const joinKey = `${prevWayId}->${m.ref}`;
      const verified = verifiedJoins[joinKey];
      if (!shared && join > MAX_JOIN_M && !verified) {
        throw new Error(
          `way join gap ${join.toFixed(3)}m > ${MAX_JOIN_M}m between ${prevWayId} and ${m.ref} `
            + `(end node ${cursor.nodeId} @ ${cursor.lat},${cursor.lng} → start ${coords[0].nodeId}). `
            + 'Fix orientation / missing way, or add verifiedJoins.',
        );
      }
      usedWays.push({
        wayId: m.ref,
        role: m.role,
        gapFromPrev_m: Math.round(join * 1000) / 1000,
        flipped,
        sharedNode: shared,
        verifiedJoin: Boolean(verified),
      });
      if (verified && Array.isArray(verified.controlPoints) && verified.controlPoints.length) {
        for (const p of verified.controlPoints) {
          pathPts.push({ lat: p.lat, lng: p.lng, wayId: 'verified-control', control: true });
        }
      }
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
    const skipFirst =
      Boolean(cursor)
      && (haversine(cursor, densified[0]) < 1
        || (cursor.nodeId != null
          && densified[0].nodeId != null
          && cursor.nodeId === densified[0].nodeId));
    const toAdd = skipFirst ? densified.slice(1) : densified;
    for (const c of toAdd) {
      pathPts.push({ lat: c.lat, lng: c.lng });
    }
    const lastNode = coords[coords.length - 1];
    cursor = { lat: lastNode.lat, lng: lastNode.lng, nodeId: lastNode.nodeId };
    prevWayId = m.ref;
  }

  return {
    pathPoints: pathPts.map((p) => ({ lat: p.lat, lng: p.lng })),
    usedWays,
    rawCount: pathPts.length,
    maxJoin_m: Math.round(maxJoin * 10) / 10,
  };
}

function normalizeKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』®ＲR]/g, '');
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

function nearestDist(points, plat) {
  let best = Infinity;
  for (const p of points) best = Math.min(best, haversine(p, plat));
  return Math.round(best * 10) / 10;
}

function nearestIndex(points, plat) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversine(points[i], plat);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: bestD };
}

function slicePathToEnd(fullPath, startPlat, endPlat) {
  const start = nearestIndex(fullPath, startPlat);
  const end = nearestIndex(fullPath, endPlat);
  let si = start.index;
  let ei = end.index;
  if (si > ei) {
    let bestEi = ei;
    let bestD = Infinity;
    for (let i = si; i < fullPath.length; i++) {
      const d = haversine(fullPath[i], endPlat);
      if (d < bestD) {
        bestD = d;
        bestEi = i;
      }
    }
    ei = bestEi;
  }
  return {
    pathPoints: fullPath.slice(si, ei + 1),
    startDist: Math.round(start.dist * 10) / 10,
    endDist: Math.round(haversine(fullPath[ei], endPlat) * 10) / 10,
    si,
    ei,
  };
}

function matchPlatformsToNames(platforms, names) {
  const used = new Set();
  const matched = [];
  for (const name of names) {
    const nk = normalizeKey(name);
    let best = null;
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      const pk = normalizeKey(platforms[i].name);
      // 日の出南（墓地公園） ↔ 日の出南
      if (pk === nk || pk.includes(nk) || nk.includes(pk)) {
        best = i;
        break;
      }
      if (pk.replace(/前$/, '') === nk.replace(/前$/, '')) best = i;
    }
    if (best == null) {
      matched.push({ name, platform: null });
    } else {
      used.add(best);
      matched.push({
        name,
        platform: {
          lat: platforms[best].lat,
          lng: platforms[best].lng,
          platformId: platforms[best].platformId,
          osmName: platforms[best].name,
          role: platforms[best].role,
        },
      });
    }
  }
  return matched;
}

function findPlatformByName(platforms, name) {
  const nk = normalizeKey(name);
  for (const p of platforms) {
    const pk = normalizeKey(p.name);
    if (pk === nk || pk.includes(nk) || nk.includes(pk)) return p;
  }
  return null;
}

function isPrefixOf(shortNames, longNames) {
  if (shortNames.length > longNames.length) return false;
  return shortNames.every((n, i) => n === longNames[i]);
}

function isSuffixOf(shortNames, longNames) {
  if (shortNames.length > longNames.length) return false;
  const offset = longNames.length - shortNames.length;
  return shortNames.every((n, i) => n === longNames[offset + i]);
}

function isContiguousSlice(shortNames, longNames) {
  if (shortNames.length > longNames.length) return false;
  outer: for (let start = 0; start <= longNames.length - shortNames.length; start++) {
    for (let i = 0; i < shortNames.length; i++) {
      if (shortNames[i] !== longNames[start + i]) continue outer;
    }
    return { start, end: start + shortNames.length - 1 };
  }
  return null;
}

const OUTBOUND_FULL = '11-urayasu-hinode';
const INBOUND_FULL = '11-hinode-urayasu';
const OUTBOUND_NAMES = ORDERS.systems[OUTBOUND_FULL].stopNames;
const INBOUND_NAMES = ORDERS.systems[INBOUND_FULL].stopNames;

const SYSTEMS = {
  '11-urayasu-hinode': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-urayasu-hinode-v1',
    names: OUTBOUND_NAMES,
    pathSource: 'osm-relation-18352884+startHint-urayasu',
    startHintFromStopName: '浦安駅入口',
    note: 'outbound full 浦安駅入口→日の出南。relation 18352884。',
  },
  '11-urayasu-sogo-via-hinode-kominkan': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-urayasu-sogo-via-hinode-kominkan-v1',
    names: ORDERS.systems['11-urayasu-sogo-via-hinode-kominkan'].stopNames,
    pathSource: 'osm-relation-18352884-prefix-to-sogo+startHint-urayasu',
    startHintFromStopName: '浦安駅入口',
    sliceToName: '総合公園',
    shortTurn: true,
    verifyPrefixOf: OUTBOUND_FULL,
    note: 'outbound prefix 浦安→総合公園（日の出公民館経由）。',
  },
  '11-urayasu-baypark': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-urayasu-baypark-v1',
    names: ORDERS.systems['11-urayasu-baypark'].stopNames,
    pathSource: 'osm-relation-18352884-prefix-to-baypark+startHint-urayasu',
    startHintFromStopName: '浦安駅入口',
    sliceToName: 'ベイパーク',
    shortTurn: true,
    verifyPrefixOf: OUTBOUND_FULL,
    note: 'outbound prefix 浦安→ベイパーク。',
  },
  '11-urayasu-shinurayasu': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-urayasu-shinurayasu-v1',
    names: ORDERS.systems['11-urayasu-shinurayasu'].stopNames,
    pathSource: 'osm-relation-18352884-prefix-to-shinurayasu+startHint-urayasu',
    startHintFromStopName: '浦安駅入口',
    sliceToName: '新浦安駅',
    shortTurn: true,
    verifyPrefixOf: OUTBOUND_FULL,
    note: 'outbound prefix 浦安→新浦安駅。',
  },
  '11-shinurayasu-hinode': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-shinurayasu-hinode-v1',
    names: ORDERS.systems['11-shinurayasu-hinode'].stopNames,
    pathSource: 'osm-relation-18352884-mid-shinurayasu-to-hinode',
    startHintFromStopName: '浦安駅入口',
    midSliceOf: OUTBOUND_FULL,
    note: 'outbound mid-slice 新浦安→日の出南。',
  },
  '11-shinurayasu-sogo': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-shinurayasu-sogo-v1',
    names: ORDERS.systems['11-shinurayasu-sogo'].stopNames,
    pathSource: 'osm-relation-18352884-mid-shinurayasu-to-sogo',
    startHintFromStopName: '浦安駅入口',
    midSliceOf: OUTBOUND_FULL,
    note: 'outbound mid-slice 新浦安→総合公園。',
  },
  '11-shinurayasu-baypark': {
    relationId: 18352884,
    resolvedVersion: '2026-07-25-symbol-road-shinurayasu-baypark-v1',
    names: ORDERS.systems['11-shinurayasu-baypark'].stopNames,
    pathSource: 'osm-relation-18352884-mid-shinurayasu-to-baypark',
    startHintFromStopName: '浦安駅入口',
    midSliceOf: OUTBOUND_FULL,
    note: 'outbound mid-slice 新浦安→ベイパーク。',
  },
  '11-hinode-urayasu': {
    relationId: 18352883,
    resolvedVersion: '2026-07-25-symbol-road-hinode-urayasu-v1',
    names: INBOUND_NAMES,
    pathSource: 'osm-relation-18352883+startHint-hinode',
    startHintFromStopName: '日の出南',
    note: 'inbound full 日の出南→浦安。relation 18352883。往路逆順禁止。',
  },
  '11-hinode-shinurayasu': {
    relationId: 18352883,
    resolvedVersion: '2026-07-25-symbol-road-hinode-shinurayasu-v1',
    names: ORDERS.systems['11-hinode-shinurayasu'].stopNames,
    pathSource: 'osm-relation-18352883-prefix-to-shinurayasu+startHint-hinode',
    startHintFromStopName: '日の出南',
    sliceToName: '新浦安駅',
    shortTurn: true,
    verifyPrefixOf: INBOUND_FULL,
    note: 'inbound prefix 日の出南→新浦安。',
  },
  '11-sogo-shinurayasu': {
    relationId: 18352883,
    resolvedVersion: '2026-07-25-symbol-road-sogo-shinurayasu-v1',
    names: ORDERS.systems['11-sogo-shinurayasu'].stopNames,
    pathSource: 'osm-relation-18352883-mid-sogo-to-shinurayasu',
    startHintFromStopName: '日の出南',
    midSliceOf: INBOUND_FULL,
    note: 'inbound mid-slice 総合公園→新浦安。',
  },
  '11-sogo-urayasu': {
    relationId: 18352883,
    resolvedVersion: '2026-07-25-symbol-road-sogo-urayasu-v1',
    names: ORDERS.systems['11-sogo-urayasu'].stopNames,
    pathSource: 'osm-relation-18352883-mid-sogo-to-urayasu',
    startHintFromStopName: '日の出南',
    midSliceOf: INBOUND_FULL,
    note: 'inbound mid/suffix 総合公園→浦安。',
  },
};

const SYSTEM_ORDER = [
  '11-urayasu-hinode',
  '11-urayasu-sogo-via-hinode-kominkan',
  '11-urayasu-baypark',
  '11-urayasu-shinurayasu',
  '11-shinurayasu-hinode',
  '11-shinurayasu-sogo',
  '11-shinurayasu-baypark',
  '11-hinode-urayasu',
  '11-hinode-shinurayasu',
  '11-sogo-shinurayasu',
  '11-sogo-urayasu',
];

function buildSystem(key, def, cache) {
  const relId = def.relationId;
  if (FORBIDDEN_RELATIONS.has(relId)) throw new Error(`${key} forbidden relation ${relId}`);

  const loaded =
    cache[`load:${relId}`]
    || (() => {
      const L = loadRelation(relId);
      cache[`load:${relId}`] = L;
      return L;
    })();
  const platforms = platformMembers(loaded.rel, loaded.nodes);

  for (const p of platforms) {
    if (/高洲海浜公園|明海五丁目|望海の街/.test(p.name) && !/日の出南/.test(p.name)) {
      // 望海/明海五丁目/高洲海浜公園 must not appear on mainline relations
      if (/高洲海浜公園/.test(p.name)) {
        throw new Error(`${key} forbidden stop contamination: ${p.name}`);
      }
    }
  }

  let startHint = null;
  if (def.startHintFromStopName) {
    const p = findPlatformByName(platforms, def.startHintFromStopName);
    if (!p) throw new Error(`${key} startHint stop missing: ${def.startHintFromStopName}`);
    startHint = { lat: p.lat, lng: p.lng, platformId: p.platformId };
  }

  const cacheKey = startHint
    ? `${relId}:hint-${startHint.platformId || startHint.lat}`
    : String(relId);
  if (!cache[cacheKey]) {
    const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startHint);
    cache[cacheKey] = { pathBuild };
  }
  const { pathBuild } = cache[cacheKey];
  const matched = matchPlatformsToNames(platforms, def.names);
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  if (missing.length) console.warn(key, 'missing platforms', missing);

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;

  const startPlat = matched.find((m) => m.name === def.names[0])?.platform;
  const endPlat = matched.find((m) => m.name === def.names[def.names.length - 1])?.platform;

  if (def.sliceToName || def.midSliceOf || (startPlat && endPlat)) {
    const endSlicePlat = def.sliceToName
      ? matched.find((m) => m.name === def.sliceToName)?.platform
      : endPlat;
    if (!startPlat || !endSlicePlat) {
      throw new Error(`${key} slice platforms missing (start=${!!startPlat} end=${!!endSlicePlat})`);
    }
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endSlicePlat);
    pathPoints = sliceMeta.pathPoints;
    if (pathPoints.length < 2) throw new Error(`${key} sliced path too short`);
    if (haversine(pathPoints[0], startPlat) > haversine(pathPoints[pathPoints.length - 1], startPlat)) {
      throw new Error(`${key} slice orientation invalid`);
    }
  }

  const platObjs = {};
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat,
      lng: m.platform.lng,
      platformId: m.platform.platformId,
      role: m.platform.role,
      osmName: m.platform.osmName,
    };
  }

  const platDists = matched
    .filter((m) => m.platform)
    .map((m) => ({ name: m.name, dist: nearestDist(pathPoints, m.platform) }));
  const maxPlatDist = Math.max(0, ...platDists.map((p) => p.dist));

  let lastIdx = -1;
  const orderIssues = [];
  for (const m of matched) {
    if (!m.platform) continue;
    const ni = nearestIndex(pathPoints, m.platform);
    if (ni.index < lastIdx) {
      orderIssues.push({ name: m.name, index: ni.index, prev: lastIdx });
    }
    lastIdx = Math.max(lastIdx, ni.index);
  }

  let mainlineCheck = null;
  if (def.verifyPrefixOf) {
    const parent = ORDERS.systems[def.verifyPrefixOf]?.stopNames || [];
    const ok = isPrefixOf(def.names, parent);
    mainlineCheck = { type: 'prefix', of: def.verifyPrefixOf, ok };
    if (!ok) throw new Error(`${key} stopNames not prefix of ${def.verifyPrefixOf}`);
  } else if (def.midSliceOf) {
    const parent = ORDERS.systems[def.midSliceOf]?.stopNames || [];
    const slice = isContiguousSlice(def.names, parent);
    const suffix = isSuffixOf(def.names, parent);
    mainlineCheck = {
      type: suffix ? 'suffix' : 'mid-slice',
      of: def.midSliceOf,
      ok: Boolean(slice),
      slice,
    };
    if (!slice) throw new Error(`${key} stopNames not contiguous slice of ${def.midSliceOf}`);
  }

  return {
    key,
    relationId: relId,
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    pathHash: sha256(pathPoints),
    pathPoints,
    platforms: platObjs,
    names: def.names,
    missingPlatforms: missing,
    maxGap_m: maxGap(pathPoints),
    maxPlatformDist_m: maxPlatDist,
    platformDists: platDists,
    sliceMeta: sliceMeta
      ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist }
      : null,
    note: def.note || null,
    usedWays: pathBuild.usedWays,
    usedWaysSample: pathBuild.usedWays.slice(0, 8),
    maxJoin_m: pathBuild.maxJoin_m,
    orderIssues,
    mainlineCheck,
  };
}

function writeWayConnectivity(relId, cache, summary) {
  const loaded = cache[`load:${relId}`] || loadRelation(relId);
  cache[`load:${relId}`] = loaded;
  const platforms = platformMembers(loaded.rel, loaded.nodes);
  const startName = relId === 18352884 ? '浦安駅入口' : '日の出南';
  const hintPlat = findPlatformByName(platforms, startName);
  const startHint = hintPlat
    ? { lat: hintPlat.lat, lng: hintPlat.lng, platformId: hintPlat.platformId }
    : null;
  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startHint);
  const report = {
    relationId: relId,
    startHint: startName,
    maxJoin_m: pathBuild.maxJoin_m,
    usedWayCount: pathBuild.usedWays.length,
    pathPointCount: pathBuild.pathPoints.length,
    joins: pathBuild.usedWays.map((w) => ({
      wayId: w.wayId,
      gapFromPrev_m: w.gapFromPrev_m,
      flipped: w.flipped,
      sharedNode: w.sharedNode || false,
      startHint: w.startHint || false,
    })),
    gapsOver1m: pathBuild.usedWays.filter((w) => (w.gapFromPrev_m || 0) > 1),
    ok: pathBuild.maxJoin_m <= 1,
  };
  fs.writeFileSync(path.join(OUT, `_way_connectivity_${relId}.json`), JSON.stringify(report, null, 2));
  summary.wayConnectivity = summary.wayConnectivity || {};
  summary.wayConnectivity[relId] = {
    maxJoin_m: report.maxJoin_m,
    usedWayCount: report.usedWayCount,
    gapsOver1m: report.gapsOver1m.length,
    ok: report.ok,
  };
  return report;
}

function main() {
  const cache = {};
  const platformsBank = {};
  const pathBank = {};
  const summary = {
    generatedAt: new Date().toISOString(),
    line: 'シンボルロード線',
    routeId: 'route-11',
    systems: {},
    blockers: [],
    forbiddenRelations: [...FORBIDDEN_RELATIONS],
    nameNormalization: { '日の出南（墓地公園）': '日の出南' },
    confirmedSystemCount: SYSTEM_ORDER.length,
  };

  // Pre-check way connectivity for both mainline relations
  for (const relId of [18352884, 18352883]) {
    try {
      const wc = writeWayConnectivity(relId, cache, summary);
      if (!wc.ok) {
        summary.blockers.push(`relation ${relId}: maxJoin ${wc.maxJoin_m}m > 1m`);
      }
    } catch (err) {
      summary.blockers.push(`relation ${relId}: ${err.message}`);
      console.error('WAY CONNECTIVITY FAIL', relId, err.message);
    }
  }

  if (summary.blockers.length) {
    fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
    console.error('BLOCKERS (stop before writing banks)', summary.blockers);
    process.exit(1);
  }

  for (const key of SYSTEM_ORDER) {
    const def = SYSTEMS[key];
    const sys = buildSystem(key, def, cache);
    platformsBank[key] = sys.platforms;
    pathBank[key] = {
      relationId: sys.relationId,
      pathSource: sys.pathSource,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      pathPoints: sys.pathPoints,
    };
    summary.systems[key] = {
      stops: sys.names.length,
      pathPoints: sys.pathPoints.length,
      maxGap_m: sys.maxGap_m,
      maxPlatformDist_m: sys.maxPlatformDist_m,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      missingPlatforms: sys.missingPlatforms,
      platformDists: sys.platformDists,
      sliceMeta: sys.sliceMeta,
      maxJoin_m: sys.maxJoin_m,
      note: sys.note,
      usedWaysSample: sys.usedWaysSample,
      orderIssues: sys.orderIssues,
      usedWayCount: sys.usedWays.length,
      mainlineCheck: sys.mainlineCheck,
    };
    if (sys.missingPlatforms.length) {
      summary.blockers.push(`${key}: missing platforms ${sys.missingPlatforms.join(',')}`);
    }
    if (sys.maxPlatformDist_m > 20) {
      summary.blockers.push(`${key}: maxPlatformDist ${sys.maxPlatformDist_m}m > 20m`);
    }
    if (sys.maxGap_m > 30) {
      summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m > 30m`);
    }
    if (sys.maxJoin_m > 1) {
      summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m > 1m`);
    }
    if (sys.orderIssues.length) {
      summary.blockers.push(`${key}: platform order issues ${JSON.stringify(sys.orderIssues)}`);
    }
    console.log(
      key,
      'stops',
      sys.names.length,
      'pts',
      sys.pathPoints.length,
      'maxGap',
      sys.maxGap_m,
      'maxPlat',
      sys.maxPlatformDist_m,
      'maxJoin',
      sys.maxJoin_m,
      'hash',
      sys.pathHash.slice(0, 12),
    );
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(ROOT, 'symbol-road-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for シンボルロード線 (route-11).\n`
      + `// Official stop order: Keisei Bus Navi 2026-07-25.\n`
      + `// OSM「日の出南（墓地公園）」→ 公式「日の出南」。\n`
      + `// Generated: 2026-07-25-symbol-road-v1\n`
      + `(() => {\n  window.SYMBOL_ROAD_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'symbol-road-line-path-v1.js'),
    `// Auto-generated OSM road path geometry for シンボルロード線 (route-11).\n`
      + `// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n`
      + `// densify applies only within a single OSM way; way joins require shared node or ≤1m.\n`
      + `// NEVER reverse outbound for inbound — use relation 18352883. NEVER use 18419852.\n`
      + `// Generated: 2026-07-25-symbol-road-v1\n`
      + `(() => {\n  window.SYMBOL_ROAD_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );

  console.log('wrote symbol-road-line-platforms-v1.js and symbol-road-line-path-v1.js');
}

main();
