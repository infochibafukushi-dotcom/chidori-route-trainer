'use strict';
/**
 * Build platforms + pathPoints for route-12 舞浜リゾート線 from OSM relations.
 * Official stop order: official-stop-orders.json (NOT array reverse for inbound).
 * Hotel SOUTH/NORTH: assign by outbound path order (OSM hotel names outdated).
 * Bayside: external Overpass nodes; allow 20-30m with platformDistException.
 * Skip TDL as stop. Forbidden relations: 9983006, 18323875.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BAYSIDE_CANDIDATES = JSON.parse(
  fs.readFileSync(path.join(OUT, '_bayside_station_candidates.json'), 'utf8'),
).candidates;

const FORBIDDEN_RELATIONS = new Set([9983006, 18323875]);
const SKIP_STOP_NAME_RE = /東京ディズニーランド|ディズニーランド/;
const HOTEL_OSM_RE = /シェラトン|ヒルトン|東京ベイ舞浜ホテル|グランドニッコー|ホテルオークラ/;
const OFFICIAL_SOUTH = 'リゾートホテルエリア・サウス';
const OFFICIAL_NORTH = 'リゾートホテルエリア・ノース';
const PLATFORM_DIST_HARD_MAX = 30;
const PLATFORM_DIST_SOFT_MAX = 20;

function loadRelation(id) {
  if (FORBIDDEN_RELATIONS.has(id)) throw new Error(`FORBIDDEN route-4 relation ${id}`);
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

function buildPathFromWays(rel, nodes, ways, startHint = null) {
  const MAX_JOIN_M = 1;
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
      if (!shared && join > MAX_JOIN_M) {
        throw new Error(
          `way join gap ${join.toFixed(3)}m > ${MAX_JOIN_M}m between ${prevWayId} and ${m.ref}`,
        );
      }
      usedWays.push({
        wayId: m.ref,
        role: m.role,
        gapFromPrev_m: Math.round(join * 1000) / 1000,
        flipped,
        sharedNode: shared,
        verifiedJoin: false,
      });
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
    for (const c of toAdd) pathPts.push({ lat: c.lat, lng: c.lng });
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

function findPlatformByName(platforms, name) {
  const nk = normalizeKey(name);
  for (const p of platforms) {
    const pk = normalizeKey(p.name);
    if (pk === nk || pk.includes(nk) || nk.includes(pk)) return p;
  }
  return null;
}

function isTdl(p) {
  return SKIP_STOP_NAME_RE.test(p.name);
}

function isHotelOsm(p) {
  return HOTEL_OSM_RE.test(p.name) && !isTdl(p);
}

/**
 * Derive OSM-name-family -> official SOUTH/NORTH from outbound path order.
 * Path+official order wins over outdated alias table (Hilton=SOUTH etc).
 */
function deriveHotelNameMapping(outboundPlatforms, outboundPath) {
  const tds =
    findPlatformByName(outboundPlatforms, '東京ディズニーシー')
    || findPlatformByName(outboundPlatforms, 'ディズニーシー');
  if (!tds) throw new Error('outbound TDS platform missing');
  const tdsIdx = nearestIndex(outboundPath, tds).index;
  const hotels = outboundPlatforms
    .filter(isHotelOsm)
    .map((p) => {
      const ni = nearestIndex(outboundPath, p);
      return { ...p, pathIndex: ni.index, pathDist: ni.dist };
    })
    .filter((p) => p.pathIndex > tdsIdx)
    .sort((a, b) => a.pathIndex - b.pathIndex);

  const primary = hotels.filter((h) => /シェラトン|ヒルトン/.test(h.name));
  const extras = hotels.filter((h) => /東京ベイ舞浜ホテル/.test(h.name));
  if (primary.length < 2) {
    throw new Error(`need at least 2 sheraton/hilton hotel platforms after TDS, got ${primary.length}`);
  }

  const first = primary[0];
  const second = primary[1];
  const byOsmNamePrefix = {};
  const assignFamily = (osmPlat, official) => {
    if (/シェラトン|オークラ/.test(osmPlat.name)) byOsmNamePrefix.sheraton = official;
    if (/ヒルトン|ニッコー|ニツコウ/.test(osmPlat.name)) byOsmNamePrefix.hilton = official;
  };
  assignFamily(first, OFFICIAL_SOUTH);
  assignFamily(second, OFFICIAL_NORTH);

  const rows = [];
  for (const h of primary) {
    let official = null;
    if (/シェラトン|オークラ/.test(h.name)) official = byOsmNamePrefix.sheraton;
    if (/ヒルトン|ニッコー|ニツコウ/.test(h.name)) official = byOsmNamePrefix.hilton;
    rows.push({
      osmName: h.name,
      platformId: h.platformId,
      lat: h.lat,
      lng: h.lng,
      pathIndex: h.pathIndex,
      pathDist_m: Math.round(h.pathDist * 10) / 10,
      assignedOfficialName: official,
      reason:
        'outbound path order after TDS: first sheraton/hilton → サウス, second → ノース '
        + '(OSM hotel names outdated; path+official order wins over alias Hilton→サウス)',
    });
  }
  for (const h of extras) {
    rows.push({
      osmName: h.name,
      platformId: h.platformId,
      lat: h.lat,
      lng: h.lng,
      pathIndex: h.pathIndex,
      pathDist_m: Math.round(h.pathDist * 10) / 10,
      assignedOfficialName: null,
      reason: 'skip as route-12 stop (東京ベイ舞浜ホテル not in official 21 stops); ways may still be used',
    });
  }

  return { byOsmNamePrefix, rows, primaryOrder: [first.name, second.name] };
}

function resolveOfficialFromOsmName(osmName, hotelMap) {
  if (/シェラトン|オークラ/.test(osmName)) return hotelMap.byOsmNamePrefix.sheraton;
  if (/ヒルトン|ニッコー|ニツコウ/.test(osmName)) return hotelMap.byOsmNamePrefix.hilton;
  return null;
}

function pickBayside(pathPoints) {
  let best = null;
  for (const c of BAYSIDE_CANDIDATES) {
    const ni = nearestIndex(pathPoints, { lat: c.lat, lng: c.lon });
    const dist = Math.round(ni.dist * 10) / 10;
    if (!best || dist < best.dist) {
      best = {
        lat: c.lat,
        lng: c.lon,
        platformId: c.id,
        osmName: c.name,
        role: 'platform-external',
        local_ref: c.local_ref,
        network: c.tags?.network || null,
        dist,
        pathIndex: ni.index,
      };
    }
  }
  return best;
}

function matchPlatforms(platforms, names, pathPoints, hotelMap) {
  const used = new Set();
  const matched = [];

  for (const name of names) {
    const nk = normalizeKey(name);

    if (nk.includes('ベイサイド')) {
      const b = pickBayside(pathPoints);
      if (!b) {
        matched.push({ name, platform: null });
        continue;
      }
      matched.push({
        name,
        platform: {
          lat: b.lat,
          lng: b.lng,
          platformId: b.platformId,
          osmName: b.osmName,
          role: b.role,
          local_ref: b.local_ref,
          network: b.network,
          platformDistException: b.dist > PLATFORM_DIST_SOFT_MAX && b.dist <= PLATFORM_DIST_HARD_MAX,
          matchDist_m: b.dist,
        },
      });
      continue;
    }

    if (name === OFFICIAL_SOUTH || name === OFFICIAL_NORTH) {
      let bestI = -1;
      for (let i = 0; i < platforms.length; i++) {
        if (used.has(i)) continue;
        if (isTdl(platforms[i])) continue;
        if (!isHotelOsm(platforms[i])) continue;
        const assigned = resolveOfficialFromOsmName(platforms[i].name, hotelMap);
        if (assigned !== name) continue;
        bestI = i;
        break;
      }
      if (bestI < 0) {
        matched.push({ name, platform: null });
        continue;
      }
      used.add(bestI);
      const p = platforms[bestI];
      matched.push({
        name,
        platform: {
          lat: p.lat,
          lng: p.lng,
          platformId: p.platformId,
          osmName: p.name,
          role: p.role,
        },
      });
      continue;
    }

    let best = null;
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      if (isTdl(platforms[i])) continue;
      if (isHotelOsm(platforms[i])) continue;
      const pk = normalizeKey(platforms[i].name);
      if (pk === nk || pk.includes(nk) || nk.includes(pk)) {
        best = i;
        break;
      }
      if (pk.replace(/前$/, '') === nk.replace(/前$/, '')) {
        best = i;
        break;
      }
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

function collectAccessMeta(rel, ways) {
  const restricted = [];
  const permitted = [];
  const unresolved = [];
  for (const m of (rel.members || []).filter((x) => x.type === 'way')) {
    const w = ways.get(m.ref);
    if (!w) continue;
    const tags = w.tags || {};
    const access = tags.access || null;
    const bus = tags.bus || null;
    const psv = tags.psv || null;
    const vehicle = tags.vehicle || null;
    const motor = tags.motor_vehicle || null;
    const restrictedAccess =
      access === 'no'
      || access === 'private'
      || access === 'permit'
      || vehicle === 'no'
      || motor === 'no';
    if (!restrictedAccess) continue;
    const row = {
      id: w.id,
      name: tags.name || null,
      access,
      bus,
      psv,
      vehicle,
      motor_vehicle: motor,
      highway: tags.highway || null,
    };
    restricted.push(row);
    const busOk = bus === 'yes' || bus === 'designated' || psv === 'yes' || psv === 'designated';
    if (busOk) permitted.push(row);
    else unresolved.push(row);
  }
  return {
    restrictedAccessWayCount: restricted.length,
    busPermittedRestrictedWayCount: permitted.length,
    unresolvedRestrictedWayCount: unresolved.length,
    restrictedWays: restricted,
    unresolvedWays: unresolved,
  };
}

const SYSTEMS = {
  '12-maihama-via-resort': {
    relationId: 18381677,
    resolvedVersion: '2026-07-25-maihama-resort-maihama-v1',
    names: ORDERS.systems['12-maihama-via-resort'].stopNames,
    pathSource: 'osm-relation-18381677+startHint-urayasu+bayside-external',
    startHintFromStopName: '浦安駅入口',
    note: 'outbound 浦安駅入口→舞浜駅。TDS・ホテル経由。TDL非停車。route-4禁止。',
  },
  '12-urayasu-via-resort': {
    relationId: 18381676,
    resolvedVersion: '2026-07-25-maihama-resort-urayasu-v1',
    names: ORDERS.systems['12-urayasu-via-resort'].stopNames,
    pathSource: 'osm-relation-18381676+startHint-maihama+bayside-external',
    startHintFromStopName: '舞浜駅',
    note: 'inbound 舞浜駅→浦安駅入口。公式順（NORTH before SOUTH）。往路逆順禁止。',
  },
};

function buildSystem(key, def, cache, hotelMap) {
  const relId = def.relationId;
  if (FORBIDDEN_RELATIONS.has(relId)) throw new Error(`${key} forbidden relation ${relId}`);

  const loaded =
    cache[`load:${relId}`]
    || (() => {
      const L = loadRelation(relId);
      cache[`load:${relId}`] = L;
      return L;
    })();
  const allPlatforms = platformMembers(loaded.rel, loaded.nodes);
  const platforms = allPlatforms.filter((p) => !isTdl(p));

  let startHint = null;
  if (def.startHintFromStopName) {
    const p = findPlatformByName(allPlatforms, def.startHintFromStopName);
    if (!p) throw new Error(`${key} startHint stop missing: ${def.startHintFromStopName}`);
    startHint = { lat: p.lat, lng: p.lng, platformId: p.platformId };
  }

  const cacheKey = startHint
    ? `${relId}:hint-${startHint.platformId || startHint.lat}`
    : String(relId);
  if (!cache[cacheKey]) {
    cache[cacheKey] = { pathBuild: buildPathFromWays(loaded.rel, loaded.nodes, loaded.ways, startHint) };
  }
  const { pathBuild } = cache[cacheKey];
  const matched = matchPlatforms(platforms, def.names, pathBuild.pathPoints, hotelMap);
  const missing = matched.filter((m) => !m.platform).map((m) => m.name);

  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;
  const startPlat = matched.find((m) => m.name === def.names[0])?.platform;
  const endPlat = matched.find((m) => m.name === def.names[def.names.length - 1])?.platform;
  if (startPlat && endPlat) {
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
    if (m.platform.local_ref != null) platObjs[m.name].local_ref = m.platform.local_ref;
    if (m.platform.platformDistException) platObjs[m.name].platformDistException = true;
  }

  const platDists = matched
    .filter((m) => m.platform)
    .map((m) => {
      const dist = nearestDist(pathPoints, m.platform);
      return {
        name: m.name,
        dist,
        exception: dist > PLATFORM_DIST_SOFT_MAX,
      };
    });
  const maxPlatDist = Math.max(0, ...platDists.map((p) => p.dist));

  let lastIdx = -1;
  let lastPlat = null;
  const orderIssues = [];
  const orderWarnings = [];
  for (const m of matched) {
    if (!m.platform) continue;
    const ni = nearestIndex(pathPoints, m.platform);
    if (ni.index < lastIdx) {
      const pairDist = lastPlat ? haversine(lastPlat, m.platform) : Infinity;
      const idxDelta = lastIdx - ni.index;
      const tdrCluster = pairDist <= 50 || idxDelta <= 5;
      const row = { name: m.name, index: ni.index, prev: lastIdx, pairDist_m: Math.round(pairDist * 10) / 10, idxDelta };
      if (tdrCluster) orderWarnings.push({ ...row, note: 'tdr-cluster-soft-order' });
      else orderIssues.push(row);
    }
    lastIdx = Math.max(lastIdx, ni.index);
    lastPlat = m.platform;
  }

  const south = matched.find((m) => m.name === OFFICIAL_SOUTH)?.platform;
  const north = matched.find((m) => m.name === OFFICIAL_NORTH)?.platform;
  if (south && north) {
    const si = nearestIndex(pathPoints, south).index;
    const niH = nearestIndex(pathPoints, north).index;
    if (def.names.indexOf(OFFICIAL_SOUTH) < def.names.indexOf(OFFICIAL_NORTH) && si > niH) {
      orderIssues.push({ name: 'hotel-order', expected: 'SOUTH before NORTH', southIndex: si, northIndex: niH });
    }
    if (def.names.indexOf(OFFICIAL_NORTH) < def.names.indexOf(OFFICIAL_SOUTH) && niH > si) {
      orderIssues.push({ name: 'hotel-order', expected: 'NORTH before SOUTH', southIndex: si, northIndex: niH });
    }
  }

  const access = collectAccessMeta(loaded.rel, loaded.ways);

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
    orderWarnings,
    access,
  };
}

function writeHotelMappingMd(hotelMap) {
  const lines = [
    '# OSM hotel platform mapping (route-12)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Policy',
    '- OSM hotel names (シェラトン / ヒルトン / 東京ベイ舞浜ホテル) are **outdated** vs official リゾートホテルエリア・サウス／ノース.',
    '- Assignment uses **outbound path order** on relation 18381677 after TDS.',
    '- First シェラトン/ヒルトン along path → リゾートホテルエリア・サウス; second → リゾートホテルエリア・ノース.',
    '- 東京ベイ舞浜ホテル is not an official route-12 stop (skipped).',
    '- User alias table (ヒルトン→サウス, シェラトン→ノース) **conflicts** with path+official order; **path+official wins**.',
    '',
    '| OSM name | node id | lat | lng | pathIndex | assigned official | reason |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const r of hotelMap.rows) {
    lines.push(
      `| ${r.osmName} | ${r.platformId} | ${r.lat} | ${r.lng} | ${r.pathIndex} | ${r.assignedOfficialName || '(skip)'} | ${r.reason} |`,
    );
  }
  lines.push('');
  lines.push('## Family map applied to both directions');
  lines.push(`- シェラトン* / オークラ* → ${hotelMap.byOsmNamePrefix.sheraton}`);
  lines.push(`- ヒルトン* / ニッコー* → ${hotelMap.byOsmNamePrefix.hilton}`);
  lines.push('');
  fs.writeFileSync(path.join(OUT, 'osm-hotel-platform-mapping.md'), `${lines.join('\n')}\n`);
}

function main() {
  const cache = {};
  const outLoaded = loadRelation(18381677);
  const outPlatforms = platformMembers(outLoaded.rel, outLoaded.nodes);
  const outStart = findPlatformByName(outPlatforms, '浦安駅入口');
  const outPath = buildPathFromWays(outLoaded.rel, outLoaded.nodes, outLoaded.ways, {
    lat: outStart.lat,
    lng: outStart.lng,
    platformId: outStart.platformId,
  });
  cache['load:18381677'] = outLoaded;
  cache[`18381677:hint-${outStart.platformId}`] = { pathBuild: outPath };

  const hotelMap = deriveHotelNameMapping(outPlatforms, outPath.pathPoints);
  writeHotelMappingMd(hotelMap);
  fs.writeFileSync(path.join(OUT, '_hotel_platform_mapping.json'), JSON.stringify(hotelMap, null, 2));

  const platformsBank = {};
  const pathBank = {};
  const summary = {
    generatedAt: new Date().toISOString(),
    line: '舞浜リゾート線',
    routeId: 'route-12',
    systems: {},
    blockers: [],
    warnings: [],
    route4Separation: { forbiddenRelations: [...FORBIDDEN_RELATIONS] },
    hotelMapping: hotelMap.byOsmNamePrefix,
    nameNormalization: {
      '市役所入口郵便局前': '市役所入口・郵便局前',
      NTT浦安前: 'ＮＴＴ浦安前',
      '東京ディズニーシー®': '東京ディズニーシー（Ｒ）',
      stripQuotes: true,
    },
    platformDistPolicy: {
      softMax_m: PLATFORM_DIST_SOFT_MAX,
      hardMax_m: PLATFORM_DIST_HARD_MAX,
      baysideExceptionNote:
        'TDR setback: allow 20-30m with platformDistException + reviewRequired + z20 proof',
    },
  };

  for (const key of ['12-maihama-via-resort', '12-urayasu-via-resort']) {
    const def = SYSTEMS[key];
    const sys = buildSystem(key, def, cache, hotelMap);
    platformsBank[key] = sys.platforms;
    pathBank[key] = {
      relationId: sys.relationId,
      pathSource: sys.pathSource,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      pathPoints: sys.pathPoints,
    };
    const baysideDist = sys.platformDists.find((p) => /ベイサイド/.test(p.name));
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
      orderWarnings: sys.orderWarnings,
      usedWayCount: sys.usedWays.length,
      access: {
        restrictedAccessWayCount: sys.access.restrictedAccessWayCount,
        busPermittedRestrictedWayCount: sys.access.busPermittedRestrictedWayCount,
        unresolvedRestrictedWayCount: sys.access.unresolvedRestrictedWayCount,
      },
      bayside: baysideDist || null,
      reviewRequired: Boolean(
        baysideDist
        && baysideDist.dist > PLATFORM_DIST_SOFT_MAX
        && baysideDist.dist <= PLATFORM_DIST_HARD_MAX,
      ),
    };

    if (sys.missingPlatforms.length) {
      summary.blockers.push(`${key}: missing platforms ${sys.missingPlatforms.join(',')}`);
    }
    if (sys.maxPlatformDist_m > PLATFORM_DIST_HARD_MAX) {
      summary.blockers.push(`${key}: maxPlatformDist ${sys.maxPlatformDist_m}m > ${PLATFORM_DIST_HARD_MAX}m`);
    }
    for (const pd of sys.platformDists) {
      if (pd.dist > PLATFORM_DIST_HARD_MAX) {
        summary.blockers.push(`${key}: ${pd.name} dist ${pd.dist}m > ${PLATFORM_DIST_HARD_MAX}m`);
      } else if (pd.dist > PLATFORM_DIST_SOFT_MAX) {
        summary.warnings.push(`${key}: ${pd.name} dist ${pd.dist}m platformDistException (TDR setback)`);
      }
    }
    if (sys.maxGap_m > 30) summary.blockers.push(`${key}: maxGap ${sys.maxGap_m}m > 30m`);
    if (sys.maxJoin_m > 1) summary.blockers.push(`${key}: maxJoin ${sys.maxJoin_m}m > 1m`);
    if (sys.orderIssues.length) {
      summary.blockers.push(`${key}: platform order issues ${JSON.stringify(sys.orderIssues)}`);
    }
    if (sys.orderWarnings.length) {
      summary.warnings.push(`${key}: soft order ${JSON.stringify(sys.orderWarnings)}`);
    }
    if (sys.access.unresolvedRestrictedWayCount > 0) {
      summary.blockers.push(`${key}: unresolvedRestrictedWayCount ${sys.access.unresolvedRestrictedWayCount}`);
    }
    for (const n of Object.keys(sys.platforms)) {
      if (/ディズニーランド/.test(n) || /ディズニーランド/.test(sys.platforms[n].osmName || '')) {
        summary.blockers.push(`${key}: TDL leaked into platforms bank: ${n}`);
      }
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
      'unresolvedAccess',
      sys.access.unresolvedRestrictedWayCount,
      'hash',
      sys.pathHash.slice(0, 12),
    );
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  fs.writeFileSync(
    path.join(ROOT, 'maihama-resort-line-platforms-v1.js'),
    `// Auto-generated OSM platforms for 舞浜リゾート線 (route-12).\n`
      + `// Official stop order: Keisei Bus Navi 2026-07-25. Hotel SOUTH/NORTH by outbound path order.\n`
      + `// TDL is never a route-12 stop. Bayside from Overpass external nodes.\n`
      + `// Generated: 2026-07-25-maihama-resort-v1\n`
      + `(() => {\n  window.MAIHAMA_RESORT_LINE_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};\n})();\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'maihama-resort-line-path-v1.js'),
    `// Auto-generated OSM road path geometry for 舞浜リゾート線 (route-12).\n`
      + `// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.\n`
      + `// densify applies only within a single OSM way; way joins require shared node or ≤1m.\n`
      + `// NEVER reverse outbound for inbound — use relation 18381676. Forbidden: 9983006/18323875.\n`
      + `// Generated: 2026-07-25-maihama-resort-v1\n`
      + `(() => {\n  window.MAIHAMA_RESORT_LINE_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};\n})();\n`,
  );

  if (summary.blockers.length) {
    console.error('BLOCKERS', summary.blockers);
    process.exit(1);
  }
  console.log('warnings', summary.warnings);
  console.log('wrote maihama-resort-line-platforms-v1.js and maihama-resort-line-path-v1.js');
}

main();
