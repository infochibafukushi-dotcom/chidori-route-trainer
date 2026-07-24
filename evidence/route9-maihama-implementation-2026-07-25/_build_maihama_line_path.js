'use strict';
/**
 * Build platforms + pathPoints for route-9 舞浜線 from OSM relations.
 * Official stop order: evidence/route9-maihama-implementation-2026-07-25/official-stop-orders.json
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

/** Slice forward from start platform toward end (for mid-route departures). */
function slicePathFromStart(fullPath, startPlat, endPlat, awayFromPlat = null) {
  const start = nearestIndex(fullPath, startPlat);
  let si = start.index;
  if (awayFromPlat) {
    const away = nearestIndex(fullPath, awayFromPlat);
    if (si <= away.index) {
      let bestSi = si;
      let bestD = Infinity;
      for (let i = away.index + 1; i < fullPath.length; i++) {
        const d = haversine(fullPath[i], startPlat);
        if (d < bestD) {
          bestD = d;
          bestSi = i;
        }
      }
      si = bestSi;
    }
  }
  const tail = fullPath.slice(si);
  const end = nearestIndex(tail, endPlat);
  return {
    pathPoints: tail.slice(0, end.index + 1),
    startDist: Math.round(haversine(fullPath[si], startPlat) * 10) / 10,
    endDist: Math.round(haversine(tail[end.index], endPlat) * 10) / 10,
    si,
    ei: si + end.index,
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

function verifyPrefixPlatforms(prefixKey, fullKey, platformsBank) {
  const prefix = platformsBank[prefixKey];
  const full = platformsBank[fullKey];
  const mismatches = [];
  for (const name of Object.keys(prefix || {})) {
    const a = prefix[name];
    const b = full?.[name];
    if (!b) {
      mismatches.push({ name, issue: 'missing in full' });
      continue;
    }
    if (a.platformId !== b.platformId || Math.abs(a.lat - b.lat) > 0.000001 || Math.abs(a.lng - b.lng) > 0.000001) {
      mismatches.push({ name, issue: 'platform mismatch', prefixId: a.platformId, fullId: b.platformId });
    }
  }
  return mismatches;
}

// Verified OSM: 京成ローズタウン arrival (3498220 inbound) = 6778604860;
// departure / outbound terminus (18320323) = 6778604861 — different nodes.
const ROSETOWN_DEPARTURE_OVERRIDE = {
  lat: 35.6414511,
  lng: 139.8812333,
  platformId: 6778604861,
  role: 'platform',
  osmName: '京成ローズタウン',
  note: '始発（浦安駅入口行き）。relation3498220の到着node6778604860とは別。9-rosetown終点と同一。',
};

const SYSTEMS = {
  '9-maihama': {
    relationId: 18320323,
    resolvedVersion: '2026-07-25-maihama-line-maihama-v1',
    names: ORDERS.systems['9-maihama'].stopNames,
    pathSource: 'osm-relation-18320323',
  },
  '9-rosetown': {
    relationId: 18320323,
    resolvedVersion: '2026-07-25-maihama-line-rosetown-v1',
    names: ORDERS.systems['9-rosetown'].stopNames,
    pathSource: 'osm-relation-18320323-prefix-to-rosetown',
    sliceToName: '京成ローズタウン',
    shortTurn: true,
    verifyPrefixOf: '9-maihama',
  },
  '9-urayasu': {
    relationId: 3498220,
    resolvedVersion: '2026-07-25-maihama-line-urayasu-v1',
    names: ORDERS.systems['9-urayasu'].stopNames,
    pathSource: 'osm-relation-3498220',
  },
  '9-tokai': {
    relationId: 18419884,
    resolvedVersion: '2026-07-25-maihama-line-tokai-v1',
    names: ORDERS.systems['9-tokai'].stopNames,
    pathSource: 'osm-relation-18419884-prefix-to-tokai-entrance',
    sliceToName: '東海大浦安高校入口',
    note: '終点は東海大浦安高校入口（高校前ではない）。',
  },
  '9-maihama-tokai': {
    relationId: 18419885,
    resolvedVersion: '2026-07-25-maihama-line-maihama-tokai-v1',
    names: ORDERS.systems['9-maihama-tokai'].stopNames,
    pathSource: 'osm-relation-18419885',
  },
  '9-urayasu-rosetown': {
    relationId: 3498220,
    resolvedVersion: '2026-07-25-maihama-line-urayasu-rosetown-v1',
    names: ORDERS.systems['9-urayasu-rosetown'].stopNames,
    pathSource: 'osm-relation-3498220+platform-6778604861-departure',
    platformOverrides: {
      京成ローズタウン: ROSETOWN_DEPARTURE_OVERRIDE,
    },
    startHintFromOverride: '京成ローズタウン',
    sliceFromStart: true,
    awayFromName: '舞浜駅',
    note: '京成ローズタウン始発は OSM node 6778604861。舞浜方面へ戻らない。',
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

  const startPlat = matched.find((m) => m.name === def.names[0])?.platform;
  const endPlat = matched.find((m) => m.name === def.names[def.names.length - 1])?.platform;

  if (def.sliceFromStart && startPlat && endPlat) {
    const awayPlat = def.awayFromName
      ? matched.find((m) => m.name === def.awayFromName)?.platform
      || platforms.find((p) => normalizeKey(p.name) === normalizeKey(def.awayFromName))
      : null;
    sliceMeta = slicePathFromStart(pathPoints, startPlat, endPlat, awayPlat);
    pathPoints = sliceMeta.pathPoints;
    if (awayPlat && sliceMeta.si <= nearestIndex(pathBuild.pathPoints, awayPlat).index) {
      throw new Error(`${key} slice still toward ${def.awayFromName}`);
    }
  } else if (def.sliceToName) {
    const endSlicePlat = matched.find((m) => m.name === def.sliceToName)?.platform;
    if (!startPlat || !endSlicePlat) throw new Error(`${key} slice platforms missing`);
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endSlicePlat);
    pathPoints = sliceMeta.pathPoints;
    if (haversine(pathPoints[0], startPlat) > haversine(pathPoints[pathPoints.length - 1], startPlat)) {
      throw new Error(`${key} slice orientation invalid`);
    }
  } else if (startPlat && endPlat) {
    sliceMeta = slicePathToEnd(pathPoints, startPlat, endPlat);
    pathPoints = sliceMeta.pathPoints;
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
    verifyPrefixOf: def.verifyPrefixOf || null,
  };
}

function main() {
  const cache = {};
  const platformsBank = {};
  const pathBank = {};
  const summary = { generatedAt: new Date().toISOString(), systems: {}, prefixChecks: {}, blockers: [] };

  const buildOrder = ['9-maihama', '9-rosetown', '9-urayasu', '9-tokai', '9-maihama-tokai', '9-urayasu-rosetown'];
  for (const key of buildOrder) {
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
    };
    if (sys.maxPlatformDist_m > 20) {
      summary.blockers.push(`${key}: maxPlatformDist ${sys.maxPlatformDist_m}m > 20m`);
    }
    if (sys.maxGap_m > 30) {
      summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m > 30m`);
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
      'missing',
      sys.missingPlatforms.length,
    );
  }

  const rosetownPrefix = verifyPrefixPlatforms('9-rosetown', '9-maihama', platformsBank);
  summary.prefixChecks['9-rosetown-vs-9-maihama'] = rosetownPrefix;
  if (rosetownPrefix.length) {
    summary.blockers.push(`9-rosetown prefix platform mismatch: ${JSON.stringify(rosetownPrefix)}`);
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  fs.writeFileSync(
    path.join(ROOT, 'maihama-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for 舞浜線 (route-9).\n// Official stop order: Keisei Bus Navi 2026-07-25.\n// 京成ローズタウン始発は OSM node 6778604861（到着 node 6778604860 と区別）。\n// Generated: 2026-07-25-maihama-line-v1\n(() => {\n  window.MAIHAMA_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'maihama-line-path-v1.js'),
    `// Auto-generated OSM road path geometry for 舞浜線 (route-9).\n// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n// Short trips use verified prefixes / departure platforms ending at Navi terminus.\n// Generated: 2026-07-25-maihama-line-v1\n(() => {\n  window.MAIHAMA_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );

  fs.writeFileSync(
    path.join(OUT, 'rosetown-departure-platform-note.md'),
    `# 京成ローズタウン 発車 platform（9-urayasu-rosetown）

## 問題

OSM relation \`3498220\`（舞浜駅⇒浦安駅入口）は \`platform\` に到着用 node \`6778604860\`（35.6420322, 139.8819328）を載せている。

relation \`18320323\`（浦安駅入口⇒舞浜駅）の 9-rosetown 終点は node \`6778604861\`（35.6414511, 139.8812333）で、到着 node 6778604860 から約 70m 離れる。

## 採用

OSM node \`6778604861\`

- 9-rosetown 終点 platform と同一
- 京成バスナビ busstop 00020678 始発・浦安駅入口行き
- path 始点（startHint 反転後）まで原則 20m 以内

## path 向き

relation 3498220 を 6778604861 hint で反転連結し、舞浜駅（9482601637）より後方から 浦安駅入口 方面へ slice。舞浜方面へ戻らない。
`,
  );

  console.log('wrote maihama-line-platforms-v1.js and maihama-line-path-v1.js');
  if (summary.blockers.length) {
    console.warn('BLOCKERS:', summary.blockers);
  }
}

main();
