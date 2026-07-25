'use strict';
/**
 * Analyze way-to-way connectivity for OSM relations 18381677 (outbound) and 18381676 (inbound).
 * Same rules as maihama v69: startHint from first platform orients first way.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

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
  return (way.nodes || [])
    .map((nid) => {
      const n = nodes.get(nid);
      return n ? { lat: n.lat, lng: n.lon, nodeId: nid } : null;
    })
    .filter(Boolean);
}

function ends(coords) {
  return { first: coords[0], last: coords[coords.length - 1] };
}

function bestJoin(cursor, coords) {
  const fwd = haversine(cursor, coords[0]);
  const revStart = haversine(cursor, coords[coords.length - 1]);
  if (revStart < fwd) return { gap: revStart, flipped: true, nextStart: coords[coords.length - 1] };
  return { gap: fwd, flipped: false, nextStart: coords[0] };
}

function normalizeKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '');
}

function findPlatformByName(platforms, name) {
  const nk = normalizeKey(name);
  for (const p of platforms) {
    const pk = normalizeKey(p.name);
    if (pk === nk || pk.includes(nk) || nk.includes(pk)) return p;
  }
  return null;
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
    });
  }
  return out;
}

function analyzeRelation(relId, startHintStopName) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `osm-relation-${relId}.json`), 'utf8'));
  const elements = j.elements || [];
  const rel = elements.find((e) => e.type === 'relation' && e.id === relId);
  if (!rel) throw new Error(`relation ${relId} missing`);
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  const platforms = platformMembers(rel, nodes);
  const hintPlat = findPlatformByName(platforms, startHintStopName);
  const startHint = hintPlat
    ? { lat: hintPlat.lat, lng: hintPlat.lng, nodeId: hintPlat.platformId, name: hintPlat.name }
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
          connectionStatus: 'MISSING_WAY_ELEMENT',
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
          connectionStatus: 'TOO_FEW_NODES',
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
      let sharedNode = false;

      if (cursor) {
        const join = bestJoin(cursor, coords);
        flipped = join.flipped;
        gap = join.gap;
        if (flipped) coords = coords.slice().reverse();
        nextStart = coords[0];
        sharedNode =
          cursor.nodeId != null
          && nextStart.nodeId != null
          && cursor.nodeId === nextStart.nodeId;
        if (sharedNode) joinStatus = 'SHARED_NODE';
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
        sharedNode,
        highway: way.tags?.highway || null,
        oneway: way.tags?.oneway || null,
        name: way.tags?.name || way.tags?.['name:ja'] || null,
        service: way.tags?.service || null,
        junction: way.tags?.junction || null,
        nodeCount: coords.length,
        connectionStatus: joinStatus,
      });

      cursor = e.last;
      prevEndNode = e.last;
      prevWayId = m.ref;
    }

    return {
      label,
      relationId: relId,
      startHintStopName: hint ? startHintStopName : null,
      startHintPlatformId: hint ? hint.nodeId : null,
      startHintOsmName: hint ? hint.name : null,
      wayMemberCount: wayMembers.length,
      connections,
      maxGap_m: Math.round(maxGap * 10) / 10,
      maxGapPair: maxGapRow,
      gapsOver1m: connections.filter((c) => c.connectionStatus === 'GAP_OVER_1M'),
    };
  }

  const before = analyze('no-startHint', null);
  const after = analyze(`startHint-${startHintStopName}`, startHint);

  fs.writeFileSync(path.join(OUT, `_way_connectivity_${relId}.json`), JSON.stringify(before, null, 2));
  fs.writeFileSync(
    path.join(OUT, `_way_connectivity_${relId}_after_hint.json`),
    JSON.stringify(after, null, 2),
  );

  for (const report of [before, after]) {
    console.log('---', relId, report.label, '---');
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
        'sharedNode',
        g.sharedNode,
        g.name || '',
        g.highway,
      );
    }
  }

  return { before, after };
}

const r57 = analyzeRelation(18381677, '浦安駅入口');
const r56 = analyzeRelation(18381676, '舞浜駅');

const blockers = [];
for (const [id, pack] of [
  [18381677, r57],
  [18381676, r56],
]) {
  if (pack.after.gapsOver1m.length) {
    blockers.push(
      `${id} after startHint still has ${pack.after.gapsOver1m.length} gap(s) >1m — STOP, do not invent straight joins`,
    );
  }
}

if (blockers.length) {
  console.error('BLOCKERS', blockers);
  process.exitCode = 1;
} else {
  console.log('OK: all joins sharedNode or ≤1m after startHint');
}
