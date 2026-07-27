'use strict';
/**
 * Build platforms + pathPoints for route-38 明海クオン線 (express).
 * Boarding stops only in platforms/stops; path includes 海風の街 roadside pass geometry.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const EXPRESS_PASS = (ORDERS.expressPassLocations || []).map((x) => x.name);

const PLATFORM_DIST_HARD_MAX = 30;
const PLATFORM_DIST_SOFT_MAX = 20;
const MAX_GAP_M = 30;
const MAX_JOIN_M = 1;
const GENERATED = '2026-07-27-akemi-quon-line-v1';

const FORBIDDEN_SIBLING_RELATIONS = {
  18: [18352908, 18352907, 18417590],
  15: [18419865, 18419864],
  19: [18381771, 18381770],
  10: [18381757, 18381756],
};

const SYSTEMS = {
  '38-shinurayasu-quon-express': {
    relationId: 18396354,
    resolvedVersion: '2026-07-27-akemi38-shinurayasu-quon-express-v1',
    pathSource: 'osm-relation-18396354+startHint-shinurayasu-berth38',
    platformByIndex: true,
    note: 'express loop 新浦安駅→海風の街(pass)→明海小学校→クオン新浦安→新浦安駅',
  },
};

const PLATFORM_SEEDS = [
  { name: '新浦安駅', lat: 35.6496296, lng: 139.9137782, platformId: 8415001166, role: 'platform_entry_only', local_ref: 'B', osmName: '新浦安駅' },
  { name: '明海小学校', lat: 35.6423565, lng: 139.9180964, platformId: 6899769134, role: 'platform', osmName: '明海小学校' },
  { name: 'クオン新浦安', lat: 35.6431009, lng: 139.9171476, platformId: 6852993565, role: 'platform', osmName: 'クオン新浦安' },
  { name: '新浦安駅', lat: 35.649411, lng: 139.9142448, platformId: 8415001163, role: 'platform_exit_only', local_ref: 'X', osmName: '新浦安駅' },
];

function loadRelation(id) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${id}.json`), 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  if (!rel) throw new Error(`relation ${id} missing`);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  return { rel, nodes, ways };
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
      if (!shared && join > MAX_JOIN_M) throw new Error(`way join gap ${join.toFixed(3)}m > ${MAX_JOIN_M}m between ${prevWayId} and ${m.ref}`);
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
    si, ei,
    startDist: Math.round(start.dist * 10) / 10,
    endDist: Math.round(haversine(fullPath[ei], endPlat) * 10) / 10,
  };
}

function buildSystem(key, def) {
  const order = ORDERS.systems[key];
  const names = order.stopNames;

  for (const pass of EXPRESS_PASS) {
    if (names.includes(pass)) throw new Error(`${key}: express pass location ${pass} must NOT be in boarding stops[]`);
  }

  const loaded = loadRelation(def.relationId);
  const startSeed = PLATFORM_SEEDS[0];
  const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, { lat: startSeed.lat, lng: startSeed.lng });

  let pathPoints = pathBuild.pathPoints;
  const endSeed = PLATFORM_SEEDS[PLATFORM_SEEDS.length - 1];
  const sliceMeta = slicePathToEnd(pathPoints, startSeed, endSeed);
  pathPoints = sliceMeta.pathPoints;

  const matched = PLATFORM_SEEDS.map((s) => ({ name: s.name, platform: s }));
  const platformDists = matched.map((m) => {
    const ni = nearestIndex(pathPoints, m.platform);
    return { name: m.name, dist: Math.round(ni.dist * 10) / 10, pathIndex: ni.index };
  });

  let lastIdx = -1;
  const orderIssues = [];
  for (const pd of platformDists) {
    if (pd.pathIndex < lastIdx) orderIssues.push({ name: pd.name, index: pd.pathIndex, prev: lastIdx });
    lastIdx = Math.max(lastIdx, pd.pathIndex);
  }

  const platObjs = {
    byIndex: PLATFORM_SEEDS.map((s) => ({
      lat: s.lat, lng: s.lng, platformId: s.platformId, role: s.role,
      osmName: s.osmName, name: s.name, local_ref: s.local_ref || null,
    })),
  };

  return {
    key,
    relationId: def.relationId,
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    pathHash: sha256(pathPoints),
    pathPoints,
    platforms: platObjs,
    names,
    expressPassLocations: EXPRESS_PASS,
    maxGap_m: maxGap(pathPoints),
    maxJoin_m: pathBuild.maxJoin_m,
    maxPlatformDist_m: Math.max(0, ...platformDists.map((p) => p.dist)),
    platformDists,
    orderIssues,
    usedWayCount: pathBuild.usedWays.length,
    sliceMeta,
    note: def.note,
  };
}

function main() {
  const summary = {
    builtAt: new Date().toISOString(),
    generated: GENERATED,
    routeId: 'route-38',
    expressPassLocations: EXPRESS_PASS,
    systems: {},
    blockers: [],
    warnings: [],
  };

  const platformsBank = {};
  const pathBank = {};

  for (const [key, def] of Object.entries(SYSTEMS)) {
    const sys = buildSystem(key, def);
    summary.systems[key] = sys;
    platformsBank[key] = sys.platforms;
    pathBank[key] = {
      pathPoints: sys.pathPoints,
      pathHash: sys.pathHash,
      pathSource: sys.pathSource,
      resolvedVersion: sys.resolvedVersion,
    };

    if (sys.orderIssues.length) summary.blockers.push(`${key}: platform order issues`);
    if (sys.maxGap_m > MAX_GAP_M) summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m`);
    if (sys.maxJoin_m > MAX_JOIN_M) summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m`);
    for (const pd of sys.platformDists) {
      if (pd.dist > PLATFORM_DIST_HARD_MAX) summary.blockers.push(`${key}: ${pd.name} dist ${pd.dist}m`);
    }
    for (const pass of EXPRESS_PASS) {
      if (sys.names.includes(pass)) summary.blockers.push(`${key}: express pass ${pass} in stops[]`);
    }

    console.log(key, 'boarding', sys.names.length, 'pathPts', sys.pathPoints.length, 'maxGap', sys.maxGap_m, 'hash', sys.pathHash.slice(0, 12));
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  fs.writeFileSync(
    path.join(ROOT, 'akemi-quon-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for 明海クオン線 系統38 (route-38).\n`
    + `// Boarding stops only — express pass 海風の街 excluded.\n`
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.AKEMI_QUON_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, 'akemi-quon-line-path-v1.js'),
    `// Auto-generated OSM road path for 明海クオン線 系統38 (route-38).\n`
    + `// Full relation geometry including 海風の街 roadside pass segment.\n`
    + `// Generated: ${GENERATED}\n`
    + `(() => {\n  window.AKEMI_QUON_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
    'utf8',
  );

  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('done');
}

main();
