'use strict';
/**
 * Build platforms + pathPoints for route-5 堀江線 from OSM relations.
 * Official stop order: evidence/official-stop-orders.json (Keisei Navi).
 * Short trips share verified prefixes of full outbound/inbound paths.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

function loadRelation(id) {
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

function densify(points, maxGap = 25) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const d = haversine(a, b);
    if (d > maxGap) {
      const n = Math.ceil(d / maxGap);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        });
      }
    }
    out.push(b);
  }
  return out;
}

function wayCoords(way, nodes) {
  const coords = [];
  for (const nid of way.nodes || []) {
    const n = nodes.get(nid);
    if (n) coords.push({ lat: n.lat, lng: n.lon, nodeId: nid });
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

function buildPathFromWays(rel, nodes, ways) {
  const wayMembers = (rel.members || []).filter((m) => m.type === 'way');
  const pathPts = [];
  const usedWays = [];
  let cursor = null;
  let maxJoin = 0;

  for (const m of wayMembers) {
    const way = ways.get(m.ref);
    if (!way) continue;
    let coords = wayCoords(way, nodes);
    if (coords.length < 2) continue;

    if (cursor) {
      const forward = distEnds(coords, cursor);
      const rev = distEnds(reverseCoords(coords), cursor);
      const useRev = rev.start < forward.start;
      if (useRev) coords = reverseCoords(coords);
      const join = haversine(cursor, coords[0]);
      maxJoin = Math.max(maxJoin, join);
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: Math.round(join * 10) / 10, flipped: useRev });
      if (join < 1) coords = coords.slice(1);
    } else {
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: 0, flipped: false });
    }
    for (const c of coords) {
      pathPts.push({ lat: c.lat, lng: c.lng });
      cursor = c;
    }
  }
  return { pathPoints: densify(pathPts, 25), usedWays, rawCount: pathPts.length, maxJoin_m: Math.round(maxJoin * 10) / 10 };
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

/** Slice full path from start platform to end platform along travel order. */
function slicePathToEnd(fullPath, startPlat, endPlat) {
  const start = nearestIndex(fullPath, startPlat);
  const end = nearestIndex(fullPath, endPlat);
  let si = start.index;
  let ei = end.index;
  if (si > ei) {
    // Prefer forward travel: search end after start
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

const SYSTEMS = {
  '5-shinurayasu': {
    relationId: 18417632,
    resolvedVersion: '2026-07-24-horie-shinurayasu-v1',
    names: ORDERS.systems['5-shinurayasu'].stopNames,
    pathSource: 'osm-relation-18417632',
  },
  '5-ntt': {
    relationId: 18417632,
    resolvedVersion: '2026-07-24-horie-ntt-v1',
    names: ORDERS.systems['5-ntt'].stopNames,
    pathSource: 'osm-relation-18417632-prefix-to-ntt',
    sliceToName: 'ＮＴＴ浦安前',
    note: 'Navi Ｎ便は新浦安駅行きとＮＴＴ浦安前まで同一停留所順。営業終点platformでpath終了（回送は含めない）。',
  },
  '5-urayasu': {
    relationId: 18417631,
    resolvedVersion: '2026-07-24-horie-urayasu-v1',
    names: ORDERS.systems['5-urayasu'].stopNames,
    pathSource: 'osm-relation-18417631',
  },
  '5-tokai': {
    relationId: 18417631,
    resolvedVersion: '2026-07-24-horie-tokai-v1',
    names: ORDERS.systems['5-tokai'].stopNames,
    pathSource: 'osm-relation-18417631-prefix-to-tokai',
    sliceToName: '東海大浦安高校前',
    note: 'Navi と便は浦安駅入口行きと東海大浦安高校前まで同一停留所順。営業終点で終了。',
  },
  '5-higashino-chuo': {
    relationId: 18417631,
    resolvedVersion: '2026-07-24-horie-higashino-chuo-v1',
    names: ORDERS.systems['5-higashino-chuo'].stopNames,
    pathSource: 'osm-relation-18417631-prefix-to-higashino-chuo',
    sliceToName: '東野中央',
    note: 'Navi 中央便は浦安駅入口行きと東野中央まで同一停留所順。営業終点で終了。',
  },
};

function buildSystem(key, def, cache) {
  const relId = def.relationId;
  if (!cache[relId]) {
    const loaded = loadRelation(relId);
    const platforms = platformMembers(loaded.rel, loaded.nodes);
    const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways);
    cache[relId] = { ...loaded, platforms, pathBuild };
  }
  const { platforms, pathBuild } = cache[relId];
  const matched = matchPlatformsToNames(platforms, def.names);
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);
  if (missing.length) console.warn(key, 'missing platforms', missing);

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  if (def.sliceToName) {
    const startPlat = matched.find((m) => m.name === def.names[0])?.platform;
    const endPlat = matched.find((m) => m.name === def.sliceToName)?.platform;
    if (!startPlat || !endPlat) throw new Error(`${key} slice platforms missing`);
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
    // Confirm prefix: start near first point
    if (haversine(pathPoints[0], startPlat) > haversine(pathPoints[pathPoints.length - 1], startPlat)) {
      throw new Error(`${key} slice orientation invalid`);
    }
  } else {
    // Trim full path to first/last platforms of this system
    const startPlat = matched.find((m) => m.name === def.names[0])?.platform;
    const endPlat = matched.find((m) => m.name === def.names[def.names.length - 1])?.platform;
    if (startPlat && endPlat) {
      sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
      pathPoints = sliceMeta.pathPoints;
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
    usedWaysSample: pathBuild.usedWays.slice(0, 5),
    maxJoin_m: pathBuild.maxJoin_m,
  };
}

function main() {
  const cache = {};
  const platformsBank = {};
  const pathBank = {};
  const summary = { generatedAt: new Date().toISOString(), systems: {} };

  for (const [key, def] of Object.entries(SYSTEMS)) {
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
    };
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
      'missing',
      sys.missingPlatforms.length,
    );
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  fs.writeFileSync(
    path.join(ROOT, 'horie-platforms-v1.js'),
    `// Auto-generated OSM platforms for 堀江線 (route-5).\n// Official stop order: Keisei Bus Navi 2026-07-24.\n// Generated: 2026-07-24-horie-v1\n(() => {\n  window.HORIE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'horie-path-v1.js'),
    `// Auto-generated OSM road path geometry for 堀江線 (route-5).\n// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n// Short trips use verified prefixes of full relations ending at Navi terminus platforms.\n// Generated: 2026-07-24-horie-v1\n(() => {\n  window.HORIE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );
  console.log('wrote horie-platforms-v1.js and horie-path-v1.js');
}

main();
