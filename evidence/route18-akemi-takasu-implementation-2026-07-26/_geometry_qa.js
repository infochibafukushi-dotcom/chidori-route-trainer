'use strict';
/**
 * Geometry QA for route-18 paths.
 *
 * Checks, per system:
 *   - highway classification: no pedestrian / footway / path / steps / cycleway / construction
 *   - no building / landuse=grass|forest / leisure=park ways used as roadway
 *   - one-way compliance: a oneway=yes way must not be traversed reversed
 *   - wrong-way / unnecessary U-turn: heading reversal >150° away from a terminal
 *   - disconnected: adjacent point gap >30m
 *   - NaN / null coordinates
 *   - stop-to-path distance: ≤20m ok, 20–30m reviewRequired, >30m fail
 *   - pathHash recomputation must equal the value stored in the shipped bank
 *   - sibling-route relations (15/19/10/11/3/23) and their exclusive stops must not appear
 *   - the night short-turn must not be reproducible as a slice of a through-service path
 *   - bus / psv tags of every traversed way are recorded
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const SUMMARY = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

const MAX_GAP_M = 30;
const UTURN_DEG = 150;
const UTURN_TERMINAL_SKIP_M = 60;
const PLATFORM_SOFT = 20;
const PLATFORM_HARD = 30;

const SIBLING_RELATIONS = [
  18419865, 18419864, 18381771, 18381770, 18381757, 18381756,
  18352883, 18352884, 18419852, 18417570, 18417571, 18417579, 18419894, 18419895,
];
/**
 * Exact sibling-owned stop names. 高洲 is route-15's stop; 高洲橋 / 高洲中央公園 / 高洲海浜公園 /
 * 高洲北小学校 / 高洲八丁目 / 高洲四丁目 / 高洲三丁目 / 高洲西児童公園 / 高洲二丁目 all belong to
 * route-18, so this list is only ever compared with `===`.
 */
const SIBLING_EXCLUSIVE_STOPS = [
  '明海交差点', '入船橋', '高洲',
  '浦安南高校', '特別養護老人ホーム', 'みなと南',
  'ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '日の出南', '新浦安温泉',
  '総合公園', 'ベイサイドホテルエリア', '望海の街', '明海五丁目', 'ハイアットリージェンシー',
  '三井ガーデンホテル', '明海南小学校', '明海六丁目',
];

const FORBIDDEN_HIGHWAY = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway', 'bridleway', 'construction', 'proposed', 'track', 'corridor', 'platform']);
const ROAD_HIGHWAY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road', 'busway']);

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const toR = (d) => (d * Math.PI) / 180;
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const dLng = toR(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function sha256(points) {
  return crypto.createHash('sha256')
    .update(points.map((p) => `${Number(p.lat).toFixed(7)},${Number(p.lng).toFixed(7)}`).join(';'))
    .digest('hex');
}

function loadRelationWays(id) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${id}.json`), 'utf8'));
  return new Map((j.elements || []).filter((e) => e.type === 'way').map((w) => [w.id, w]));
}

/** Read the shipped bank without a browser: strip the IIFE wrapper and eval the object. */
function loadShippedBank(file, globalName) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = src.indexOf(`window.${globalName} =`);
  if (start < 0) throw new Error(`${globalName} not found in ${file}`);
  const objStart = src.indexOf('{', start);
  const objEnd = src.lastIndexOf('};');
  return JSON.parse(src.slice(objStart, objEnd + 1));
}

const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
function isContiguousSliceOf(a, b) {
  if (!a.length || a.length > b.length) return false;
  for (let i = 0; i + a.length <= b.length; i++) {
    if (a.every((p, j) => samePoint(p, b[i + j]))) return true;
  }
  return false;
}
const isReverseOf = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[b.length - 1 - i]));

function main() {
  const pathBank = loadShippedBank('akemi-takasu-line-path-v1.js', 'AKEMI_TAKASU_LINE_PATH_V1');
  const platformsBank = loadShippedBank('akemi-takasu-line-platforms-v1.js', 'AKEMI_TAKASU_LINE_PLATFORMS_V1');

  const report = {
    checkedAt: new Date().toISOString(),
    routeId: 'route-18',
    thresholds: { maxGap_m: MAX_GAP_M, uturnDeg: UTURN_DEG, platformSoft_m: PLATFORM_SOFT, platformHard_m: PLATFORM_HARD },
    siblingRelationsUsed: [],
    siblingStopsUsed: [],
    systems: {},
    failures: [],
    reviewRequired: [],
  };

  for (const [key, bank] of Object.entries(pathBank)) {
    if (SIBLING_RELATIONS.includes(bank.relationId)) report.siblingRelationsUsed.push({ key, relationId: bank.relationId });
    for (const rid of (bank.compositionRelations || [])) {
      if (SIBLING_RELATIONS.includes(rid)) report.siblingRelationsUsed.push({ key, relationId: rid });
    }
    for (const name of Object.keys(platformsBank[key] || {})) {
      if (SIBLING_EXCLUSIVE_STOPS.includes(name)) report.siblingStopsUsed.push({ key, name });
    }
    const sysSummary = SUMMARY.systems[key];
    const relationIds = (bank.compositionRelations && bank.compositionRelations.length)
      ? bank.compositionRelations
      : [bank.relationId];
    const ways = new Map();
    for (const rid of relationIds) {
      if (rid == null) continue;
      for (const [id, w] of loadRelationWays(rid)) ways.set(id, w);
    }
    const pts = bank.pathPoints;

    const wayIssues = { forbiddenHighway: [], unknownHighway: [], buildingOrGreen: [], wrongWay: [], onewayOk: 0 };
    for (const uw of sysSummary.usedWays) {
      const w = ways.get(uw.wayId);
      if (!w) { wayIssues.unknownHighway.push({ wayId: uw.wayId, reason: 'way element missing' }); continue; }
      const t = w.tags || {};
      const hw = t.highway || null;
      if (hw && FORBIDDEN_HIGHWAY.has(hw)) wayIssues.forbiddenHighway.push({ wayId: w.id, highway: hw, name: t.name || null });
      else if (!hw || !ROAD_HIGHWAY.has(hw)) wayIssues.unknownHighway.push({ wayId: w.id, highway: hw, name: t.name || null });
      if (t.building || t.landuse === 'grass' || t.landuse === 'forest' || t.leisure === 'park' || t.natural) {
        wayIssues.buildingOrGreen.push({ wayId: w.id, building: t.building || null, landuse: t.landuse || null, leisure: t.leisure || null, natural: t.natural || null });
      }
      const oneway = t.oneway || null;
      if (oneway === 'yes' || oneway === '1' || oneway === 'true') {
        if (uw.flipped) wayIssues.wrongWay.push({ wayId: w.id, name: t.name || null, oneway, highway: hw, note: 'traversed against oneway=yes' });
        else wayIssues.onewayOk += 1;
      } else if (oneway === '-1') {
        if (!uw.flipped) wayIssues.wrongWay.push({ wayId: w.id, name: t.name || null, oneway, highway: hw, note: 'traversed against oneway=-1' });
        else wayIssues.onewayOk += 1;
      }
    }

    let maxGap = 0;
    let nanCount = 0;
    const bigGaps = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) { nanCount += 1; continue; }
      if (i === 0) continue;
      const g = haversine(pts[i - 1], p);
      if (g > maxGap) maxGap = g;
      if (g > MAX_GAP_M) bigGaps.push({ index: i, gap_m: Math.round(g * 10) / 10 });
    }

    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    const uturns = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const inSeg = haversine(pts[i - 1], pts[i]);
      const outSeg = haversine(pts[i], pts[i + 1]);
      if (inSeg < 2 || outSeg < 2) continue;
      const turn = angleDiff(bearing(pts[i - 1], pts[i]), bearing(pts[i], pts[i + 1]));
      if (turn < UTURN_DEG) continue;
      const nearStart = cum[i] < UTURN_TERMINAL_SKIP_M;
      const nearEnd = total - cum[i] < UTURN_TERMINAL_SKIP_M;
      uturns.push({
        index: i, turnDeg: Math.round(turn * 10) / 10,
        lat: pts[i].lat, lng: pts[i].lng,
        distFromStart_m: Math.round(cum[i]), distFromEnd_m: Math.round(total - cum[i]),
        terminalTurnaround: nearStart || nearEnd,
      });
    }
    const unnecessaryUturns = uturns.filter((u) => !u.terminalTurnaround);

    const order = ORDERS.systems[key];
    const platformChecks = [];
    for (const name of order.stopNames) {
      const plat = platformsBank[key][name];
      if (!plat) { platformChecks.push({ name, dist_m: null, status: 'MISSING' }); continue; }
      let best = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < pts.length; i++) {
        const d = haversine(pts[i], plat);
        if (d < best) { best = d; bestIdx = i; }
      }
      const dist = Math.round(best * 10) / 10;
      platformChecks.push({
        name, dist_m: dist, pathIndex: bestIdx,
        status: dist <= PLATFORM_SOFT ? 'OK' : (dist <= PLATFORM_HARD ? 'REVIEW' : 'FAIL'),
      });
    }

    // Stops must be encountered in official order along the path.
    const stopOrderIssues = [];
    let lastIdx = -1;
    for (const p of platformChecks) {
      if (p.pathIndex == null) continue;
      if (p.pathIndex < lastIdx) stopOrderIssues.push({ name: p.name, pathIndex: p.pathIndex, previousMax: lastIdx });
      lastIdx = Math.max(lastIdx, p.pathIndex);
    }

    const recomputed = sha256(pts);
    const sys = {
      relationId: bank.relationId,
      pathSource: bank.pathSource,
      resolvedVersion: bank.resolvedVersion,
      pathPoints: pts.length,
      pathLength_m: Math.round(total),
      storedPathHash: bank.pathHash,
      recomputedPathHash: recomputed,
      pathHashMatches: recomputed === bank.pathHash,
      maxGap_m: Math.round(maxGap * 10) / 10,
      gapsOverLimit: bigGaps,
      nanCount,
      wayIssues,
      uturnsTotal: uturns.length,
      terminalTurnarounds: uturns.filter((u) => u.terminalTurnaround),
      unnecessaryUturns,
      platformChecks,
      stopOrderIssues,
      maxPlatformDist_m: Math.max(0, ...platformChecks.filter((p) => p.dist_m != null).map((p) => p.dist_m)),
      accessRestrictedWays: sysSummary.access,
      busPsvTags: sysSummary.busPsv,
    };
    report.systems[key] = sys;

    const fail = (msg) => report.failures.push(`${key}: ${msg}`);
    if (!sys.pathHashMatches) fail('pathHash mismatch vs shipped bank');
    if (nanCount) fail(`${nanCount} NaN/null coordinates`);
    if (bigGaps.length) fail(`${bigGaps.length} gaps over ${MAX_GAP_M}m (max ${sys.maxGap_m}m)`);
    if (wayIssues.forbiddenHighway.length) fail(`forbidden highway types ${JSON.stringify(wayIssues.forbiddenHighway)}`);
    if (wayIssues.unknownHighway.length) fail(`non-road highway tags ${JSON.stringify(wayIssues.unknownHighway)}`);
    if (wayIssues.buildingOrGreen.length) fail(`building/green ways used ${JSON.stringify(wayIssues.buildingOrGreen)}`);
    if (wayIssues.wrongWay.length) fail(`wrong-way traversal ${JSON.stringify(wayIssues.wrongWay)}`);
    if (unnecessaryUturns.length) fail(`${unnecessaryUturns.length} unnecessary U-turns ${JSON.stringify(unnecessaryUturns)}`);
    if (stopOrderIssues.length) fail(`stops out of official order along path ${JSON.stringify(stopOrderIssues)}`);
    if (sysSummary.access.unresolvedRestrictedWayCount > 0) {
      fail(`unresolved access-restricted ways ${JSON.stringify(sysSummary.access.unresolvedWays)}`);
    }
    for (const p of platformChecks) {
      if (p.status === 'FAIL' || p.status === 'MISSING') fail(`stop ${p.name} ${p.status} (${p.dist_m}m)`);
      if (p.status === 'REVIEW') report.reviewRequired.push(`${key}: ${p.name} ${p.dist_m}m (20-30m, evidence required)`);
    }

    console.log(key,
      '| pts', pts.length,
      '| len', `${sys.pathLength_m}m`,
      '| maxGap', sys.maxGap_m,
      '| maxStop', sys.maxPlatformDist_m,
      '| hashOK', sys.pathHashMatches,
      '| uturn', unnecessaryUturns.length,
      '| wrongWay', wayIssues.wrongWay.length,
      '| onewayOK', wayIssues.onewayOk,
      '| badHighway', wayIssues.forbiddenHighway.length + wayIssues.unknownHighway.length,
      '| stopOrder', stopOrderIssues.length,
      '| bus', JSON.stringify(sysSummary.busPsv.busCounts));
  }

  // ---- cross-system independence: no reversal; contiguous slice only when verified composition ----
  const ALLOWED_SLICE = new Set(
    ((SUMMARY.policy && SUMMARY.policy.allowedContiguousSlicePairs) || []).map((p) => `${p.a}|${p.b}`),
  );
  const keys = Object.keys(pathBank);
  report.independenceChecks = [];
  for (const a of keys) {
    for (const b of keys) {
      if (a === b) continue;
      const rev = isReverseOf(pathBank[a].pathPoints, pathBank[b].pathPoints);
      const slice = isContiguousSliceOf(pathBank[a].pathPoints, pathBank[b].pathPoints);
      const allowed = ALLOWED_SLICE.has(`${a}|${b}`);
      report.independenceChecks.push({ a, b, isExactReverse: rev, isContiguousSlice: slice, allowedSlice: allowed });
      if (rev) report.failures.push(`${a} path is an exact reverse of ${b}`);
      if (slice && !allowed) report.failures.push(`${a} path is a contiguous slice of ${b} — splicing detected`);
    }
  }

  // ---- deferred patterns (if any remain) must stay absent ----
  report.deferredPatternsAbsent = (ORDERS.deferredNoOsmSource || []).map((d) => ({
    course: d.course,
    departure: d.departure,
    destination: d.destination,
    presentInBank: keys.some((k) => {
      const official = ORDERS.systems[k].stopNames;
      return official.length === d.stopNames.length && official.every((n, i) => n === d.stopNames[i]);
    }),
  }));
  for (const d of report.deferredPatternsAbsent) {
    if (d.presentInBank) report.failures.push(`deferred pattern ${d.course} was shipped without an OSM source`);
  }
  report.composedShortTurnsPresent = {
    '18-takasu-seaside-from-shinurayasu': Boolean(pathBank['18-takasu-seaside-from-shinurayasu']),
    '18-shinurayasu-from-takasu': Boolean(pathBank['18-shinurayasu-from-takasu']),
  };
  if (!report.composedShortTurnsPresent['18-takasu-seaside-from-shinurayasu']
    || !report.composedShortTurnsPresent['18-shinurayasu-from-takasu']) {
    report.failures.push('composed short-turn systems missing from shipped path bank');
  }

  if (report.siblingRelationsUsed.length) {
    report.failures.push(`sibling relations used: ${JSON.stringify(report.siblingRelationsUsed)}`);
  }
  if (report.siblingStopsUsed.length) {
    report.failures.push(`sibling exclusive stops used: ${JSON.stringify(report.siblingStopsUsed)}`);
  }

  report.pass = report.failures.length === 0;
  fs.writeFileSync(path.join(OUT, '_geometry_qa_report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('siblingRelationsUsed', JSON.stringify(report.siblingRelationsUsed));
  console.log('siblingStopsUsed', JSON.stringify(report.siblingStopsUsed));
  console.log('independence (any reverse/slice?)', report.independenceChecks.some((c) => c.isExactReverse || c.isContiguousSlice));
  console.log('deferredPatternsAbsent', JSON.stringify(report.deferredPatternsAbsent));
  console.log('PASS:', report.pass);
  if (report.failures.length) console.error('FAILURES', report.failures);
  if (report.reviewRequired.length) console.log('REVIEW', report.reviewRequired);
  if (!report.pass) process.exit(1);
}

main();
