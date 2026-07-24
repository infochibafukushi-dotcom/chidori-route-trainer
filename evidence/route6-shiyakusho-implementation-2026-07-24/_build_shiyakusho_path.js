'use strict';
/**
 * Build platforms + pathPoints for route-6 市役所線 from OSM relations.
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

function buildPathFromWays(rel, nodes, ways, startHint = null) {
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
    } else if (startHint) {
      // Orient first way so travel begins at the end nearer the departure platform.
      const forward = distEnds(coords, startHint);
      const rev = distEnds(reverseCoords(coords), startHint);
      const useRev = rev.start < forward.start;
      if (useRev) coords = reverseCoords(coords);
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: 0, flipped: useRev, startHint: true });
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
  '6-maihama': {
    relationId: 9983007,
    resolvedVersion: '2026-07-24-shiyakusho-maihama-v1',
    names: ORDERS.systems['6-maihama'].stopNames,
    pathSource: 'osm-relation-9983007',
  },
  '6-chidori': {
    relationId: 18396393,
    resolvedVersion: '2026-07-24-shiyakusho-chidori-v1',
    names: ORDERS.systems['6-chidori'].stopNames,
    pathSource: 'osm-relation-18396393',
    note: '千鳥北方面には行かない。運動公園→千鳥車庫。',
  },
  '6-urayasu-maihama': {
    relationId: 18322968,
    resolvedVersion: '2026-07-24-shiyakusho-urayasu-maihama-v1',
    names: ORDERS.systems['6-urayasu-maihama'].stopNames,
    pathSource: 'osm-relation-18322968',
  },
  '6-tokai': {
    relationId: 18322968,
    resolvedVersion: '2026-07-24-shiyakusho-tokai-v1',
    names: ORDERS.systems['6-tokai'].stopNames,
    pathSource: 'osm-relation-18322968-prefix-to-tokai',
    sliceToName: '東海大浦安高校前',
    note: 'Navi と便は浦安駅入口行き（舞浜駅発）と東海大浦安高校前まで同一停留所順。営業終点で終了。',
  },
  '6-urayasu-chidori': {
    relationId: 18396392,
    resolvedVersion: '2026-07-24-shiyakusho-urayasu-chidori-v1',
    names: ORDERS.systems['6-urayasu-chidori'].stopNames,
    pathSource: 'osm-relation-18396392+platform-6796350266-departure',
    // Relation 18396392 lists arrival node 12385535203 as platform_entry_only.
    // OSM node 6796350266 is the verified 始発（浦安駅入口行き）berth (note tag),
    // same departure platform used by 今川/富岡 千鳥車庫発. Not path reuse — platform only.
    platformOverrides: {
      千鳥車庫: {
        lat: 35.6273243,
        lng: 139.8976789,
        platformId: 6796350266,
        role: 'platform_entry_only',
        osmName: '千鳥車庫',
        note: 'OSM始発（浦安駅入口・新浦安駅行き）。relation18396392の到着node12385535203とは別。',
      },
    },
    startHintFromOverride: '千鳥車庫',
    note: '千鳥車庫は発車用platform 6796350266。先頭way 1337358420は発車側から反転連結。',
  },
};

function buildSystem(key, def, cache) {
  const relId = def.relationId;
  const startHint =
    def.startHintFromOverride && def.platformOverrides?.[def.startHintFromOverride]
      ? def.platformOverrides[def.startHintFromOverride]
      : null;
  const cacheKey = startHint ? `${relId}:hint-${startHint.platformId}` : String(relId);
  if (!cache[cacheKey]) {
    const loaded = loadRelation(relId);
    const platforms = platformMembers(loaded.rel, loaded.nodes);
    const pathBuild = buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startHint);
    cache[cacheKey] = { ...loaded, platforms, pathBuild };
  }
  const { platforms, pathBuild } = cache[cacheKey];
  const matched = matchPlatformsToNames(platforms, def.names);
  if (def.platformOverrides) {
    for (const m of matched) {
      const ov = def.platformOverrides[m.name];
      if (ov) {
        m.platform = {
          lat: ov.lat,
          lng: ov.lng,
          platformId: ov.platformId,
          osmName: ov.osmName || m.name,
          role: ov.role || 'platform',
        };
      }
    }
  }
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
    path.join(ROOT, 'shiyakusho-platforms-v1.js'),
    `// Auto-generated OSM platforms for 市役所線 (route-6).\n// Official stop order: Keisei Bus Navi 2026-07-24.\n// 千鳥車庫発は OSM 始発 platform 6796350266（到着 node 12385535203 と区別）。\n// Generated: 2026-07-24-shiyakusho-v1\n(() => {\n  window.SHIYAKUSHO_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'shiyakusho-path-v1.js'),
    `// Auto-generated OSM road path geometry for 市役所線 (route-6).\n// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n// Short trips use verified prefixes of full relations ending at Navi terminus platforms.\n// Generated: 2026-07-24-shiyakusho-v1\n(() => {\n  window.SHIYAKUSHO_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );
  console.log('wrote shiyakusho-platforms-v1.js and shiyakusho-path-v1.js');
}

main();
