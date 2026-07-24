'use strict';
/**
 * Analyze way-to-way connectivity for OSM relation 18320323 (9-maihama outbound).
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const REL_ID = 18320323;

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

function wayCoords(way, nodes) {
  return (way.nodes || []).map((nid) => {
    const n = nodes.get(nid);
    return n ? { lat: n.lat, lng: n.lon, nodeId: nid } : null;
  }).filter(Boolean);
}

function ends(coords) {
  return { first: coords[0], last: coords[coords.length - 1] };
}

function bestJoin(cursor, coords) {
  const fwd = haversine(cursor, coords[0]);
  const revStart = haversine(cursor, coords[coords.length - 1]);
  // After flip, start is last node
  if (revStart < fwd) return { gap: revStart, flipped: true, nextStart: coords[coords.length - 1] };
  return { gap: fwd, flipped: false, nextStart: coords[0] };
}

const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${REL_ID}.json`), 'utf8'));
const elements = j.elements || [];
const rel = elements.find((e) => e.type === 'relation' && e.id === REL_ID);
const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));

/** 浦安駅入口 platform E — orients first spur toward shared node 747616973 */
const START_HINT_NODE = 2288028442;
const hintNode = nodes.get(START_HINT_NODE);
const startHint = hintNode
  ? { lat: hintNode.lat, lng: hintNode.lon, nodeId: START_HINT_NODE }
  : null;

function analyze(label, hint) {
  const wayMembers = (rel.members || []).filter((m) => m.type === 'way');
  const connections = [];
  let cursor = null;
  let prevWayId = null;
  let prevEndNode = null;
  let maxGap = 0;
  let maxGapRow = null;

  for (let i = 0; i < wayMembers.length; i++) {
    const m = wayMembers[i];
    const way = ways.get(m.ref);
    if (!way) {
      connections.push({
        index: i,
        prevWayId,
        nextWayId: m.ref,
        status: 'MISSING_WAY_ELEMENT',
        gap_m: null,
      });
      continue;
    }
    let coords = wayCoords(way, nodes);
    if (coords.length < 2) {
      connections.push({
        index: i,
        prevWayId,
        nextWayId: m.ref,
        status: 'TOO_FEW_NODES',
        gap_m: null,
        tags: way.tags || {},
      });
      continue;
    }

    let flipped = false;
    let gap = 0;
    let joinStatus = 'FIRST';
    let prevEnd = prevEndNode;
    let nextStart = coords[0];

    if (cursor) {
      const join = bestJoin(cursor, coords);
      flipped = join.flipped;
      gap = join.gap;
      if (flipped) coords = coords.slice().reverse();
      nextStart = coords[0];
      const shared = cursor.nodeId != null && nextStart.nodeId != null && cursor.nodeId === nextStart.nodeId;
      if (shared) joinStatus = 'SHARED_NODE';
      else if (gap <= 1) joinStatus = 'NEAR_1M';
      else joinStatus = 'GAP_OVER_1M';
      if (gap > maxGap) {
        maxGap = gap;
        maxGapRow = { index: i, prevWayId, nextWayId: m.ref, gap };
      }
    } else if (hint) {
      const fwd = haversine(hint, coords[0]);
      const rev = haversine(hint, coords[coords.length - 1]);
      flipped = rev < fwd;
      if (flipped) coords = coords.slice().reverse();
      nextStart = coords[0];
      joinStatus = 'FIRST_STARTHINT';
    }

    const e = ends(coords);
    connections.push({
      index: i,
      prevWayId,
      nextWayId: m.ref,
      prevWayEndNode: prevEnd ? prevEnd.nodeId : null,
      prevWayEnd: prevEnd ? { lat: prevEnd.lat, lng: prevEnd.lng } : null,
      nextWayStartNode: nextStart.nodeId,
      nextWayStart: { lat: nextStart.lat, lng: nextStart.lng },
      nextWayEndNode: e.last.nodeId,
      gap_m: Math.round(gap * 1000) / 1000,
      flipped,
      highway: way.tags?.highway || null,
      oneway: way.tags?.oneway || null,
      name: way.tags?.name || way.tags?.['name:ja'] || null,
      service: way.tags?.service || null,
      junction: way.tags?.junction || null,
      nodeCount: coords.length,
      connection: joinStatus,
    });

    cursor = e.last;
    prevEndNode = e.last;
    prevWayId = m.ref;
  }

  return {
    label,
    relationId: REL_ID,
    startHintNodeId: hint ? START_HINT_NODE : null,
    wayMemberCount: wayMembers.length,
    connections,
    maxGap_m: Math.round(maxGap * 10) / 10,
    maxGapPair: maxGapRow,
    gapsOver1m: connections.filter((c) => c.connection === 'GAP_OVER_1M'),
  };
}

const before = analyze('no-startHint', null);
const after = analyze('startHint-urayasu-E', startHint);

fs.writeFileSync(path.join(OUT, '_way_connectivity_18320323.json'), JSON.stringify(before, null, 2));
fs.writeFileSync(path.join(OUT, '_way_connectivity_18320323_after_fix.json'), JSON.stringify(after, null, 2));

for (const report of [before, after]) {
  console.log('---', report.label, '---');
  console.log('wayMembers', report.wayMemberCount);
  console.log('maxGap', report.maxGap_m, 'pair', report.maxGapPair);
  console.log('gapsOver1m', report.gapsOver1m.length);
  for (const g of report.gapsOver1m) {
    console.log(
      'GAP',
      g.prevWayId,
      '->',
      g.nextWayId,
      g.gap_m + 'm',
      'flipped',
      g.flipped,
      g.name || '',
      g.highway,
      '@',
      g.prevWayEnd,
      '->',
      g.nextWayStart,
    );
  }
}
