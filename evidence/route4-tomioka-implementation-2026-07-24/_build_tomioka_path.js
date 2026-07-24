'use strict';
/**
 * Build platforms + pathPoints for route-4 from OSM relation JSON files.
 * Official stop order: Keisei Navi outbound confirmed; inbound from OSM reverse relations
 * (must be cross-checked before commit).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');

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

/** Connect way members in order, flipping when needed to keep continuity. */
function buildPathFromWays(rel, nodes, ways) {
  const wayMembers = (rel.members || []).filter((m) => m.type === 'way');
  const path = [];
  const usedWays = [];
  let cursor = null;

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
      if (join > 80) {
        // large gap — still append but record
        usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: Math.round(join * 10) / 10, flipped: useRev });
      } else {
        usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: Math.round(join * 10) / 10, flipped: useRev });
      }
      // skip duplicate join node
      if (haversine(cursor, coords[0]) < 1) coords = coords.slice(1);
    } else {
      usedWays.push({ wayId: m.ref, role: m.role, gapFromPrev_m: 0, flipped: false });
    }
    for (const c of coords) {
      path.push({ lat: c.lat, lng: c.lng });
      cursor = c;
    }
  }
  return { pathPoints: densify(path, 25), usedWays, rawCount: path.length };
}

function displayName(osmName) {
  if (!osmName) return osmName;
  // Prefer Navi-style official display where known
  const map = {
    '市役所入口郵便局前': '市役所入口・郵便局前',
    'NTT浦安前': 'ＮＴＴ浦安前',
    '東京ディズニーランド®': '「東京ディズニーランド（Ｒ）」',
  };
  return map[osmName] || osmName;
}

function normalizeKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』®ＲR]/g, '')
    .replace(/入口郵便局前/g, '市役所入口郵便局前');
}

function sha256(points) {
  const payload = points.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(';');
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

function slicePathNearStops(fullPath, startPlat, endPlat) {
  // Find nearest indices to start/end platforms and slice
  let si = 0;
  let ei = fullPath.length - 1;
  let sd = Infinity;
  let ed = Infinity;
  for (let i = 0; i < fullPath.length; i++) {
    const ds = haversine(fullPath[i], startPlat);
    const de = haversine(fullPath[i], endPlat);
    if (ds < sd) {
      sd = ds;
      si = i;
    }
    if (de < ed) {
      ed = de;
      ei = i;
    }
  }
  if (si > ei) [si, ei] = [ei, si];
  return {
    pathPoints: fullPath.slice(si, ei + 1),
    startDist: Math.round(sd * 10) / 10,
    endDist: Math.round(ed * 10) / 10,
    si,
    ei,
  };
}

// Official Navi outbound names (confirmed)
const NAVI_TDL = [
  '浦安駅入口', 'フラワー通り', '堀江三丁目', '南小入口', '堀江東', '市役所入口・郵便局前',
  'ＮＴＴ浦安前', '日生研修センター', '順天堂病院前', 'サンコーポ東口', 'サンコーポ西口',
  '弁天第二', '見明川中学校前', '見明川住宅', '舞浜三丁目', '運動公園', 'オリエンタルランド本社前',
  '舞浜駅', '「東京ディズニーランド（Ｒ）」',
];
const NAVI_MAIHAMA = NAVI_TDL.slice(0, 18);
const NAVI_CHIDORI = [
  '浦安駅入口', 'フラワー通り', '堀江三丁目', '南小入口', '堀江東', '市役所入口・郵便局前',
  'ＮＴＴ浦安前', '日生研修センター', '順天堂病院前', 'サンコーポ東口', 'サンコーポ西口',
  '弁天第二', '見明川中学校前', '見明川住宅', '舞浜三丁目', '運動公園', '千鳥車庫',
];

function matchPlatformsToNames(platforms, names) {
  const used = new Set();
  const matched = [];
  for (const name of names) {
    const nk = normalizeKey(name);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < platforms.length; i++) {
      if (used.has(i)) continue;
      const pk = normalizeKey(platforms[i].name);
      if (pk === nk || pk.includes(nk) || nk.includes(pk)) {
        best = i;
        bestScore = 0;
        break;
      }
      // fuzzy: strip more
      if (pk.replace(/前$/,'') === nk.replace(/前$/,'')) {
        best = i;
        bestScore = 1;
      }
    }
    if (best == null) {
      matched.push({ name, error: 'no platform match', platform: null });
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

function buildSystem(key, def) {
  const { rel, nodes, ways } = loadRelation(def.relationId);
  const platforms = platformMembers(rel, nodes);
  const matched = matchPlatformsToNames(platforms, def.names);
  const missing = matched.filter((m) => !m.platform);
  if (missing.length) {
    console.warn(key, 'missing platforms', missing.map((m) => m.name));
  }

  let pathBuild = buildPathFromWays(rel, nodes, ways);
  let pathPoints = pathBuild.pathPoints;
  let sliceMeta = null;

  if (def.sliceToName || def.sliceFromName) {
    const startName = def.sliceFromName || def.names[0];
    const endName = def.sliceToName || def.names[def.names.length - 1];
    const startPlat = matched.find((m) => m.name === startName)?.platform;
    const endPlat = matched.find((m) => m.name === endName)?.platform;
    if (!startPlat || !endPlat) throw new Error(`${key} slice platforms missing`);
    sliceMeta = slicePathNearStops(pathPoints, startPlat, endPlat);
    // Ensure slice direction follows name order: start should be near first point
    const dStartFirst = haversine(sliceMeta.pathPoints[0], startPlat);
    const dStartLast = haversine(sliceMeta.pathPoints[sliceMeta.pathPoints.length - 1], startPlat);
    if (dStartLast < dStartFirst) {
      sliceMeta.pathPoints = sliceMeta.pathPoints.slice().reverse();
    }
    pathPoints = sliceMeta.pathPoints;
  }

  const platObjs = {};
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {
      lat: m.platform.lat,
      lng: m.platform.lng,
      platformId: m.platform.platformId,
    };
  }

  const platDists = matched
    .filter((m) => m.platform)
    .map((m) => ({ name: m.name, dist: nearestDist(pathPoints, m.platform) }));
  const maxPlatDist = Math.max(...platDists.map((p) => p.dist), 0);

  return {
    key,
    relationId: def.relationId,
    names: def.names,
    platforms: platObjs,
    pathPoints,
    pathHash: sha256(pathPoints),
    resolvedVersion: def.resolvedVersion,
    pathSource: def.pathSource,
    meta: {
      pointCount: pathPoints.length,
      maxGap_m: maxGap(pathPoints),
      maxPlatformDist_m: maxPlatDist,
      platformDists: platDists,
      usedWays: pathBuild.usedWays,
      sliceMeta,
      missingPlatforms: missing.map((m) => m.name),
    },
  };
}

const SYSTEMS = {
  '4-tdl': {
    relationId: 9983006,
    names: NAVI_TDL,
    resolvedVersion: '2026-07-24-tomioka-tdl-v1',
    pathSource: 'osm-relation-9983006',
  },
  '4-maihama': {
    relationId: 9983006,
    names: NAVI_MAIHAMA,
    resolvedVersion: '2026-07-24-tomioka-maihama-v1',
    pathSource: 'osm-relation-9983006 sliced to 舞浜駅 platform (Navi short-turn confirmed; same corridor as 4-tdl through 舞浜駅)',
    sliceToName: '舞浜駅',
  },
  '4-chidori': {
    relationId: 18417665,
    names: NAVI_CHIDORI,
    resolvedVersion: '2026-07-24-tomioka-chidori-v1',
    pathSource: 'osm-relation-18417665',
  },
  '4-urayasu-tdl': {
    relationId: 18323875,
    names: [...NAVI_TDL].reverse().map((n) => n),
    resolvedVersion: '2026-07-24-tomioka-urayasu-tdl-v1',
    pathSource: 'osm-relation-18323875 (inbound; stop order = reverse of Navi-confirmed outbound corridor; Navi trip scrape pending)',
  },
  '4-urayasu-maihama': {
    relationId: 18323875,
    names: [...NAVI_MAIHAMA].reverse(),
    resolvedVersion: '2026-07-24-tomioka-urayasu-maihama-v1',
    pathSource: 'osm-relation-18323875 from 舞浜駅 platform (inbound local_ref=3) to 浦安駅入口; Navi trip scrape pending',
    sliceFromName: '舞浜駅',
  },
  '4-urayasu-chidori': {
    relationId: 18417664,
    names: [...NAVI_CHIDORI].reverse(),
    resolvedVersion: '2026-07-24-tomioka-urayasu-chidori-v1',
    pathSource: 'osm-relation-18417664',
  },
};

function main() {
  const built = {};
  const platformsBank = {};
  const pathBank = {};
  const summary = { generatedAt: new Date().toISOString(), systems: {} };

  for (const [key, def] of Object.entries(SYSTEMS)) {
    console.log('build', key);
    const sys = buildSystem(key, def);
    built[key] = sys;
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
      pathPoints: sys.meta.pointCount,
      maxGap_m: sys.meta.maxGap_m,
      maxPlatformDist_m: sys.meta.maxPlatformDist_m,
      pathHash: sys.pathHash,
      resolvedVersion: sys.resolvedVersion,
      missingPlatforms: sys.meta.missingPlatforms,
      platformDists: sys.meta.platformDists,
    };
    console.log(
      key,
      'pts',
      sys.meta.pointCount,
      'maxGap',
      sys.meta.maxGap_m,
      'maxPlat',
      sys.meta.maxPlatformDist_m,
      'missing',
      sys.meta.missingPlatforms.length
    );
  }

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify(platformsBank, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify(pathBank, null, 2));

  // Write JS modules to repo root
  const platJs = `// Auto-generated OSM platforms for 富岡線 (route-4).
// Stop order: Keisei Bus Navi confirmed for outbound; inbound from OSM reverse relations (cross-check).
// Generated: 2026-07-24-tomioka-v1
(() => {
  window.TOMIOKA_PLATFORMS_V1 = ${JSON.stringify(platformsBank, null, 2)};
})();
`;
  const pathJs = `// Auto-generated OSM road path geometry for 富岡線 (route-4).
// Paths follow OSM route relation way members (direction-corrected). Google Directions not used.
// Generated: 2026-07-24-tomioka-v1
(() => {
  window.TOMIOKA_PATH_V1 = ${JSON.stringify(pathBank, null, 2)};
})();
`;
  fs.writeFileSync(path.join(ROOT, 'tomioka-platforms-v1.js'), platJs);
  fs.writeFileSync(path.join(ROOT, 'tomioka-path-v1.js'), pathJs);
  console.log('wrote tomioka-platforms-v1.js / tomioka-path-v1.js');
}

main();
