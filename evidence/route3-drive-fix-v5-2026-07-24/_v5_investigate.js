'use strict';
/**
 * Route-3 v5 OSM road-structure investigation (read-only).
 * Does NOT modify app path files.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const OUT = 'evidence/route3-drive-fix-v5-2026-07-24';
fs.mkdirSync(OUT, { recursive: true });

function loadWindowModule(rel) {
  const raw = fs.readFileSync(rel, 'utf8');
  const sandbox = { window: {} };
  new Function('window', raw)(sandbox.window);
  return sandbox.window;
}

function haversine(a, b) {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLng = ((b.lng ?? b.lon) - (a.lng ?? a.lon)) * toR;
  const lat1 = a.lat * toR;
  const lat2 = b.lat * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestIdx(pts, plat) {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const d = haversine(pts[i], plat);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, d: bd, pt: pts[bi] };
}

function overpassQuery(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req = https.request(
      'https://overpass-api.de/api/interpreter',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'chidori-route-trainer-qa/v5 (research; local-dev)',
          Accept: '*/*',
        },
        timeout: 120000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function fetchCached(key, query) {
  const outPath = path.join(OUT, `_v5_overpass_${key}.json`);
  if (fs.existsSync(outPath)) {
    console.log('cache hit', key);
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  }
  console.log('Fetching Overpass', key);
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const data = await overpassQuery(query);
      fs.writeFileSync(outPath, JSON.stringify(data));
      console.log('  saved', key, 'elements', data.elements?.length);
      return data;
    } catch (e) {
      lastErr = e;
      console.log('  retry', attempt + 1, e.message.slice(0, 160));
      await new Promise((r) => setTimeout(r, 12000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function wayGeom(el) {
  if (el.geometry) {
    return el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
  }
  return null;
}

function distPointToSegment(p, a, b) {
  // equirectangular meters around p.lat
  const toM = (lat, lng) => {
    const x = ((lng ?? 0) - p.lng) * Math.cos((p.lat * Math.PI) / 180) * 111320;
    const y = ((lat ?? 0) - p.lat) * 110540;
    return { x, y };
  };
  const P = { x: 0, y: 0 };
  const A = toM(a.lat, a.lng ?? a.lon);
  const B = toM(b.lat, b.lng ?? b.lon);
  const ABx = B.x - A.x;
  const ABy = B.y - A.y;
  const len2 = ABx * ABx + ABy * ABy;
  let t = 0;
  if (len2 > 0) {
    t = ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = A.x + t * ABx;
  const cy = A.y + t * ABy;
  return Math.hypot(cx - P.x, cy - P.y);
}

function distPointToWay(p, geom) {
  if (!geom || geom.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < geom.length - 1; i += 1) {
    const d = distPointToSegment(p, geom[i], geom[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function pickTags(t) {
  if (!t) return {};
  const keys = [
    'highway',
    'oneway',
    'bridge',
    'tunnel',
    'layer',
    'lanes',
    'name',
    'ref',
    'access',
    'bus',
    'service',
    'name:en',
    'name:ja',
  ];
  const o = {};
  for (const k of keys) if (t[k] != null) o[k] = t[k];
  return o;
}

function isElevated(tags) {
  if (!tags) return false;
  if (tags.bridge === 'yes' || tags.bridge === 'viaduct' || tags.bridge === 'aqueduct')
    return true;
  const layer = Number(tags.layer);
  return Number.isFinite(layer) && layer > 0;
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon ?? poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lon ?? poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isGreenTag(t) {
  return (
    ['grass', 'forest', 'meadow', 'grassland'].includes(t.landuse) ||
    ['park', 'garden', 'nature_reserve'].includes(t.leisure) ||
    t.natural === 'grassland' ||
    t.natural === 'wood' ||
    t.natural === 'scrub'
  );
}

function nearestWay(p, ways, maxDist = 80) {
  let best = null;
  let bestD = Infinity;
  for (const w of ways) {
    const geom = w._geom;
    if (!geom) continue;
    const d = distPointToWay(p, geom);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  if (!best || bestD > maxDist) return { way: null, dist: bestD };
  return { way: best, dist: bestD };
}

function waySequenceAlongPath(pts, ways) {
  const seq = [];
  let prevId = null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const mid = {
      lat: (pts[i].lat + pts[i + 1].lat) / 2,
      lng: (pts[i].lng + pts[i + 1].lng) / 2,
    };
    const { way, dist } = nearestWay(mid, ways);
    const id = way ? way.id : null;
    const join =
      i === 0
        ? null
        : haversine(pts[i], pts[i - 1] ? pts[i] : pts[i]);
    // join distance = gap between consecutive segment midpoints' matched ways endpoints approx
    // use distance between this midpoint and previous midpoint when way changes
    const entry = {
      segIdx: i,
      from: pts[i],
      to: pts[i + 1],
      midpoint: mid,
      nearestWayId: id,
      distToWay_m: way ? +dist.toFixed(3) : null,
      tags: way ? pickTags(way.tags) : null,
      elevated: way ? isElevated(way.tags) : null,
    };
    if (id !== prevId) {
      seq.push({
        wayId: id,
        tags: entry.tags,
        elevated: entry.elevated,
        firstSegIdx: i,
        lastSegIdx: i,
        sampleMidpoint: mid,
        maxDistToWay_m: entry.distToWay_m,
        minDistToWay_m: entry.distToWay_m,
        joinDistanceFromPrevWay_m:
          prevId == null
            ? 0
            : +haversine(
                seq[seq.length - 1].sampleMidpoint,
                mid
              ).toFixed(3),
        segmentMidpoints: [entry],
      });
      prevId = id;
    } else {
      const cur = seq[seq.length - 1];
      cur.lastSegIdx = i;
      cur.maxDistToWay_m = Math.max(cur.maxDistToWay_m ?? 0, entry.distToWay_m ?? 0);
      cur.minDistToWay_m = Math.min(cur.minDistToWay_m ?? 999, entry.distToWay_m ?? 999);
      cur.segmentMidpoints.push(entry);
    }
  }
  // compact: drop full midpoint lists from top-level sequence for readability but keep summary
  return seq.map((s) => ({
    wayId: s.wayId,
    tags: s.tags,
    elevated: s.elevated,
    firstSegIdx: s.firstSegIdx,
    lastSegIdx: s.lastSegIdx,
    sampleMidpoint: s.sampleMidpoint,
    minDistToWay_m: s.minDistToWay_m,
    maxDistToWay_m: s.maxDistToWay_m,
    joinDistanceFromPrevWay_m: s.joinDistanceFromPrevWay_m,
    midpointCount: s.segmentMidpoints.length,
  }));
}

function prepareWays(overpassData) {
  return (overpassData.elements || [])
    .filter((e) => e.type === 'way' && e.tags && e.tags.highway && e.geometry)
    .map((e) => ({
      id: e.id,
      tags: e.tags,
      _geom: wayGeom(e),
      geometry: e.geometry,
    }));
}

function prepareGreen(overpassData) {
  return (overpassData.elements || [])
    .filter(
      (e) =>
        e.type === 'way' &&
        e.tags &&
        e.geometry &&
        e.geometry.length >= 4 &&
        isGreenTag(e.tags)
    )
    .map((e) => ({ id: e.id, tags: e.tags, poly: e.geometry }));
}

function prepareBuildings(overpassData) {
  return (overpassData.elements || [])
    .filter(
      (e) =>
        e.type === 'way' &&
        e.tags &&
        e.tags.building &&
        e.geometry &&
        e.geometry.length >= 4
    )
    .map((e) => ({ id: e.id, tags: e.tags, poly: e.geometry }));
}

function segmentHitsGreen(a, b, greens) {
  const hits = [];
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  for (const g of greens) {
    const poly = g.poly;
    if (
      pointInPolygon({ lat: a.lat, lng: a.lng }, poly) ||
      pointInPolygon({ lat: b.lat, lng: b.lng }, poly) ||
      pointInPolygon(mid, poly)
    ) {
      hits.push({ wayId: g.id, tags: g.tags });
    }
  }
  return hits;
}

async function main() {
  const platWin = loadWindowModule('urayasu-higashi-danchi-platforms-v1.js');
  const pathWin = loadWindowModule('urayasu-higashi-danchi-path-v1.js');
  const P = platWin.URAYASU_HIGASHI_DANCHI_PLATFORMS_V1;
  const Path = pathWin.URAYASU_HIGASHI_DANCHI_PATH_V1;
  const sogoPts = Path['3-sogo'].pathPoints;
  const urayasuPts = Path['3-urayasu'].pathPoints;

  const kairaku = P['3-sogo']['海楽'];
  const mihama = P['3-sogo']['美浜東団地'];
  const shin = P['3-sogo']['新浦安駅'];
  const irifune = P['3-sogo']['入船中央エステート'];
  const hyatt = P['3-sogo']['ハイアットリージェンシー'];
  const akeumi5 = P['3-sogo']['明海五丁目'];

  const nk = nearestIdx(sogoPts, kairaku);
  const nm = nearestIdx(sogoPts, mihama);
  const ns = nearestIdx(sogoPts, shin);
  const ni = nearestIdx(sogoPts, irifune);
  const nh = nearestIdx(sogoPts, hyatt);
  const na = nearestIdx(sogoPts, akeumi5);

  console.log('indices', { nk: nk.i, nm: nm.i, ns: ns.i, ni: ni.i, nh: nh.i, na: na.i });

  // bbox for A: expand corridor between kairaku and mihama
  const corridorA = sogoPts.slice(Math.min(nk.i, nm.i), Math.max(nk.i, nm.i) + 1);
  const latsA = corridorA.map((p) => p.lat);
  const lngsA = corridorA.map((p) => p.lng);
  const pad = 0.0025;
  const bboxA = [
    Math.min(...latsA) - pad,
    Math.min(...lngsA) - pad,
    Math.max(...latsA) + pad,
    Math.max(...lngsA) + pad,
  ];

  const qA = `
[out:json][timeout:90];
(
  way(${bboxA[0]},${bboxA[1]},${bboxA[2]},${bboxA[3]})["highway"];
  way(${bboxA[0]},${bboxA[1]},${bboxA[2]},${bboxA[3]})["landuse"];
  way(${bboxA[0]},${bboxA[1]},${bboxA[2]},${bboxA[3]})["leisure"];
  way(${bboxA[0]},${bboxA[1]},${bboxA[2]},${bboxA[3]})["natural"];
);
out geom;
`;

  const qB = `
[out:json][timeout:90];
(
  way(35.6485,139.9120,35.6515,139.9165)["highway"];
  way(35.6485,139.9120,35.6515,139.9165)["landuse"];
  way(35.6485,139.9120,35.6515,139.9165)["leisure"];
  way(35.6485,139.9120,35.6515,139.9165)["natural"];
  way(35.6485,139.9120,35.6515,139.9165)["amenity"];
);
out geom;
`;

  const qC = `
[out:json][timeout:90];
(
  way(35.6355,139.9250,35.6405,139.9310)["highway"];
  way(35.6355,139.9250,35.6405,139.9310)["building"];
  way(35.6355,139.9250,35.6405,139.9310)["landuse"];
  way(35.6355,139.9250,35.6405,139.9310)["leisure"];
);
out geom;
`;

  const qWay238 = `
[out:json][timeout:60];
way(238904764);
out geom;
`;

  const dataA = await fetchCached('A_kairaku_mihama', qA);
  const dataB = await fetchCached('B_shinurayasu_rotary', qB);
  const dataC = await fetchCached('C_akeumi5_hyatt', qC);
  const dataW = await fetchCached('way_238904764', qWay238);

  // ========== A ==========
  const waysA = prepareWays(dataA);
  const greensA = prepareGreen(dataA);
  const midReports = [];
  for (let i = Math.min(nk.i, nm.i); i < Math.max(nk.i, nm.i); i += 1) {
    const a = sogoPts[i];
    const b = sogoPts[i + 1];
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const { way, dist } = nearestWay(mid, waysA);
    const greenHits = segmentHitsGreen(a, b, greensA);
    midReports.push({
      segIdx: i,
      from: a,
      to: b,
      midpoint: mid,
      nearestWayId: way ? way.id : null,
      distToWay_m: way ? +dist.toFixed(3) : null,
      tags: way ? pickTags(way.tags) : null,
      elevated: way ? isElevated(way.tags) : null,
      greenPolygonHits: greenHits,
    });
  }

  const seqA = waySequenceAlongPath(corridorA, waysA);

  // Symbol Road 242 candidates: ref=242 or name containing シンボル / Symbol
  const symbol242Ways = waysA.filter((w) => {
    const t = w.tags || {};
    const ref = String(t.ref || '');
    const name = String(t.name || '') + String(t['name:en'] || '');
    return (
      ref.includes('242') ||
      /シンボル|Symbol/i.test(name) ||
      /県道242|千葉県道242/.test(name)
    );
  });

  const usedWayIds = new Set(midReports.map((m) => m.nearestWayId).filter(Boolean));
  const elevatedCount = midReports.filter((m) => m.elevated).length;
  const groundGreenCuts = midReports.filter(
    (m) => !m.elevated && m.greenPolygonHits.length > 0
  );
  const onElevatedBridge = midReports.filter((m) => m.elevated);
  const farFromWay = midReports.filter((m) => m.distToWay_m != null && m.distToWay_m > 8);

  // Also check 3-urayasu inbound
  const nkU = nearestIdx(urayasuPts, P['3-urayasu']['海楽']);
  const nmU = nearestIdx(urayasuPts, P['3-urayasu']['美浜東団地']);
  const corridorAU = urayasuPts.slice(
    Math.min(nkU.i, nmU.i),
    Math.max(nkU.i, nmU.i) + 1
  );
  const midReportsU = [];
  for (let i = Math.min(nmU.i, nkU.i); i < Math.max(nmU.i, nkU.i); i += 1) {
    const a = urayasuPts[i];
    const b = urayasuPts[i + 1];
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const { way, dist } = nearestWay(mid, waysA);
    midReportsU.push({
      segIdx: i,
      midpoint: mid,
      nearestWayId: way ? way.id : null,
      distToWay_m: way ? +dist.toFixed(3) : null,
      tags: way ? pickTags(way.tags) : null,
      elevated: way ? isElevated(way.tags) : null,
      greenHits: segmentHitsGreen(a, b, greensA).length,
    });
  }

  let kairakuVerdict = 'UNCERTAIN';
  if (
    elevatedCount >= midReports.length * 0.5 &&
    groundGreenCuts.length === 0
  ) {
    kairakuVerdict = 'ELEVATED_OK';
  } else if (groundGreenCuts.length > 0 && elevatedCount < midReports.length * 0.3) {
    kairakuVerdict = 'GROUND_GREEN_CUT';
  } else if (
    groundGreenCuts.length === 0 &&
    farFromWay.length === 0 &&
    elevatedCount > 0
  ) {
    kairakuVerdict = 'ELEVATED_OK';
  } else if (groundGreenCuts.length === 0 && farFromWay.length <= 2) {
    // on road but maybe not elevated — still not green cut
    const anyElevated = elevatedCount > 0;
    kairakuVerdict = anyElevated ? 'ELEVATED_OK' : 'UNCERTAIN';
  }

  // refine: if majority midpoints on elevated ways OR ways with layer/bridge
  const pctElev = elevatedCount / Math.max(1, midReports.length);
  const pctGreenCut = groundGreenCuts.length / Math.max(1, midReports.length);
  if (pctGreenCut > 0.15 && pctElev < 0.3) kairakuVerdict = 'GROUND_GREEN_CUT';
  else if (pctElev >= 0.4 && pctGreenCut === 0) kairakuVerdict = 'ELEVATED_OK';
  else if (pctGreenCut === 0 && farFromWay.length === 0) {
    // path tracks OSM ways tightly; check if those ways are elevated over cloverleaf
    kairakuVerdict = pctElev > 0 ? 'ELEVATED_OK' : 'UNCERTAIN';
  }

  const layerTags = {
    generatedAt: new Date().toISOString(),
    area: '海楽 ↔ 美浜東団地',
    route: '3-sogo',
    platforms: {
      海楽: { ...kairaku, pathNearestIdx: nk.i, pathDist_m: +nk.d.toFixed(3), jumpOver20m: nk.d > 20 },
      美浜東団地: {
        ...mihama,
        pathNearestIdx: nm.i,
        pathDist_m: +nm.d.toFixed(3),
        jumpOver20m: nm.d > 20,
      },
    },
    pathSpan: {
      fromIdx: Math.min(nk.i, nm.i),
      toIdx: Math.max(nk.i, nm.i),
      pointCount: corridorA.length,
      bbox: bboxA,
      pathSource: Path['3-sogo'].pathSource,
      resolvedVersion: Path['3-sogo'].resolvedVersion,
    },
    overpassCache: '_v5_overpass_A_kairaku_mihama.json',
    highwayWayCount: waysA.length,
    greenPolygonCount: greensA.length,
    symbolRoad242Candidates: symbol242Ways.map((w) => ({
      wayId: w.id,
      tags: pickTags(w.tags),
      usedByCurrentPath: usedWayIds.has(w.id),
    })),
    waysUsedByCurrentPath: [...usedWayIds].map((id) => {
      const w = waysA.find((x) => x.id === id);
      return { wayId: id, tags: w ? pickTags(w.tags) : null, elevated: w ? isElevated(w.tags) : null };
    }),
    segmentMidpointNearestWays: midReports,
    stats: {
      elevatedMidpointCount: elevatedCount,
      elevatedMidpointPct: +pctElev.toFixed(3),
      groundGreenCutCount: groundGreenCuts.length,
      farFromWayOver8mCount: farFromWay.length,
      maxDistToNearestWay_m: Math.max(...midReports.map((m) => m.distToWay_m || 0)),
    },
    questions: {
      isCurrentPathOnElevatedBridgeOverCloverleafGreen:
        pctElev >= 0.4 && groundGreenCuts.length === 0
          ? 'YES_LIKELY_ELEVATED'
          : groundGreenCuts.length > 0
            ? 'NO_HITS_GROUND_GREEN'
            : pctElev > 0
              ? 'PARTIAL_ELEVATED'
              : 'NO_BRIDGE_TAGS_ON_NEAREST_WAYS',
      crossesGroundLevelGrass: groundGreenCuts.length > 0,
      platformDist_m: {
        海楽: +nk.d.toFixed(3),
        美浜東団地: +nm.d.toFixed(3),
      },
      anyJumpOver20mFromPlatform: nk.d > 20 || nm.d > 20,
    },
    inbound_3urayasu: {
      platforms: {
        海楽: { ...P['3-urayasu']['海楽'], pathNearestIdx: nkU.i, pathDist_m: +nkU.d.toFixed(3) },
        美浜東団地: {
          ...P['3-urayasu']['美浜東団地'],
          pathNearestIdx: nmU.i,
          pathDist_m: +nmU.d.toFixed(3),
        },
      },
      elevatedMidpointCount: midReportsU.filter((m) => m.elevated).length,
      greenHitSegments: midReportsU.filter((m) => m.greenHits > 0).length,
      sample: midReportsU.slice(0, 5),
    },
    verdict: kairakuVerdict,
  };

  fs.writeFileSync(
    path.join(OUT, 'kairaku-mihama-osm-layer-tags.json'),
    JSON.stringify(layerTags, null, 2)
  );
  fs.writeFileSync(
    path.join(OUT, 'kairaku-mihama-way-sequence.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        route: '3-sogo',
        span: '海楽→美浜東団地',
        fromIdx: Math.min(nk.i, nm.i),
        toIdx: Math.max(nk.i, nm.i),
        orderedWays: seqA,
        note: 'Ordered by travel along current path; joinDistanceFromPrevWay_m is geodesic between sample midpoints when way ID changes',
      },
      null,
      2
    )
  );

  // ========== B rotary ==========
  const waysB = prepareWays(dataB);
  const greensB = prepareGreen(dataB);
  // map 美浜東団地 → 新浦安駅 → 入船中央エステート
  const rotarySpan = sogoPts.slice(nm.i, ni.i + 1);
  const seqB = waySequenceAlongPath(rotarySpan, waysB);

  // Split heuristically around shin platform index
  // entry: mihama -> approach to rotary (before first service loop / before shin)
  // Find indices relative to slice
  const relShin = ns.i - nm.i;
  // Detect loop: ways that appear twice or oneway service around station
  const parts = {
    entry: { fromRel: 0, toRel: Math.max(0, relShin - 8), label: 'entry' },
    platform_connection: {
      fromRel: Math.max(0, relShin - 8),
      toRel: Math.min(rotarySpan.length - 1, relShin + 5),
      label: 'platform_connection',
    },
    loop: null,
    exit: null,
    return_to_main: null,
  };

  // Better split: classify each sequential way block
  const classified = [];
  for (const block of seqB) {
    const t = block.tags || {};
    const mid = block.sampleMidpoint;
    const dToShin = mid ? haversine(mid, shin) : 999;
    let role = 'unknown';
    if (t.highway === 'service' || t.service) {
      if (dToShin < 80) role = 'loop_or_bay';
      else role = 'service';
    } else if (dToShin < 40) role = 'platform_connection';
    else if (block.firstSegIdx < relShin - 5) role = 'entry';
    else if (block.firstSegIdx > relShin + 15) role = 'exit_or_return';
    else role = 'near_station';

    // grass island midpoint check
    const midHits = [];
    if (mid) {
      for (const g of greensB) {
        if (pointInPolygon({ lat: mid.lat, lng: mid.lng }, g.poly)) {
          midHits.push({ wayId: g.id, tags: g.tags });
        }
      }
    }
    // also check all midpoints in this block's segs
    let islandHitCount = midHits.length;
    for (let si = block.firstSegIdx; si <= block.lastSegIdx; si += 1) {
      const a = rotarySpan[si];
      const b = rotarySpan[si + 1];
      if (!a || !b) continue;
      const m = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      for (const g of greensB) {
        if (pointInPolygon(m, g.poly)) islandHitCount += 1;
      }
    }

    const geom = waysB.find((w) => w.id === block.wayId)?._geom;
    classified.push({
      ...block,
      roleHint: role,
      startCoord: geom ? geom[0] : null,
      endCoord: geom ? geom[geom.length - 1] : null,
      oneway: t.oneway || null,
      midpointsHitGrassIslands: islandHitCount > 0,
      grassIslandHitSamples: midHits,
    });
  }

  // Partition into requested parts by roleHint / index
  function collectPart(pred) {
    return classified.filter(pred).map((c) => ({
      wayId: c.wayId,
      tags: c.tags,
      oneway: c.oneway,
      startCoord: c.startCoord,
      endCoord: c.endCoord,
      firstSegIdx: c.firstSegIdx,
      lastSegIdx: c.lastSegIdx,
      sampleMidpoint: c.sampleMidpoint,
      midpointsHitGrassIslands: c.midpointsHitGrassIslands,
      minDistToWay_m: c.minDistToWay_m,
      maxDistToWay_m: c.maxDistToWay_m,
    }));
  }

  const entryWays = collectPart((c) => c.firstSegIdx < Math.max(0, relShin - 10));
  const platformWays = collectPart(
    (c) =>
      c.firstSegIdx >= Math.max(0, relShin - 10) &&
      c.lastSegIdx <= relShin + 8 &&
      (c.roleHint === 'platform_connection' ||
        c.roleHint === 'near_station' ||
        c.roleHint === 'loop_or_bay' ||
        true)
  );
  // refine platform vs loop: service oneway near station = loop
  const loopWays = collectPart(
    (c) =>
      (c.tags?.highway === 'service' || c.tags?.service) &&
      c.sampleMidpoint &&
      haversine(c.sampleMidpoint, shin) < 100 &&
      c.firstSegIdx >= relShin - 15 &&
      c.lastSegIdx <= relShin + 40
  );
  const exitWays = collectPart(
    (c) =>
      c.firstSegIdx > relShin + 8 &&
      c.firstSegIdx < rotarySpan.length * 0.75
  );
  const returnWays = collectPart((c) => c.firstSegIdx >= rotarySpan.length * 0.55);

  const anyIsland = classified.some((c) => c.midpointsHitGrassIslands);
  let rotaryVerdict = 'UNCERTAIN';
  if (!anyIsland && loopWays.length > 0) rotaryVerdict = 'SERVICE_OK';
  else if (anyIsland) rotaryVerdict = 'CUTS_ISLANDS';
  else if (!anyIsland) rotaryVerdict = 'SERVICE_OK';

  const rotaryOut = {
    generatedAt: new Date().toISOString(),
    area: '新浦安駅 rotary',
    centerQuery: { lat: 35.65, lng: 139.9138 },
    route: '3-sogo',
    pathSpan: {
      from: '美浜東団地',
      via: '新浦安駅',
      to: '入船中央エステート',
      fromIdx: nm.i,
      shinIdx: ns.i,
      toIdx: ni.i,
      platformDists_m: {
        美浜東団地: +nm.d.toFixed(3),
        新浦安駅: +ns.d.toFixed(3),
        入船中央エステート: +ni.d.toFixed(3),
      },
    },
    overpassCache: '_v5_overpass_B_shinurayasu_rotary.json',
    orderedWaySequence: classified,
    parts: {
      entry: entryWays,
      platform_connection: platformWays.filter(
        (w) => !loopWays.some((l) => l.wayId === w.wayId && l.firstSegIdx === w.firstSegIdx)
      ),
      loop: loopWays,
      exit: exitWays,
      return_to_main: returnWays,
    },
    grassIslandSummary: {
      anyMidpointHitsGrass: anyIsland,
      blocksHittingGrass: classified.filter((c) => c.midpointsHitGrassIslands).map((c) => c.wayId),
    },
    verdict: rotaryVerdict,
  };
  fs.writeFileSync(
    path.join(OUT, 'shinurayasu-rotary-way-sequence.json'),
    JSON.stringify(rotaryOut, null, 2)
  );

  // ========== C akeumi5 ==========
  const waysC = prepareWays(dataC);
  const buildingsC = prepareBuildings(dataC);
  const way238 = (dataW.elements || []).find(
    (e) => e.type === 'way' && e.id === 238904764
  );

  const hyattToAkeumi = sogoPts.slice(nh.i, na.i + 1);
  // also include a bit after platform if path continues
  const pathEnd = sogoPts[sogoPts.length - 1];
  const distPathEndToPlat = haversine(pathEnd, akeumi5);
  const distNearestToPlat = na.d;

  // alt ways from hyatt to akeumi5: highways near both platforms
  const nearHyatt = waysC
    .map((w) => ({ w, d: distPointToWay(hyatt, w._geom) }))
    .filter((x) => x.d < 60)
    .sort((a, b) => a.d - b.d)
    .slice(0, 15);
  const nearAkeumi = waysC
    .map((w) => ({ w, d: distPointToWay(akeumi5, w._geom) }))
    .filter((x) => x.d < 60)
    .sort((a, b) => a.d - b.d)
    .slice(0, 15);

  const seqC = waySequenceAlongPath(hyattToAkeumi, waysC);

  // building intersections along hyatt→akeumi5
  let buildingHits = [];
  for (let i = 0; i < hyattToAkeumi.length - 1; i += 1) {
    const a = hyattToAkeumi[i];
    const b = hyattToAkeumi[i + 1];
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    for (const bld of buildingsC) {
      if (
        pointInPolygon({ lat: a.lat, lng: a.lng }, bld.poly) ||
        pointInPolygon({ lat: b.lat, lng: b.lng }, bld.poly) ||
        pointInPolygon(mid, bld.poly)
      ) {
        buildingHits.push({
          segIdx: nh.i + i,
          buildingWayId: bld.id,
          tags: { building: bld.tags.building, name: bld.tags.name },
        });
      }
    }
  }
  // unique buildings
  const uniqBld = [...new Set(buildingHits.map((h) => h.buildingWayId))];

  // Does path follow 238904764?
  const on238 = seqC.filter((s) => s.wayId === 238904764);
  const tags238 = way238 ? pickTags(way238.tags) : null;

  // L-shape needed? If path is diagonal across blocks vs following two orthogonal ways
  // Heuristic: if nearest ways to path are tertiary and no building hits, DIAGONAL_ROAD_OK
  // if path midpoints far from any highway (>12m) or building hits, NEEDS_L_SHAPE
  const maxDistC = Math.max(...seqC.map((s) => s.maxDistToWay_m || 0), 0);
  let akeumiVerdict = 'UNCERTAIN';
  if (uniqBld.length > 0 || maxDistC > 15) akeumiVerdict = 'NEEDS_L_SHAPE';
  else if (
    tags238 &&
    (tags238.highway === 'tertiary' ||
      tags238.highway === 'residential' ||
      tags238.highway === 'unclassified' ||
      tags238.highway === 'secondary') &&
    uniqBld.length === 0
  ) {
    akeumiVerdict = 'DIAGONAL_ROAD_OK';
  } else if (uniqBld.length === 0 && maxDistC < 10) {
    akeumiVerdict = 'DIAGONAL_ROAD_OK';
  } else if (
    tags238 &&
    (tags238.highway === 'footway' ||
      tags238.highway === 'path' ||
      tags238.access === 'no' ||
      tags238.access === 'private')
  ) {
    akeumiVerdict = 'NEEDS_L_SHAPE';
  }

  const akeumiOut = {
    generatedAt: new Date().toISOString(),
    area: '明海五丁目 end',
    focusWayId: 238904764,
    way_238904764: way238
      ? {
          id: way238.id,
          tags: way238.tags,
          pickedTags: tags238,
          nodeCount: way238.nodes?.length || way238.geometry?.length,
          nodes: way238.nodes || null,
          geometry: way238.geometry || null,
          highway: tags238?.highway || null,
          access: tags238?.access || null,
          bus: tags238?.bus || null,
          oneway: tags238?.oneway || null,
          service: tags238?.service || null,
        }
      : null,
    platforms: {
      ハイアットリージェンシー: {
        ...hyatt,
        pathNearestIdx: nh.i,
        pathDist_m: +nh.d.toFixed(3),
      },
      明海五丁目: {
        ...akeumi5,
        pathNearestIdx: na.i,
        pathDist_m: +distNearestToPlat.toFixed(3),
        jumpOver20m: distNearestToPlat > 20,
      },
    },
    pathEnd: {
      point: pathEnd,
      distTo明海五丁目_m: +distPathEndToPlat.toFixed(3),
      note: 'Full 3-sogo path continues past 明海五丁目 nearest index',
    },
    pathSpanHyattToAkeumi5: {
      fromIdx: nh.i,
      toIdx: na.i,
      orderedWays: seqC,
      usesWay238904764: on238.length > 0,
      way238Blocks: on238,
    },
    alternativeWaysNearHyatt: nearHyatt.map((x) => ({
      wayId: x.w.id,
      dist_m: +x.d.toFixed(3),
      tags: pickTags(x.w.tags),
    })),
    alternativeWaysNearAkeumi5: nearAkeumi.map((x) => ({
      wayId: x.w.id,
      dist_m: +x.d.toFixed(3),
      tags: pickTags(x.w.tags),
    })),
    buildingFootprintIntersections: {
      count: uniqBld.length,
      totalSegmentHits: buildingHits.length,
      buildingWayIds: uniqBld,
      samples: buildingHits.slice(0, 20),
    },
    overpassCaches: [
      '_v5_overpass_C_akeumi5_hyatt.json',
      '_v5_overpass_way_238904764.json',
    ],
    verdict: akeumiVerdict,
  };
  fs.writeFileSync(
    path.join(OUT, 'akeumi5-way-tags.json'),
    JSON.stringify(akeumiOut, null, 2)
  );

  // Re-evaluate kairaku with clearer logic after seeing data written
  const summary = {
    generatedAt: new Date().toISOString(),
    purpose:
      'OSM road-structure investigation for route-3 v5 problem areas (evidence only; no path edits)',
    pathFile: 'urayasu-higashi-danchi-path-v1.js',
    platformsFile: 'urayasu-higashi-danchi-platforms-v1.js',
    pathVersions: {
      '3-sogo': Path['3-sogo'].resolvedVersion,
      pathSource: Path['3-sogo'].pathSource,
    },
    verdicts: {
      kairaku: layerTags.verdict,
      rotary: rotaryVerdict,
      akeumi5: akeumiVerdict,
    },
    kairaku: {
      verdict: layerTags.verdict,
      elevatedMidpointPct: layerTags.stats.elevatedMidpointPct,
      groundGreenCutCount: layerTags.stats.groundGreenCutCount,
      platformDist_m: layerTags.questions.platformDist_m,
      anyJumpOver20m: layerTags.questions.anyJumpOver20mFromPlatform,
      isElevatedBridge: layerTags.questions.isCurrentPathOnElevatedBridgeOverCloverleafGreen,
      crossesGroundGrass: layerTags.questions.crossesGroundLevelGrass,
      waysUsed: layerTags.waysUsedByCurrentPath,
      symbol242: layerTags.symbolRoad242Candidates,
    },
    rotary: {
      verdict: rotaryVerdict,
      anyMidpointHitsGrass: anyIsland,
      loopWayIds: loopWays.map((w) => w.wayId),
      platformDists_m: rotaryOut.pathSpan.platformDists_m,
    },
    akeumi5: {
      verdict: akeumiVerdict,
      way238904764: tags238,
      pathDistToPlatform_m: +distNearestToPlat.toFixed(3),
      pathEndDistToPlatform_m: +distPathEndToPlat.toFixed(3),
      buildingIntersectionCount: uniqBld.length,
      usesFocusWay: on238.length > 0,
    },
    evidenceFiles: [
      'kairaku-mihama-osm-layer-tags.json',
      'kairaku-mihama-way-sequence.json',
      'shinurayasu-rotary-way-sequence.json',
      'akeumi5-way-tags.json',
      '_v5_overpass_A_kairaku_mihama.json',
      '_v5_overpass_B_shinurayasu_rotary.json',
      '_v5_overpass_C_akeumi5_hyatt.json',
      '_v5_overpass_way_238904764.json',
    ],
  };
  fs.writeFileSync(
    path.join(OUT, '_v5_investigation_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('DONE');
  console.log(JSON.stringify(summary.verdicts, null, 2));
  console.log('kairaku elevated pct', layerTags.stats.elevatedMidpointPct);
  console.log('green cuts', layerTags.stats.groundGreenCutCount);
  console.log('way238 tags', tags238);
  console.log('buildings', uniqBld.length);
  console.log('rotary islands', anyIsland);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
