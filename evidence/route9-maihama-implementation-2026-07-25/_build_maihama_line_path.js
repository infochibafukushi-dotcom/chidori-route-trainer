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

function densifyWithinWay(coords, maxGap = 25) {
  if (coords.length < 2) return coords.map((c) => ({ lat: c.lat, lng: c.lng, nodeId: c.nodeId, wayId: c.wayId }));
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

/**
 * Build path from relation ways.
 * - densify only within a single OSM way
 * - way joins require shared node or gap ≤ 1m (unless verifiedJoins provided)
 */
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

    // Densify on the full oriented way first, then drop the shared first node.
    // Slicing before densify left the first OSM edge (often >30m) undensified.
    const densified = densifyWithinWay(coords, 25);
    const skipFirst = Boolean(cursor) && (haversine(cursor, densified[0]) < 1
      || (cursor.nodeId != null && densified[0].nodeId != null && cursor.nodeId === densified[0].nodeId));
    const toAdd = skipFirst ? densified.slice(1) : densified;
    for (const c of toAdd) {
      pathPts.push({ lat: c.lat, lng: c.lng });
    }
    // Cursor must stay on the last real OSM node for subsequent join checks
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
    resolvedVersion: '2026-07-25-maihama-line-maihama-v2',
    names: ORDERS.systems['9-maihama'].stopNames,
    pathSource: 'osm-relation-18320323+startHint-urayasu-E',
    startHintFromStopName: '浦安駅入口',
    note: '先頭way 1337138023は浦安駅入口E(local_ref)側から反転。60193618とnode 747616973で共有接続。',
  },
  '9-rosetown': {
    relationId: 18320323,
    resolvedVersion: '2026-07-25-maihama-line-rosetown-v2',
    names: ORDERS.systems['9-rosetown'].stopNames,
    pathSource: 'osm-relation-18320323-prefix-to-rosetown+startHint-urayasu-E',
    sliceToName: '京成ローズタウン',
    shortTurn: true,
    verifyPrefixOf: '9-maihama',
    startHintFromStopName: '浦安駅入口',
    note: '9-maihamaと同一way鎖・同一接続。京成ローズタウンで営業終了。',
  },
  '9-urayasu': {
    relationId: 3498220,
    resolvedVersion: '2026-07-25-maihama-line-urayasu-v1',
    names: ORDERS.systems['9-urayasu'].stopNames,
    pathSource: 'osm-relation-3498220',
    skipRebuild: true,
  },
  '9-tokai': {
    relationId: 18419884,
    resolvedVersion: '2026-07-25-maihama-line-tokai-v1',
    names: ORDERS.systems['9-tokai'].stopNames,
    pathSource: 'osm-relation-18419884-prefix-to-tokai-entrance',
    sliceToName: '東海大浦安高校入口',
    note: '終点は東海大浦安高校入口（高校前ではない）。',
    skipRebuild: true,
  },
  '9-maihama-tokai': {
    relationId: 18419885,
    resolvedVersion: '2026-07-25-maihama-line-maihama-tokai-v1',
    names: ORDERS.systems['9-maihama-tokai'].stopNames,
    pathSource: 'osm-relation-18419885',
    skipRebuild: true,
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
    skipRebuild: true,
  },
};

function findPlatformByName(platforms, name) {
  const nk = normalizeKey(name);
  for (const p of platforms) {
    const pk = normalizeKey(p.name);
    if (pk === nk || pk.includes(nk) || nk.includes(pk)) return p;
  }
  return null;
}

function buildSystem(key, def, cache) {
  const relId = def.relationId;
  const loaded = cache[`load:${relId}`] || (() => {
    const L = loadRelation(relId);
    cache[`load:${relId}`] = L;
    return L;
  })();
  const platforms = platformMembers(loaded.rel, loaded.nodes);

  let startHint = null;
  if (def.startHintFromOverride && def.platformOverrides?.[def.startHintFromOverride]) {
    startHint = def.platformOverrides[def.startHintFromOverride];
  } else if (def.startHintFromStopName) {
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
    usedWaysSample: pathBuild.usedWays.slice(0, 8),
    maxJoin_m: pathBuild.maxJoin_m,
    verifyPrefixOf: def.verifyPrefixOf || null,
  };
}

function loadExistingBank(relJsPath, globalName) {
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', fs.readFileSync(path.join(ROOT, relJsPath), 'utf8'))(sandbox.window);
  return sandbox.window[globalName];
}

function main() {
  const cache = {};
  const prevPlatforms = loadExistingBank('maihama-line-platforms-v1.js', 'MAIHAMA_LINE_PLATFORMS_V1');
  const prevPaths = loadExistingBank('maihama-line-path-v1.js', 'MAIHAMA_LINE_PATH_V1');
  const platformsBank = { ...prevPlatforms };
  const pathBank = { ...prevPaths };
  const summary = {
    generatedAt: new Date().toISOString(),
    rebuildOnly: ['9-maihama', '9-rosetown'],
    preserved: ['9-urayasu', '9-tokai', '9-maihama-tokai', '9-urayasu-rosetown'],
    systems: {},
    prefixChecks: {},
    blockers: [],
    gapFix: {
      relationId: 18320323,
      cause: 'First way 1337138023 was traversed tip-outward without startHint; join to 60193618 used node 747616973 24.8m away (false gap). Correct travel: platform E → node 12367548447 → 747616973 (shared) → 60193618.',
      fix: 'startHintFromStopName=浦安駅入口 orients way 1337138023 reversed; shared node join gap=0.',
    },
  };

  // Preserve previous summary metrics for skipped systems if present
  let prevSummary = {};
  try {
    prevSummary = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8')).systems || {};
  } catch (e) { /* ignore */ }

  const buildOrder = ['9-maihama', '9-rosetown', '9-urayasu', '9-tokai', '9-maihama-tokai', '9-urayasu-rosetown'];
  for (const key of buildOrder) {
    const def = SYSTEMS[key];
    if (def.skipRebuild) {
      summary.systems[key] = {
        ...(prevSummary[key] || {}),
        preserved: true,
        pathHash: pathBank[key]?.pathHash,
        resolvedVersion: pathBank[key]?.resolvedVersion || def.resolvedVersion,
        pathPoints: pathBank[key]?.pathPoints?.length,
      };
      console.log(key, 'PRESERVED', 'pts', pathBank[key]?.pathPoints?.length, 'hash', String(pathBank[key]?.pathHash).slice(0, 12));
      continue;
    }

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
      rebuilt: true,
    };
    if (sys.maxPlatformDist_m > 20) {
      summary.blockers.push(`${key}: maxPlatformDist ${sys.maxPlatformDist_m}m > 20m`);
    }
    if (sys.maxGap_m > 30) {
      summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m > 30m`);
    }
    if (sys.maxJoin_m > 1) {
      summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m > 1m`);
    }
    console.log(
      key,
      'REBUILT',
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

  const rosetownPrefix = verifyPrefixPlatforms('9-rosetown', '9-maihama', platformsBank);
  summary.prefixChecks['9-rosetown-vs-9-maihama'] = rosetownPrefix;
  if (rosetownPrefix.length) {
    summary.blockers.push(`9-rosetown prefix platform mismatch: ${JSON.stringify(rosetownPrefix)}`);
  }

  // Preserve hashes of untouched systems
  for (const key of summary.preserved) {
    if (pathBank[key]?.pathHash !== prevPaths[key]?.pathHash) {
      summary.blockers.push(`${key} pathHash changed unexpectedly`);
    }
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  fs.writeFileSync(
    path.join(ROOT, 'maihama-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for 舞浜線 (route-9).\n// Official stop order: Keisei Bus Navi 2026-07-25.\n// 京成ローズタウン始発は OSM node 6778604861（到着 node 6778604860 と区別）。\n// 9-maihama/9-rosetown v2: 浦安駅入口E startHint で way 連続接続。\n// Generated: 2026-07-25-maihama-line-v2\n(() => {\n  window.MAIHAMA_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'maihama-line-path-v1.js'),
    `// Auto-generated OSM road path geometry for 舞浜線 (route-9).\n// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n// densify applies only within a single OSM way; way joins require shared node or ≤1m.\n// 9-maihama/9-rosetown v2: startHint 浦安駅入口 orients spur way 1337138023 → shared node 747616973.\n// Generated: 2026-07-25-maihama-line-v2\n(() => {\n  window.MAIHAMA_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );

  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('wrote maihama-line-platforms-v1.js and maihama-line-path-v1.js');
}

main();
