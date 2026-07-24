'use strict';
/**
 * Geometry / intersection audit for route-6 市役所線 path banks.
 * Uses OSM relation ways + optional Overpass for building/green checks.
 * Does NOT call Google Directions.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = __dirname;
const OUT = path.join(OUT_DIR, '_geometry_intersection_report.json');

const SYSTEMS = [
  '6-maihama',
  '6-chidori',
  '6-urayasu-maihama',
  '6-tokai',
  '6-urayasu-chidori',
];

const PEDESTRIAN_HIGHWAYS = new Set([
  'footway', 'path', 'pedestrian', 'steps', 'cycleway', 'bridleway', 'track',
]);

function loadWindow(rel) {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(sandbox.window);
  return sandbox.window;
}

const PATH_BANK = loadWindow('shiyakusho-path-v1.js').SHIYAKUSHO_PATH_V1;
const LOCAL_BANK = JSON.parse(fs.readFileSync(path.join(OUT_DIR, '_path_bank.json'), 'utf8'));

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

function orient(a, b, c) {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function onSegment(a, b, c) {
  return (
    Math.min(a.lng, b.lng) <= c.lng + 1e-12 &&
    Math.max(a.lng, b.lng) >= c.lng - 1e-12 &&
    Math.min(a.lat, b.lat) <= c.lat + 1e-12 &&
    Math.max(a.lat, b.lat) >= c.lat - 1e-12
  );
}

function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function countSelfIntersections(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push([points[i], points[i + 1]]);
  }
  let count = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      if (i === 0 && j === segs.length - 1) continue;
      if (segmentsIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) count += 1;
    }
  }
  return count;
}

function distPointToSegment(p, a, b) {
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const ax = a.lng * lngScale;
  const ay = a.lat * latScale;
  const bx = b.lng * lngScale;
  const by = b.lat * latScale;
  const px = p.lng * lngScale;
  const py = p.lat * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return haversine(p, a);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const dLng = (cx / lngScale) - p.lng;
  const dLat = (cy / latScale) - p.lat;
  return Math.sqrt((dLat * latScale) ** 2 + (dLng * lngScale) ** 2);
}

function minDistToWaySegments(point, segments) {
  let best = Infinity;
  for (const [a, b] of segments) best = Math.min(best, distPointToSegment(point, a, b));
  return best;
}

function loadRelationBundle(relationId) {
  const p = path.join(OUT_DIR, `osm-relation-${relationId}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === relationId);
  if (!rel) throw new Error(`relation ${relationId} not in bundle`);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  return { rel, nodes, ways };
}

function wayPolyline(way, nodes) {
  const pts = [];
  for (const nid of way.nodes || []) {
    const n = nodes.get(nid);
    if (n && Number.isFinite(n.lat)) pts.push({ lat: n.lat, lng: n.lon });
  }
  return pts;
}

function relationWaySegments(rel, nodes, ways) {
  const used = [];
  const segments = [];
  for (const m of rel.members || []) {
    if (m.type !== 'way') continue;
    const way = ways.get(m.ref);
    if (!way) continue;
    used.push({ wayId: m.ref, tags: way.tags || {}, role: m.role || '' });
    const pts = wayPolyline(way, nodes);
    for (let i = 0; i < pts.length - 1; i++) segments.push([pts[i], pts[i + 1]]);
  }
  return { used, segments };
}

function bboxFromPoints(points, pad = 0.0015) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    south: minLat - pad,
    west: minLng - pad,
    north: maxLat + pad,
    east: maxLng + pad,
  };
}

function overpassQuery(query, timeoutMs = 60000) {
  const body = `data=${encodeURIComponent(query)}`;
  const endpoints = [
    'overpass.kumi.systems',
    'lz4.overpass-api.de',
    'overpass-api.de',
  ];
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= endpoints.length) {
        reject(new Error('Overpass unavailable'));
        return;
      }
      const host = endpoints[idx++];
      const req = https.request(
        {
          hostname: host,
          path: '/api/interpreter',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'chidori-route-trainer/route6-geometry-audit (local evidence; contact: github.com/infochibafukushi-dotcom/chidori-route-trainer)',
            Accept: 'application/json',
          },
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              tryNext();
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              tryNext();
            }
          });
        },
      );
      req.on('error', () => tryNext());
      req.on('timeout', () => {
        req.destroy();
        tryNext();
      });
      req.write(body);
      req.end();
    };
    tryNext();
  });
}

function wayToPoly(way, nodeMap) {
  const poly = [];
  for (const nid of way.nodes || []) {
    const n = nodeMap.get(nid);
    if (n) poly.push({ lat: n.lat, lng: n.lon });
  }
  return poly.length >= 3 ? poly : null;
}

function pointInPolygon(point, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function countPathFeatureIntersections(pathPoints, features, isGreen) {
  const hits = new Set();
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i];
    const b = pathPoints[i + 1];
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    for (const f of features) {
      if (
        pointInPolygon(a, f.poly) ||
        pointInPolygon(b, f.poly) ||
        pointInPolygon(mid, f.poly)
      ) {
        hits.add(`${f.kind}:${f.id}`);
      }
    }
  }
  return hits.size;
}

function classifyWayTags(used) {
  let pedestrianWayCount = 0;
  let wrongWayCount = 0;
  const samples = [];
  const wrongWayDetails = [];
  for (const w of used) {
    const tags = w.tags || {};
    const hw = tags.highway || '';
    if (PEDESTRIAN_HIGHWAYS.has(hw)) pedestrianWayCount += 1;
    // 車庫内 parking_aisle（access=private）は営業進入用として許可（今川/富岡と同型）。
    const garageAisle = hw === 'service' && tags.service === 'parking_aisle';
    const blocked =
      !garageAisle
      && (tags.access === 'no' || tags.access === 'private' || tags.motor_vehicle === 'no');
    if (blocked) {
      wrongWayCount += 1;
      wrongWayDetails.push({ wayId: w.wayId, highway: hw, access: tags.access || null });
    }
    if (samples.length < 8) {
      samples.push({
        wayId: w.wayId,
        highway: hw || null,
        oneway: tags.oneway || null,
        access: tags.access || null,
        bus: tags.bus || null,
        service: tags.service || null,
      });
    }
  }
  return { pedestrianWayCount, wrongWayCount, wrongWayDetails, usedWayCount: used.length, wayTagSamples: samples };
}

async function analyzeSystem(systemKey) {
  const bank = PATH_BANK[systemKey] || LOCAL_BANK[systemKey];
  if (!bank) throw new Error(`missing path bank for ${systemKey}`);
  const pathPoints = bank.pathPoints || [];
  const relationId = bank.relationId;
  const { rel, nodes, ways } = loadRelationBundle(relationId);
  const { used, segments } = relationWaySegments(rel, nodes, ways);

  const selfIntersectionCount = countSelfIntersections(pathPoints);
  let pointsFarFromWaysCount = 0;
  let maxDistToWay_m = 0;
  for (const p of pathPoints) {
    const d = minDistToWaySegments(p, segments);
    maxDistToWay_m = Math.max(maxDistToWay_m, d);
    if (d > 5) pointsFarFromWaysCount += 1;
  }

  const tagStats = classifyWayTags(used);
  const row = {
    systemKey,
    relationId,
    pathSource: bank.pathSource || `osm-relation-${relationId}`,
    pathPointCount: pathPoints.length,
    usedWayCount: tagStats.usedWayCount,
    selfIntersectionCount,
    pointsFarFromWaysCount,
    maxDistToWay_m: Math.round(maxDistToWay_m * 10) / 10,
    pedestrianWayCount: tagStats.pedestrianWayCount,
    wrongWayCount: tagStats.wrongWayCount,
    wayTagSamples: tagStats.wayTagSamples,
    buildingIntersectionCount: null,
    groundGreenIntersectionCount: null,
    bridgeGreenIntersectionCount: null,
    reviewRequired: pointsFarFromWaysCount > 0 || selfIntersectionCount > 0 || tagStats.wrongWayCount > 0,
    overpassOk: false,
  };

  try {
    const bb = bboxFromPoints(pathPoints);
    const query = `[out:json][timeout:40];
(
  way["building"](${bb.south},${bb.west},${bb.north},${bb.east});
  relation["building"](${bb.south},${bb.west},${bb.north},${bb.east});
  way["landuse"="grass"](${bb.south},${bb.west},${bb.north},${bb.east});
  way["leisure"="park"](${bb.south},${bb.west},${bb.north},${bb.east});
  way["natural"="wood"](${bb.south},${bb.west},${bb.north},${bb.east});
  way["bridge"="yes"]["highway"](${bb.south},${bb.west},${bb.north},${bb.east});
);
(._;>;);
out body;`;
    const data = await overpassQuery(query);
    const elements = data.elements || [];
    const nodeMap = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
    const buildings = [];
    const groundGreen = [];
    const bridgeWays = [];
    for (const e of elements) {
      if (e.type === 'way' && e.tags?.building) {
        const poly = wayToPoly(e, nodeMap);
        if (poly) buildings.push({ id: e.id, kind: 'building', poly });
      } else if (e.type === 'way' && (e.tags?.landuse === 'grass' || e.tags?.leisure === 'park' || e.tags?.natural === 'wood')) {
        const poly = wayToPoly(e, nodeMap);
        if (poly) groundGreen.push({ id: e.id, kind: 'green', poly });
      } else if (e.type === 'way' && e.tags?.bridge === 'yes' && e.tags?.highway) {
        const poly = wayToPoly(e, nodeMap);
        if (poly) bridgeWays.push({ id: e.id, kind: 'bridge', poly });
      }
    }
    row.buildingIntersectionCount = countPathFeatureIntersections(pathPoints, buildings, false);
    row.groundGreenIntersectionCount = countPathFeatureIntersections(pathPoints, groundGreen, true);
    row.bridgeGreenIntersectionCount = countPathFeatureIntersections(pathPoints, bridgeWays, true);
    row.overpassOk = true;
    row.reviewRequired = Boolean(
      row.reviewRequired ||
      row.buildingIntersectionCount > 0 ||
      row.groundGreenIntersectionCount > 0,
    );
  } catch (e) {
    row.note = `Overpass unavailable — manual z19 review required (${e instanceof Error ? e.message : String(e)})`;
    row.reviewRequired = true;
    row.overpassError = e instanceof Error ? e.message : String(e);
  }

  return row;
}

async function main() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {
    generatedAt: new Date().toISOString(),
    route: 'route-6',
    lineName: '市役所線',
    pathFiles: ['shiyakusho-path-v1.js', '_path_bank.json'],
    systems: {},
    pass: false,
  };

  for (const key of SYSTEMS) {
    console.log('analyze', key);
    report.systems[key] = await analyzeSystem(key);
    console.log(
      key,
      'selfX', report.systems[key].selfIntersectionCount,
      'farPts', report.systems[key].pointsFarFromWaysCount,
      'ped', report.systems[key].pedestrianWayCount,
      'overpass', report.systems[key].overpassOk,
      'bld', report.systems[key].buildingIntersectionCount,
      'green', report.systems[key].groundGreenIntersectionCount,
    );
    await sleep(15000);
  }

  report.pass = SYSTEMS.every((k) => {
    const s = report.systems[k];
    return s.selfIntersectionCount === 0 && s.pointsFarFromWaysCount === 0;
  });
  report.anyReviewRequired = SYSTEMS.some((k) => report.systems[k].reviewRequired);

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('wrote', OUT);
  console.log(JSON.stringify({ pass: report.pass, anyReviewRequired: report.anyReviewRequired }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
