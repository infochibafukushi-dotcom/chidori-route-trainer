'use strict';
/**
 * Build platforms + pathPoints for route-14 弁天・富岡線 from OSM relations.
 *
 * Rules:
 *  - Stop order comes from official-stop-orders.json (navi). Never reversed/truncated.
 *  - Each system gets its OWN relation. 新浦安⇔舞浜 and 新浦安⇔千鳥車庫 are built
 *    independently; neither is derived by trimming the other.
 *  - densify only inside a single OSM way; way joins need a shared node or ≤1m.
 *  - Google Directions is never used.
 *
 * Writes benten-tomioka-line-platforms-v1.js and benten-tomioka-line-path-v1.js at repo root,
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
const GENERATED = '2026-07-26-benten-tomioka-v1';

/**
 * OSM ways that are access-restricted but legitimately driven by route 14.
 * 千鳥車庫 is Tokyo Bay City's own depot, so its internal service road is access=private.
 */
const ACCESS_EXCEPTIONS = {
  1296818464: '千鳥車庫（東京ベイシティ交通の営業所）構内サービス道路。access=private だが自社バスの入出庫路であり14系統ちの終点。',
};

const SYSTEMS = {
  '14-maihama': {
    relationId: 18323926,
    resolvedVersion: '2026-07-26-benten-tomioka-maihama-v1',
    pathSource: 'osm-relation-18323926+startHint-shinurayasu',
    note: 'outbound 新浦安駅→舞浜駅（無印）。千鳥車庫便の切り詰めではなく専用relation。',
  },
  '14-chidori-garage': {
    relationId: 18419877,
    resolvedVersion: '2026-07-26-benten-tomioka-chidori-garage-v1',
    pathSource: 'osm-relation-18419877+startHint-shinurayasu',
    note: 'outbound 新浦安駅→千鳥車庫（ち）。舞浜便path流用禁止。千鳥北方面へは行かない。',
  },
  '14-shinurayasu-maihama': {
    relationId: 9983017,
    resolvedVersion: '2026-07-26-benten-tomioka-shinurayasu-maihama-v1',
    pathSource: 'osm-relation-9983017+startHint-maihama',
    note: 'inbound 舞浜駅→新浦安駅（無印）。往路18323926の反転は禁止。',
  },
  '14-shinurayasu-chidori': {
    relationId: 18419876,
    resolvedVersion: '2026-07-26-benten-tomioka-shinurayasu-chidori-v1',
    pathSource: 'osm-relation-18419876+startHint-chidori-garage',
    note: 'inbound 千鳥車庫→新浦安駅（し）。往路18419877の反転は禁止。',
  },
};

const SYSTEM_ORDER = ['14-maihama', '14-chidori-garage', '14-shinurayasu-maihama', '14-shinurayasu-chidori'];

function loadRelation(id) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${id}.json`), 'utf8'));
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
  let si = start.index;
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

function matchPlatforms(platforms, names) {
  const used = new Set();
  const matched = [];
  for (const name of names) {
    const nk = normalizeKey(name);
    let best = null;
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      if (normalizeKey(platforms[i].name) === nk) { best = i; break; }
    }
    if (best == null) {
      for (let i = 0; i < platforms.length; i++) {
        if (used.has(i)) continue;
        const pk = normalizeKey(platforms[i].name);
        if (pk.includes(nk) || nk.includes(pk)) { best = i; break; }
      }
    }
    if (best == null) {
      matched.push({ name, platform: null });
    } else {
      used.add(best);
      const p = platforms[best];
      matched.push({ name, platform: { lat: p.lat, lng: p.lng, platformId: p.platformId, role: p.role, osmName: p.name } });
    }
  }
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

function buildSystem(key, def) {
  const order = ORDERS.systems[key];
  if (!order) throw new Error(`no official order for ${key}`);
  const names = order.stopNames;
  const loaded = loadRelation(def.relationId);
  const platforms = platformMembers(loaded.rel, loaded.nodes);

  const startPlatformSeed = platforms.find((p) => normalizeKey(p.name) === normalizeKey(names[0]));
  if (!startPlatformSeed) throw new Error(`${key}: start platform ${names[0]} missing in relation ${def.relationId}`);

  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, {
    lat: startPlatformSeed.lat, lng: startPlatformSeed.lng,
  });

  const matched = matchPlatforms(platforms, names);
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);

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
    };
  }

  const platformDists = matched.filter((m) => m.platform).map((m) => {
    const ni = nearestIndex(pathPoints, m.platform);
    const dist = Math.round(ni.dist * 10) / 10;
    return { name: m.name, dist, pathIndex: ni.index, reviewRequired: dist > PLATFORM_DIST_SOFT_MAX && dist <= PLATFORM_DIST_HARD_MAX };
  });
  const maxPlatformDist = Math.max(0, ...platformDists.map((p) => p.dist));

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

  return {
    key,
    relationId: def.relationId,
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    pathHash: sha256(pathPoints),
    pathPoints,
    platforms: platObjs,
    names,
    missingPlatforms: missing,
    maxGap_m: maxGap(pathPoints),
    maxPlatformDist_m: maxPlatformDist,
    platformDists,
    orderIssues,
    nanCount,
    sliceMeta: sliceMeta ? { si: sliceMeta.si, ei: sliceMeta.ei, startDist: sliceMeta.startDist, endDist: sliceMeta.endDist, fullPathPoints: pathBuild.pathPoints.length } : null,
    usedWays: pathBuild.usedWays,
    usedWayCount: pathBuild.usedWays.length,
    maxJoin_m: pathBuild.maxJoin_m,
    access: collectAccessMeta(loaded.rel, loaded.ways),
    note: def.note,
  };
}

function main() {
  const platformsBank = {};
  const pathBank = {};
  const summary = {
    generatedAt: new Date().toISOString(),
    line: '弁天・富岡線',
    routeId: 'route-14',
    generated: GENERATED,
    policy: {
      stopOrderSource: 'official-stop-orders.json（京成バスナビ個別便通過時刻表）',
      pathSource: 'OSM route relation way members（方向補正あり）',
      googleDirectionsUsed: false,
      reverseReuseForbidden: true,
      truncationReuseForbidden: true,
      maxGap_m: MAX_GAP_M,
      maxJoin_m: MAX_JOIN_M,
      platformDistSoftMax_m: PLATFORM_DIST_SOFT_MAX,
      platformDistHardMax_m: PLATFORM_DIST_HARD_MAX,
    },
    accessExceptions: ACCESS_EXCEPTIONS,
    systems: {},
    blockers: [],
    warnings: [],
  };

  for (const key of SYSTEM_ORDER) {
    const sys = buildSystem(key, SYSTEMS[key]);
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
      relationId: sys.relationId,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      maxGap_m: sys.maxGap_m,
      maxJoin_m: sys.maxJoin_m,
      maxPlatformDist_m: sys.maxPlatformDist_m,
      nanCount: sys.nanCount,
      missingPlatforms: sys.missingPlatforms,
      platformDists: sys.platformDists,
      orderIssues: sys.orderIssues,
      sliceMeta: sys.sliceMeta,
      usedWayCount: sys.usedWayCount,
      usedWays: sys.usedWays,
      access: {
        restrictedAccessWayCount: sys.access.restrictedAccessWayCount,
        busPermittedRestrictedWayCount: sys.access.busPermittedRestrictedWayCount,
        documentedExceptionWayCount: sys.access.documentedExceptionWayCount,
        unresolvedRestrictedWayCount: sys.access.unresolvedRestrictedWayCount,
        restrictedWays: sys.access.restrictedWays,
        documentedExceptionWays: sys.access.documentedExceptionWays,
        unresolvedWays: sys.access.unresolvedWays,
      },
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
    for (const pd of sys.platformDists) {
      if (pd.dist > PLATFORM_DIST_HARD_MAX) summary.blockers.push(`${key}: ${pd.name} stop-to-path ${pd.dist}m > ${PLATFORM_DIST_HARD_MAX}m`);
      else if (pd.dist > PLATFORM_DIST_SOFT_MAX) summary.warnings.push(`${key}: ${pd.name} stop-to-path ${pd.dist}m reviewRequired`);
    }
    if (sys.access.documentedExceptionWayCount > 0) {
      summary.warnings.push(`${key}: documented access exception ways ${sys.access.documentedExceptionWays.map((w) => w.id).join(',')}`);
    }
    console.log(key, 'stops', sys.names.length, 'pts', sys.pathPoints.length, 'maxGap', sys.maxGap_m, 'maxJoin', sys.maxJoin_m, 'maxPlat', sys.maxPlatformDist_m, 'hash', sys.pathHash.slice(0, 12));
  }

  // Distinct-path proof: no two systems may share a pathHash, and neither direction
  // may be the exact reverse of its counterpart.
  const hashes = Object.entries(pathBank).map(([k, v]) => [k, v.pathHash]);
  summary.pathHashDistinct = new Set(hashes.map((h) => h[1])).size === hashes.length;
  if (!summary.pathHashDistinct) summary.blockers.push('duplicate pathHash across systems');
  const isReverseOf = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[b.length - 1 - i];
      if (Math.abs(x.lat - y.lat) > 1e-9 || Math.abs(x.lng - y.lng) > 1e-9) return false;
    }
    return true;
  };
  summary.reverseChecks = [
    { a: '14-maihama', b: '14-shinurayasu-maihama' },
    { a: '14-chidori-garage', b: '14-shinurayasu-chidori' },
  ].map(({ a, b }) => ({ a, b, isExactReverse: isReverseOf(pathBank[a].pathPoints, pathBank[b].pathPoints) }));
  for (const r of summary.reverseChecks) {
    if (r.isExactReverse) summary.blockers.push(`${r.b} is an exact reverse of ${r.a} — must come from its own relation`);
  }
  // Outbound 舞浜 vs 千鳥車庫 share the 新浦安→運動公園 corridor but must not be identical.
  summary.truncationChecks = [
    { a: '14-maihama', b: '14-chidori-garage' },
    { a: '14-shinurayasu-maihama', b: '14-shinurayasu-chidori' },
  ].map(({ a, b }) => ({
    a, b,
    samePathHash: pathBank[a].pathHash === pathBank[b].pathHash,
    aPoints: pathBank[a].pathPoints.length,
    bPoints: pathBank[b].pathPoints.length,
    aRelation: pathBank[a].relationId,
    bRelation: pathBank[b].relationId,
    distinctRelations: pathBank[a].relationId !== pathBank[b].relationId,
  }));

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2), 'utf8');

  fs.writeFileSync(
    path.join(ROOT, 'benten-tomioka-line-platforms-v1.js'),
    '// Auto-generated OSM platforms for 弁天・富岡線 (route-14).\n'
    + '// Official stop order: Keisei Bus Navi 個別便通過時刻表 2026-07-26 (符号 無印/ち/し で系統確定).\n'
    + '// Each system uses the platforms of its own OSM relation; outbound/inbound platforms differ.\n'
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.BENTEN_TOMIOKA_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, 'benten-tomioka-line-path-v1.js'),
    '// Auto-generated OSM road path geometry for 弁天・富岡線 (route-14).\n'
    + '// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n'
    + '// densify applies only within a single OSM way; way joins require a shared node or ≤1m.\n'
    + '// 18323926 新浦安⇒舞浜 / 18419877 新浦安⇒千鳥車庫 / 9983017 舞浜⇒新浦安 / 18419876 千鳥車庫⇒新浦安.\n'
    + '// NEVER reverse an outbound path for inbound, and NEVER truncate the 舞浜 path to make the 千鳥車庫 path.\n'
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.BENTEN_TOMIOKA_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
    'utf8',
  );

  console.log('pathHashDistinct', summary.pathHashDistinct);
  console.log('reverseChecks', JSON.stringify(summary.reverseChecks));
  console.log('truncationChecks', JSON.stringify(summary.truncationChecks));
  console.log('warnings', summary.warnings);
  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('wrote benten-tomioka-line-platforms-v1.js and benten-tomioka-line-path-v1.js');
}

main();
