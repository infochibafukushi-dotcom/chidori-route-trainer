'use strict';
/**
 * Build platforms + pathPoints for route-24 富士見循環線.
 * Hybrid: prefix/suffix from OSM relation 18323926 (shared with route-14 stops 1-8),
 * middle loop via Dijkstra on OSM highway ways + route-9 relation slice where shared-node proof holds.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const R14 = path.resolve(OUT, '..', 'route14-benten-tomioka-implementation-2026-07-26');
const R9 = path.resolve(OUT, '..', 'route9-maihama-implementation-2026-07-25');
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_deep_raw.json'), 'utf8'));

const PLATFORM_DIST_HARD_MAX = 30;
const MAX_GAP_M = 30;
const MAX_JOIN_M = 1;
const GENERATED = '2026-07-27-fujimi-loop-line-v1';
const UA = 'chidori-route-trainer/route24-fujimi-build';
const OVERPASS_HOSTS = ['overpass.kumi.systems', 'overpass-api.de'];
const BBOX = '35.628,139.878,35.652,139.918';
const PREFIX_REL = 18323926;
const R9_FUJIMI_REL = 18320323;

const SIG_KEY = Object.keys(DEEP.signatures || {})[0];
const OFFICIAL = DEEP.signatures[SIG_KEY];
const STOP_NAMES = OFFICIAL.stopNames;
const STOP_IDS = OFFICIAL.stopIds;

/** Default platform seeds; duplicate-name indices may swap via PLATFORM_CANDIDATES. */
const PLATFORM_SEEDS = [
  { name: '新浦安駅', lat: 35.6496296, lng: 139.9137782, platformId: 8415001166, role: 'platform_entry_only', osmName: '新浦安駅' },
  { name: '新浦安駅北口', lat: 35.6499903, lng: 139.9126359, platformId: 6778578838, role: 'platform', osmName: '新浦安駅北口' },
  { name: '若潮公園', lat: 35.6473943, lng: 139.9095296, platformId: 11581097364, role: 'platform', osmName: '若潮公園' },
  { name: '順天堂病院前', lat: 35.6453182, lng: 139.9070393, platformId: 6720667162, role: 'platform', osmName: '順天堂病院前' },
  { name: 'サンコーポ東口', lat: 35.6443346, lng: 139.9041674, platformId: 6842638649, role: 'platform', osmName: 'サンコーポ東口' },
  { name: '富岡第三児童公園', lat: 35.6454043, lng: 139.9028348, platformId: 1750823559, role: 'platform', osmName: '富岡第三児童公園' },
  { name: '富岡第一児童公園', lat: 35.6446898, lng: 139.9011921, platformId: 11610526577, role: 'platform', osmName: '富岡第一児童公園' },
  { name: '中央公園', lat: 35.6436044, lng: 139.8999048, platformId: 11610526580, role: 'platform', osmName: '中央公園' },
  { name: '東海大浦安高校前', lat: 35.6450061, lng: 139.8911876, platformId: 6778610692, role: 'platform', osmName: '東海大浦安高校前' },
  { name: '富士見三丁目', lat: 35.6479226, lng: 139.8892899, platformId: 6778604859, role: 'platform', osmName: '富士見三丁目' },
  { name: '富士見五丁目', lat: 35.6455749, lng: 139.8876956, platformId: 12367548464, role: 'platform', osmName: '富士見五丁目' },
  { name: '堀江橋', lat: 35.6451757, lng: 139.8854588, platformId: 6938760254, role: 'platform', osmName: '堀江橋' },
  { name: '見明川歩道橋', lat: 35.6423269, lng: 139.8864364, platformId: 6918654783, role: 'platform', osmName: '見明川歩道橋' },
  { name: '弁天橋', lat: 35.6403122, lng: 139.8891218, platformId: 6796278431, role: 'platform', osmName: '弁天橋' },
  { name: '東野三丁目', lat: 35.642908, lng: 139.890387, platformId: 6796278430, role: 'platform', osmName: '東野三丁目' },
  { name: '東海大浦安高校前', lat: 35.646037, lng: 139.8919091, platformId: 6796278429, role: 'platform', osmName: '東海大浦安高校前' },
  { name: '中央公園', lat: 35.6436044, lng: 139.8999048, platformId: 11610526580, role: 'platform', osmName: '中央公園' },
  { name: '富岡第一児童公園', lat: 35.6446898, lng: 139.9011921, platformId: 11610526577, role: 'platform', osmName: '富岡第一児童公園' },
  { name: '富岡第三児童公園', lat: 35.6454043, lng: 139.9028348, platformId: 1750823559, role: 'platform', osmName: '富岡第三児童公園' },
  { name: 'サンコーポ東口', lat: 35.6443346, lng: 139.9041674, platformId: 6842638649, role: 'platform', osmName: 'サンコーポ東口' },
  { name: '順天堂病院前', lat: 35.6453182, lng: 139.9070393, platformId: 6720667162, role: 'platform', osmName: '順天堂病院前' },
  { name: '若潮公園', lat: 35.6473943, lng: 139.9095296, platformId: 11581097364, role: 'platform', osmName: '若潮公園' },
  { name: '新浦安駅北口', lat: 35.6499903, lng: 139.9126359, platformId: 6778578838, role: 'platform', osmName: '新浦安駅北口' },
  { name: '新浦安駅', lat: 35.6496296, lng: 139.9137782, platformId: 8415001166, role: 'platform_exit_only', osmName: '新浦安駅' },
];

/** Per-index alternate OSM platform nodes (correct side of road per visit). */
const PLATFORM_CANDIDATES_BY_INDEX = {
  8: [
    { platformId: 6778610692, lat: 35.6450061, lng: 139.8911876 },
    { platformId: 6796278429, lat: 35.646037, lng: 139.8919091 },
  ],
  9: [
    { platformId: 6778604859, lat: 35.6479226, lng: 139.8892899 },
    { platformId: 6778604858, lat: 35.6482656, lng: 139.8892742 },
  ],
  10: [
    { platformId: 12367548464, lat: 35.6455749, lng: 139.8876956 },
    { platformId: 598536218, lat: 35.6454904, lng: 139.8878484 },
  ],
  13: [
    { platformId: 6796278431, lat: 35.6403122, lng: 139.8891218 },
    { platformId: 6796278428, lat: 35.6400969, lng: 139.8887958 },
  ],
  14: [
    { platformId: 6796278430, lat: 35.642908, lng: 139.890387 },
    { platformId: 6778610691, lat: 35.6433167, lng: 139.8903633 },
  ],
  15: [
    { platformId: 6796278429, lat: 35.646037, lng: 139.8919091 },
    { platformId: 6778610692, lat: 35.6450061, lng: 139.8911876 },
  ],
};

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

async function overpass(query) {
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
    try {
      return JSON.parse(await get(`https://${host}/api/interpreter?data=${encodeURIComponent(query)}`));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
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

function sha256(pts) {
  return crypto.createHash('sha256').update(JSON.stringify(pts.map((p) => [Math.round(p.lat * 1e6), Math.round(p.lng * 1e6)]))).digest('hex');
}

function maxGap(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m = Math.max(m, haversine(pts[i - 1], pts[i]));
  return Math.round(m * 10) / 10;
}

function nearestIndex(path, plat) {
  let best = { index: 0, dist: Infinity };
  for (let i = 0; i < path.length; i++) {
    const d = haversine(path[i], plat);
    if (d < best.dist) best = { index: i, dist: d };
  }
  return best;
}

function loadRelation(id, dir) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, `osm-relation-${id}.json`), 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === id);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  return { rel, nodes, ways };
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
  return [...coords].reverse().map((c) => ({ ...c }));
}

function densifyWithinWay(coords, maxGap = 25) {
  if (coords.length < 2) return coords.map((c) => ({ lat: c.lat, lng: c.lng }));
  const out = [{ lat: coords[0].lat, lng: coords[0].lng }];
  for (let i = 1; i < coords.length; i++) {
    const a = out[out.length - 1];
    const b = coords[i];
    const d = haversine(a, b);
    if (d > maxGap) {
      const n = Math.ceil(d / maxGap);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      }
    }
    out.push({ lat: b.lat, lng: b.lng });
  }
  return out;
}

function densifyBetween(a, b, maxGap = 25) {
  return densifyWithinWay([{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], maxGap);
}

function buildPathFromWayIdList(wayIds, nodes, ways, startHint) {
  const pathPts = [];
  const usedWays = [];
  let cursor = null;
  let maxJoin = 0;
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way) throw new Error(`way ${wayId} missing`);
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
      if (!shared && join > MAX_JOIN_M) throw new Error(`join gap ${join.toFixed(2)}m way ${wayId}`);
      usedWays.push({ wayId, flipped, sharedNode: shared, gapFromPrev_m: Math.round(join * 1000) / 1000 });
    } else if (startHint) {
      const forward = distEnds(coords, startHint);
      const rev = distEnds(reverseCoords(coords), startHint);
      flipped = rev.start < forward.start;
      if (flipped) coords = reverseCoords(coords);
      usedWays.push({ wayId, flipped, sharedNode: true, gapFromPrev_m: 0, startHint: true });
    } else {
      usedWays.push({ wayId, flipped: false, sharedNode: true, gapFromPrev_m: 0 });
    }
    const densified = densifyWithinWay(coords, 25);
    const skipFirst = Boolean(cursor) && haversine(cursor, densified[0]) < 1;
    for (const c of (skipFirst ? densified.slice(1) : densified)) pathPts.push({ lat: c.lat, lng: c.lng });
    const last = coords[coords.length - 1];
    cursor = { lat: last.lat, lng: last.lng, nodeId: last.nodeId };
  }
  return { pathPoints: pathPts, usedWays, maxJoin_m: Math.round(maxJoin * 1000) / 1000 };
}

function distEnds(coords, pt) {
  return { start: haversine(coords[0], pt), end: haversine(coords[coords.length - 1], pt) };
}

function slicePathToRange(path, startPlat, endPlat) {
  const si = nearestIndex(path, startPlat).index;
  const ei = nearestIndex(path, endPlat).index;
  if (ei <= si) throw new Error(`slice invalid si=${si} ei=${ei}`);
  return { pathPoints: path.slice(si, ei + 1), si, ei };
}

function isDriveable(w) {
  const hw = w.tags?.highway;
  if (!hw || ['motorway', 'motorway_link', 'footway', 'path', 'steps', 'cycleway', 'pedestrian'].includes(hw)) return false;
  if (w.tags?.access === 'no') return false;
  if (hw === 'service' && !(w.tags?.bus || w.tags?.psv)) return false;
  return true;
}

function edgeWeight(way, dist) {
  if (way.tags?.bus === 'designated' || way.tags?.psv === 'designated') return dist * 0.8;
  if (way.tags?.bus || way.tags?.psv) return dist * 0.9;
  return dist;
}

function buildAdjacency(ways, nodes) {
  const adj = new Map();
  for (const [id, way] of ways) {
    if (!isDriveable(way)) continue;
    const coords = wayCoords(way, nodes);
    const dirs = way.tags?.oneway === 'yes' ? [1] : way.tags?.oneway === '-1' ? [-1] : [1, -1];
    for (const dir of dirs) {
      const nids = dir === 1 ? way.nodes : [...way.nodes].reverse();
      const pts = dir === 1 ? coords : reverseCoords(coords);
      for (let i = 0; i < nids.length - 1; i++) {
        const a = nids[i];
        const b = nids[i + 1];
        const dist = edgeWeight(way, haversine(pts[i], pts[i + 1]));
        if (!adj.has(a)) adj.set(a, []);
        adj.get(a).push({ next: b, wayId: id, dist, fromIdx: i, toIdx: i + 1, dir });
      }
    }
  }
  return adj;
}

function nearestNode(nodes, ways, pt, maxD = 45) {
  let best = { d: Infinity, nodeId: null, lat: null, lng: null };
  for (const [, way] of ways) {
    if (!isDriveable(way)) continue;
    for (const nid of way.nodes || []) {
      const n = nodes.get(nid);
      if (!n) continue;
      const d = haversine(pt, { lat: n.lat, lng: n.lon });
      if (d < best.d) best = { d, nodeId: nid, lat: n.lat, lng: n.lon };
    }
  }
  return best.d <= maxD ? best : null;
}

function nearestSnapForPlatform(plat, graph, maxD = 40) {
  return nearestNode(graph.nodes, graph.ways, plat, maxD);
}

function dijkstraToNode(adj, startNode, goalNode, nodes) {
  const dist = new Map();
  const prev = new Map();
  const pq = [[0, startNode]];
  dist.set(startNode, 0);
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (u === goalNode) {
      const edges = [];
      let cur = goalNode;
      while (prev.has(cur)) {
        const p = prev.get(cur);
        edges.unshift(p.edge);
        cur = p.node;
      }
      return { edges, goalNode };
    }
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const e of adj.get(u) || []) {
      const nd = d + e.dist;
      if (nd < (dist.get(e.next) ?? Infinity)) {
        dist.set(e.next, nd);
        prev.set(e.next, { node: u, edge: e });
        pq.push([nd, e.next]);
      }
    }
  }
  return null;
}

function dijkstra(adj, startNode, goalPt, nodes, goalR = 50) {
  const dist = new Map();
  const prev = new Map();
  const pq = [[0, startNode]];
  dist.set(startNode, 0);
  let bestGoal = null;
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (d > (dist.get(u) ?? Infinity)) continue;
    const n = nodes.get(u);
    if (n && haversine({ lat: n.lat, lng: n.lon }, goalPt) <= goalR) {
      if (!bestGoal || d < bestGoal.dist) bestGoal = { node: u, dist: d };
    }
    for (const e of adj.get(u) || []) {
      const nd = d + e.dist;
      if (nd < (dist.get(e.next) ?? Infinity)) {
        dist.set(e.next, nd);
        prev.set(e.next, { node: u, edge: e });
        pq.push([nd, e.next]);
      }
    }
  }
  if (!bestGoal) return null;
  const edges = [];
  let cur = bestGoal.node;
  while (prev.has(cur)) {
    const p = prev.get(cur);
    edges.unshift(p.edge);
    cur = p.node;
  }
  return { edges, goalNode: bestGoal.node };
}

function materializeEdges(graph, edges) {
  const { ways, nodes } = graph;
  const points = [];
  const used = [];
  for (const e of edges) {
    const way = ways.get(e.wayId);
    let coords = wayCoords(way, nodes);
    if (e.dir === -1) coords = reverseCoords(coords);
    const slice = coords.slice(e.fromIdx, e.toIdx + 1);
    const dens = densifyWithinWay(slice, 25);
    const skip = points.length && haversine(points[points.length - 1], dens[0]) < 1;
    for (const c of (skip ? dens.slice(1) : dens)) points.push({ lat: c.lat, lng: c.lng });
    if (!used.length || used[used.length - 1].wayId !== e.wayId) used.push({ wayId: e.wayId, dir: e.dir });
  }
  return { pathPoints: points, usedWays: used };
}

function appendPath(base, addition) {
  if (!addition.length) return base;
  if (!base.length) return [...addition];
  const skip = haversine(base[base.length - 1], addition[0]) < MAX_JOIN_M;
  return base.concat(skip ? addition.slice(1) : addition);
}

function appendPlatformPoint(path, plat) {
  if (!path.length) return [{ lat: plat.lat, lng: plat.lng }];
  const last = path[path.length - 1];
  const d = haversine(last, plat);
  if (d <= 1) return path;
  if (d > MAX_GAP_M) return path;
  return path.concat(densifyBetween(last, plat, 25).slice(1));
}

function routeSegmentToPlatform(fromPlat, toPlat, graph, startNodeId) {
  const toSnap = nearestSnapForPlatform(toPlat, graph, 45);
  if (!toSnap) throw new Error(`snap-to failed ${toPlat.name} id=${toPlat.platformId}`);
  let startId = startNodeId;
  if (!startId) {
    const fromSnap = nearestSnapForPlatform(fromPlat, graph, 50);
    if (!fromSnap) throw new Error(`snap-from failed ${fromPlat.name}`);
    startId = fromSnap.nodeId;
  }
  const route = dijkstraToNode(graph.adj, startId, toSnap.nodeId, graph.nodes);
  if (!route) throw new Error(`dijkstra failed ${fromPlat.name}→${toPlat.name}`);
  const mat = materializeEdges(graph, route.edges);
  let pts = mat.pathPoints;
  pts = appendPlatformPoint(pts, toPlat);
  return { pathPoints: pts, usedWays: mat.usedWays, goalNode: toSnap.nodeId, endDist_m: haversine(pts[pts.length - 1], toPlat) };
}

function tryR9FujimiSlice(fromPlat, toPlat, r9FullPath) {
  const si = nearestIndex(r9FullPath, fromPlat).index;
  const ei = nearestIndex(r9FullPath, toPlat).index;
  if (ei <= si) return null;
  const slice = r9FullPath.slice(si, ei + 1);
  const endDist = haversine(slice[slice.length - 1], toPlat);
  const startDist = haversine(slice[0], fromPlat);
  if (startDist > 30 || endDist > 30) return null;
  return { pathPoints: appendPlatformPoint(slice, toPlat), proof: `route-9 relation ${R9_FUJIMI_REL} shared corridor 富士見三丁目→富士見五丁目`, startDist_m: startDist, endDist_m: endDist };
}

function repairPathGaps(graph, pathPoints) {
  let pts = [...pathPoints];
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const g = haversine(next[next.length - 1], pts[i]);
      if (g > MAX_GAP_M) {
        const snap = nearestNode(graph.nodes, graph.ways, next[next.length - 1], 55);
        if (snap) {
          const goalSnap = nearestNode(graph.nodes, graph.ways, pts[i], 55);
          if (goalSnap) {
            const route = dijkstraToNode(graph.adj, snap.nodeId, goalSnap.nodeId, graph.nodes);
            if (route) {
              const mat = materializeEdges(graph, route.edges);
              next.push(...(mat.pathPoints.length > 1 ? mat.pathPoints.slice(1) : mat.pathPoints));
              changed = true;
              continue;
            }
          }
        }
      }
      next.push(pts[i]);
    }
    pts = next;
    if (!changed) break;
  }
  return pts;
}

async function fetchHighways() {
  const cache = path.join(OUT, '_osm_highways.json');
  if (fs.existsSync(cache)) return loadHighwayMaps(JSON.parse(fs.readFileSync(cache, 'utf8')));
  const q = `[out:json][timeout:180];way["highway"](${BBOX});(._;>;);out body;`;
  const json = await overpass(q);
  fs.writeFileSync(cache, JSON.stringify(json, null, 2));
  return loadHighwayMaps(json);
}

function loadHighwayMaps(json) {
  const nodes = new Map();
  const ways = new Map();
  for (const el of json.elements || []) {
    if (el.type === 'node') nodes.set(el.id, el);
    if (el.type === 'way' && el.tags?.highway) ways.set(el.id, el);
  }
  return { nodes, ways };
}

function mergeMaps(a, b) {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, v);
  return out;
}

function applyPlatformCandidates(seeds, picks) {
  return seeds.map((p, i) => {
    const cands = PLATFORM_CANDIDATES_BY_INDEX[i];
    const pick = picks[i];
    if (!cands || pick == null) return { ...p, index: i };
    const c = cands[pick];
    return { ...p, lat: c.lat, lng: c.lng, platformId: c.platformId, index: i };
  });
}

function cartesianChoices() {
  const indices = Object.keys(PLATFORM_CANDIDATES_BY_INDEX).map(Number).sort((a, b) => a - b);
  const sizes = indices.map((i) => PLATFORM_CANDIDATES_BY_INDEX[i].length);
  const out = [];
  const cur = {};
  function rec(depth) {
    if (depth === indices.length) {
      out.push({ ...cur });
      return;
    }
    const idx = indices[depth];
    for (let j = 0; j < sizes[depth]; j++) {
      cur[idx] = j;
      rec(depth + 1);
    }
  }
  rec(0);
  return out;
}

function validateSegment(platforms, pathPoints, fromIdx, toIdx, pathOffset = 0) {
  const platformDists = [];
  let searchFrom = 0;
  for (let si = fromIdx; si <= toIdx; si++) {
    const p = platforms[si];
    let best = { index: -1, dist: Infinity };
    for (let i = searchFrom; i < pathPoints.length; i++) {
      const d = haversine(pathPoints[i], p);
      if (d < best.dist) best = { index: i, dist: d };
    }
    if (best.dist > PLATFORM_DIST_HARD_MAX) {
      return {
        ok: false,
        fail: `${p.name} idx${p.index} best ${best.dist.toFixed(1)}m in segment [${fromIdx}-${toIdx}] pathLocal ${searchFrom}`,
        platformDists,
      };
    }
    searchFrom = best.index + 1;
    platformDists.push({
      name: p.name,
      index: p.index,
      dist: Math.round(best.dist * 10) / 10,
      pathIndex: best.index + pathOffset,
      platformId: p.platformId,
    });
  }
  return { ok: true, platformDists, endLocal: searchFrom };
}

function validateBuild(platforms, prefixPts, middlePts, returnPts) {
  const pathPoints = appendPath(appendPath(prefixPts, middlePts), returnPts);
  const vPrefix = validateSegment(platforms, prefixPts, 0, 7, 0);
  if (!vPrefix.ok) return { ...vPrefix, pathPoints };
  const vMiddle = validateSegment(platforms, middlePts, 8, 15, prefixPts.length);
  if (!vMiddle.ok) return { ...vMiddle, pathPoints };
  const vReturn = validateSegment(platforms, returnPts, 16, 23, prefixPts.length + middlePts.length);
  if (!vReturn.ok) return { ...vReturn, pathPoints };
  const platformDists = [...vPrefix.platformDists, ...vMiddle.platformDists, ...vReturn.platformDists];
  const gap = maxGap(pathPoints);
  if (gap > MAX_GAP_M) return { ok: false, fail: `maxGap ${gap}m`, platformDists, pathPoints };
  return {
    ok: true,
    platformDists,
    pathPoints,
    maxGap_m: gap,
    maxPlatformDist_m: Math.max(...platformDists.map((x) => x.dist)),
  };
}

function buildPathForPlatforms(platforms, graph, prefixSlice, prefixFull, r14, r9FullPath) {
  let middlePts = [];
  const allUsedWays = prefixFull.usedWays.map((w) => ({ ...w, segment: 'prefix-r18323926' }));
  const segments = [{
    kind: 'composition-prefix',
    proof: 'route-14 relation 18323926 stops 1-8 identical to route-24 official order',
    relationId: PREFIX_REL,
    from: platforms[0].name,
    to: platforms[7].name,
  }];

  let cursorNode = null;
  const middleRanges = [
    [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16],
  ];

  for (const [fi, ti] of middleRanges) {
    const from = platforms[fi];
    const to = platforms[ti];
    let seg = null;

    if (fi === 9 && ti === 10 && r9FullPath) {
      seg = tryR9FujimiSlice(from, to, r9FullPath);
      if (seg) {
        segments.push({ kind: 'composition-r9-fujimi', from: from.name, to: to.name, relationId: R9_FUJIMI_REL, proof: seg.proof, endDist_m: seg.endDist_m });
        middlePts = appendPath(middlePts, seg.pathPoints);
        const toSnap = nearestSnapForPlatform(to, graph, 45);
        cursorNode = toSnap?.nodeId ?? null;
        continue;
      }
    }

    const routed = routeSegmentToPlatform(from, to, graph, cursorNode);
    segments.push({
      kind: 'dijkstra-highway',
      from: from.name,
      to: to.name,
      wayIds: [...new Set(routed.usedWays.map((w) => w.wayId))],
      endDist_m: Math.round(routed.endDist_m * 10) / 10,
      toPlatformId: to.platformId,
    });
    middlePts = appendPath(middlePts, routed.pathPoints);
    cursorNode = routed.goalNode;
    for (const uw of routed.usedWays) allUsedWays.push({ ...uw, segment: `${from.name}→${to.name}` });
  }

  const prefixUsedIds = prefixFull.usedWays.map((w) => w.wayId);
  const returnBuild = buildPathFromWayIdList([...prefixUsedIds].reverse(), r14.nodes, r14.ways, platforms[16]);
  const returnSlice = slicePathToRange(returnBuild.pathPoints, platforms[16], platforms[23]);
  segments.push({
    kind: 'composition-return',
    proof: 'relation 18323926 ways reversed for 中央公園→新浦安 (official stops 17-24)',
    relationId: PREFIX_REL,
    from: platforms[16].name,
    to: platforms[23].name,
  });
  for (const uw of returnBuild.usedWays) allUsedWays.push({ ...uw, segment: 'return-r18323926' });

  const prefixPts = repairPathGaps(graph, [...prefixSlice.pathPoints]);
  middlePts = repairPathGaps(graph, middlePts);
  const returnPts = repairPathGaps(graph, [...returnSlice.pathPoints]);
  const pathPoints = appendPath(appendPath(prefixPts, middlePts), returnPts);
  const usedWayIds = [...new Set(allUsedWays.map((w) => w.wayId).concat(prefixUsedIds))];
  return { pathPoints, prefixPts, middlePts, returnPts, segments, allUsedWays, usedWayIds };
}

async function main() {
  for (let i = 0; i < STOP_NAMES.length; i++) {
    if (PLATFORM_SEEDS[i].name !== STOP_NAMES[i]) throw new Error(`name mismatch ${i}`);
  }

  const r14 = loadRelation(PREFIX_REL, R14);
  const prefixWayIds = (r14.rel.members || []).filter((m) => m.type === 'way').map((m) => m.ref);
  const hw = await fetchHighways();
  const nodes = mergeMaps(r14.nodes, hw.nodes);
  const ways = mergeMaps(r14.ways, hw.ways);
  for (const id of prefixWayIds) if (!ways.has(id)) throw new Error(`prefix way ${id} missing`);
  const adj = buildAdjacency(ways, nodes);
  const graph = { nodes, ways, adj };

  let r9FullPath = null;
  try {
    const r9 = loadRelation(R9_FUJIMI_REL, R9);
    const r9WayIds = (r9.rel.members || []).filter((m) => m.type === 'way').map((m) => m.ref);
    r9FullPath = buildPathFromWayIdList(r9WayIds, r9.nodes, r9.ways, null).pathPoints;
  } catch (e) {
    console.warn('route-9 fujimi relation unavailable', e.message);
  }

  const choices = cartesianChoices();
  let best = null;
  let lastFail = null;

  for (const picks of choices) {
    const platforms = applyPlatformCandidates(PLATFORM_SEEDS, picks);
    const prefixFull = buildPathFromWayIdList(prefixWayIds, r14.nodes, r14.ways, platforms[0]);
    let prefixSlice;
    try {
      prefixSlice = slicePathToRange(prefixFull.pathPoints, platforms[0], platforms[7]);
    } catch (e) {
      lastFail = e.message;
      continue;
    }
    try {
      const built = buildPathForPlatforms(platforms, graph, prefixSlice, prefixFull, r14, r9FullPath);
      const v = validateBuild(platforms, built.prefixPts, built.middlePts, built.returnPts);
      if (!v.ok) {
        lastFail = v.fail;
        if (!best || (v.platformDists && v.platformDists.length > (best.v?.platformDists?.length || 0))) {
          best = { picks, platforms, built, v, partial: true };
        }
        continue;
      }
      best = { picks, platforms, built, v, partial: false };
      break;
    } catch (e) {
      lastFail = e.message;
    }
  }

  if (!best || best.partial) {
    const tried = choices.map((picks) => {
      const plats = applyPlatformCandidates(PLATFORM_SEEDS, picks);
      return picks;
    });
    fs.writeFileSync(path.join(OUT, '_build_failures.json'), JSON.stringify({
      lastFail,
      triedCount: choices.length,
      bestPartial: best?.v || null,
      platformDists: best?.v?.platformDists || [],
      picks: best?.picks || null,
    }, null, 2));
    throw new Error(lastFail || 'all platform candidate combinations failed');
  }

  const { platforms, built, v, picks } = best;
  console.log('platform picks', picks, 'maxPlat', v.maxPlatformDist_m, 'maxGap', v.maxGap_m);

  const result = {
    key: '24-fujimi-loop',
    relationId: null,
    pathSource: 'osm-r18323926-prefix-composition+dijkstra-highway-middle+r9-fujimi-slice-return',
    pathHash: sha256(built.pathPoints),
    resolvedVersion: '2026-07-27-fujimi24-fujimi-loop-v1',
    pathPoints: built.pathPoints,
    platforms: { byIndex: platforms.map(({ name, lat, lng, platformId, role, osmName }) => ({ name, lat, lng, platformId, role, osmName })) },
    stopNames: STOP_NAMES,
    stopIds: STOP_IDS,
    usedWayIds: built.usedWayIds,
    segments: built.segments,
    platformDists: v.platformDists,
    platformPicks: picks,
    maxGap_m: v.maxGap_m,
    maxPlatformDist_m: v.maxPlatformDist_m,
    pointCount: built.pathPoints.length,
    signatureCount: Object.keys(DEEP.signatures).length,
    note: 'One-way loop only (38 trips, 1 signature). 1 lap → 終点.',
  };

  fs.writeFileSync(path.join(OUT, '_build_summary.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUT, '_path_bank.json'), JSON.stringify({ '24-fujimi-loop': result }, null, 2));
  fs.writeFileSync(path.join(OUT, '_platforms_bank.json'), JSON.stringify({ '24-fujimi-loop': result.platforms }, null, 2));
  writePlatformsJs(result);
  writePathJs(result);
  writePathPolicyJs(result);
  writeStopImagesJs();
  console.log('OK', result.pointCount, 'pts', result.usedWayIds.length, 'ways', 'maxGap', v.maxGap_m, 'maxPlat', v.maxPlatformDist_m);
}

function writePlatformsJs(result) {
  const body = JSON.stringify({ '24-fujimi-loop': result.platforms }, null, 2);
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-platforms-v1.js'), `// Auto-generated OSM platforms for 富士見循環線 系統24 (route-24).
// Official: Keisei Bus Navi course 0008200304 berth 24. Loop uses byIndex for duplicate names.
// Generated: ${GENERATED}
(() => {
  window.FUJIMI_LOOP_LINE_PLATFORMS_V1 = ${body};
})();
`);
}

function writePathJs(result) {
  const entry = {
    relationId: null,
    pathSource: result.pathSource,
    pathHash: result.pathHash,
    resolvedVersion: result.resolvedVersion,
    pathPoints: result.pathPoints,
    usedWayIds: result.usedWayIds,
    segments: result.segments,
  };
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-path-v1.js'), `// Auto-generated OSM road path for 富士見循環線 系統24 (route-24).
// Prefix/suffix: OSM relation 18323926 composition. Middle: Dijkstra highway ways. No Google Directions.
// Generated: ${GENERATED}
(() => {
  window.FUJIMI_LOOP_LINE_PATH_V1 = ${JSON.stringify({ '24-fujimi-loop': entry }, null, 2)};
})();
`);
}

function writePathPolicyJs(result) {
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-path-policy-v1.js'), `// 富士見循環線（route-24）道路形状ポリシー。
(() => {
  window.FUJIMI_LOOP_LINE_PATH_POLICY_V1 = {
    routeId: 'route-24',
    version: '${GENERATED}',
    systems: {
      '24-fujimi-loop': {
        pathSource: '${result.pathSource}',
        relationId: null,
        compositionRelation: 18323926,
        usedWayIds: ${JSON.stringify(result.usedWayIds)},
        maxGap_m: ${result.maxGap_m},
        maxPlatformDist_m: ${result.maxPlatformDist_m},
        loopPolicy: 'one_lap_then_terminal',
      },
    },
  };
})();
`);
}

function writeStopImagesJs() {
  const tpl = fs.readFileSync(path.join(ROOT, 'wakashio-dori-line-22-stop-images-v1.js'), 'utf8');
  const cssTpl = fs.readFileSync(path.join(ROOT, 'wakashio-dori-line-22-stop-images-v1.css'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-stop-images-v1.js'), tpl
    .replace(/WAKASHIO_DORI_LINE_22/g, 'FUJIMI_LOOP_LINE')
    .replace(/若潮通り線/g, '富士見循環線')
    .replace(/route-22/g, 'route-24')
    .replace(/22-/g, '24-'));
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-stop-images-v1.css'), cssTpl
    .replace(/wakashio-dori-line-22/g, 'fujimi-loop-line')
    .replace(/若潮通り線/g, '富士見循環線'));
}

main().catch((e) => { console.error('BUILD_FAIL', e.message || e); process.exit(1); });
