/**
 * 新浦安駅南口ロータリー内の走行順を、route-18 自身の relation 18352908 の way member から確定する。
 *
 * 出力:
 *  - 18352908 の生ノード列における合流点 288384935 / のりばX / のりばE の index
 *  - ロータリー区間（合流点以降）のノードごとの各のりばへの距離
 *  - 往路短縮便の起点（のりばE発車位置 = 12419760829）の index
 *  - 18417590 の way 列が 18352908 の way 列の連続部分列であることの確認と合流ノード
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, '_rotary_order_analysis.json');

const haversine = (a, b) => {
  const Rr = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR((b.lng ?? b.lon) - (a.lng ?? a.lon));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * Rr * Math.asin(Math.sqrt(h));
};

const load = (id) => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `osm-relation-${id}.json`), 'utf8'));
  const els = j.elements || [];
  return {
    id,
    rel: els.find((e) => e.type === 'relation'),
    nodes: new Map(els.filter((e) => e.type === 'node').map((n) => [n.id, n])),
    ways: new Map(els.filter((e) => e.type === 'way').map((w) => [w.id, w])),
  };
};

const R08 = load(18352908);
const R07 = load(18352907);
const R90 = load(18417590);

const berthProbe = JSON.parse(fs.readFileSync(path.join(DIR, '_shinurayasu_berth_probe.json'), 'utf8'));
const berthByRef = {};
for (const n of berthProbe.shinurayasuBusStops || []) {
  if ((n.tags || {}).name !== '新浦安駅') continue;
  berthByRef[(n.tags || {}).local_ref || '(none)'] = { nodeId: n.id, lat: n.lat, lng: n.lon, note: (n.tags || {}).note || null };
}

const rawSeq = (r) => {
  const seq = [];
  for (const m of (r.rel.members || []).filter((x) => x.type === 'way')) {
    const w = r.ways.get(m.ref);
    if (!w) continue;
    for (const nid of w.nodes || []) {
      const n = r.nodes.get(nid);
      if (n) seq.push({ nodeId: nid, wayId: m.ref, lat: n.lat, lng: n.lon });
    }
  }
  return seq;
};

const s08 = rawSeq(R08);
const s07 = rawSeq(R07);

const wayList = (r) => (r.rel.members || []).filter((m) => m.type === 'way').map((m) => m.ref);
const w08 = wayList(R08);
const w90 = wayList(R90);
const w07 = wayList(R07);

const out = {
  analyzedAt: new Date().toISOString(),
  berths: berthByRef,
  indices: {},
  rotarySection: [],
  nightIsContiguousSublistOf08: null,
  nightAlignment: null,
  divergenceAfterNightPrefix: null,
  outboundShortPlan: null,
  inboundShortPlan: null,
};

const idxOfNode = (seq, nodeId) => seq.findIndex((p) => p.nodeId === nodeId);
const nearest = (seq, pt, from = 0, to = Infinity) => {
  let best = { d: Infinity, index: -1 };
  for (let i = Math.max(0, from); i < Math.min(seq.length, to); i++) {
    const d = haversine(seq[i], pt);
    if (d < best.d) best = { d: Math.round(d * 10) / 10, index: i, nodeId: seq[i].nodeId, wayId: seq[i].wayId };
  }
  return best;
};

out.indices = {
  join288384935_in08: idxOfNode(s08, 288384935),
  join288384935_in07: idxOfNode(s07, 288384935),
  berthEDeparture12419760829_in08: idxOfNode(s08, 12419760829),
  exit3731514483_in08: idxOfNode(s08, 3731514483),
  total08: s08.length,
  total07: s07.length,
  nearestToBerthX_in08: nearest(s08, berthByRef.X),
  nearestToBerthE_in08: nearest(s08, berthByRef.E),
  nearestToBerthH_in07: nearest(s07, berthByRef.H),
};

// ロータリー区間（合流点 → 退出点）のノードごとの各のりばへの距離
const from = out.indices.join288384935_in08;
const to = out.indices.exit3731514483_in08 + 1;
for (let i = from; i < to && i < s08.length; i++) {
  const p = s08[i];
  const row = { index: i, nodeId: p.nodeId, wayId: p.wayId, lat: p.lat, lng: p.lng, dist: {} };
  for (const ref of Object.keys(berthByRef)) row.dist[ref] = Math.round(haversine(p, berthByRef[ref]) * 10) / 10;
  out.rotarySection.push(row);
}

// 18417590 の way 列が 18352908 の way 列の連続部分列か
{
  let found = -1;
  for (let i = 0; i + 1 <= w08.length; i++) {
    let n = 0;
    while (n < w90.length && i + n < w08.length && w08[i + n] === w90[n]) n += 1;
    if (n > (found >= 0 ? 0 : 0) && n >= 5) { found = i; out.nightAlignment = { startIn08: i, matchedLength: n, nightTotal: w90.length }; break; }
  }
  out.nightIsContiguousSublistOf08 = found >= 0;
  if (out.nightAlignment) {
    const k = out.nightAlignment.matchedLength;
    out.divergenceAfterNightPrefix = {
      lastSharedWay: w90[k - 1],
      nightNextWay: w90[k] ?? null,
      throughNextWay: w08[out.nightAlignment.startIn08 + k] ?? null,
      sharedWayIds: w90.slice(0, k),
    };
    const lastWay = R90.ways.get(w90[k - 1]);
    if (lastWay) {
      out.divergenceAfterNightPrefix.lastSharedWayEndNodes = [lastWay.nodes[0], lastWay.nodes[lastWay.nodes.length - 1]];
    }
  }
}

out.outboundShortPlan = {
  course: '0008200288',
  startPlatform: { berth: 'E', nodeId: berthByRef.E.nodeId, attestedBy: [18417590, 18352908] },
  endPlatform: { name: '高洲海浜公園', attestedBy: [18352908] },
  composition: '18417590 の way[0..k-1]（のりばE発車位置から合流ノードまで） + 18352908 の合流ノード以降の残り way',
  equivalentTo: '18352908 の のりばE発車位置（node 12419760829）以降の連続部分',
  usesOnlyRoute18Relations: true,
};

out.inboundShortPlan = {
  course: '0008200287',
  startPlatform: { berth: '03', name: '高洲海浜公園', attestedBy: [18352907] },
  endPlatform: { berth: 'X', nodeId: berthByRef.X.nodeId, note: berthByRef.X.note },
  joinNode: 288384935,
  composition: '18352907 の way[0..合流ノード] + 18352908 の合流ノード以降ロータリー way（のりばXまで）',
  usesOnlyRoute18Relations: true,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');

console.log('indices', JSON.stringify(out.indices, null, 1));
console.log('');
console.log('nightIsContiguousSublistOf08', out.nightIsContiguousSublistOf08, JSON.stringify(out.nightAlignment));
console.log('divergence', JSON.stringify(out.divergenceAfterNightPrefix, null, 1));
console.log('');
console.log('=== ロータリー区間 (合流点288384935 → 退出点3731514483)');
console.log('idx'.padStart(5), 'nodeId'.padStart(13), 'wayId'.padStart(11), '  X    E    F    G    D    C    B    A');
for (const r of out.rotarySection) {
  const d = r.dist;
  console.log(
    String(r.index).padStart(5),
    String(r.nodeId).padStart(13),
    String(r.wayId).padStart(11),
    [d.X, d.E, d.F, d.G, d.D, d.C, d.B, d.A].map((x) => String(x).padStart(5)).join(''),
  );
}
console.log('');
console.log('wrote', OUT);
