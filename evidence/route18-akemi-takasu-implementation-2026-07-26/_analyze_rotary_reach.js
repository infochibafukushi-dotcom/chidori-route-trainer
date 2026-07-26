/**
 * 新浦安駅ロータリーの到達性検査。
 *
 * 問い: 復路短縮便（course 0008200287・高洲海浜公園→新浦安駅止まり）の終着地点を
 *       route-18 自身の relation（18352907 / 18352908 / 18417590）の way だけで表現できるか。
 *
 * 検査:
 *  1. のりばX（node 8415001163・note=降車専用）が route-18 の各relation path の
 *     どの点に何m まで近づくか
 *  2. のりばH（8415001143）・のりばE（8415001161）についても同じ
 *  3. 18352907 と 18352908 の共有ノード（合流可能点）を列挙し、
 *     高洲方面→ロータリー進入の分岐点が route-18 relation 内に存在するか
 *  4. 入船中央エステートの platform が 18352907 path 上のどこか（分岐点との前後関係）
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, '_rotary_reach_analysis.json');

const haversine = (a, b) => {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR((b.lng ?? b.lon) - (a.lng ?? a.lon));
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const load = (id) => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `osm-relation-${id}.json`), 'utf8'));
  const els = j.elements || [];
  const rel = els.find((e) => e.type === 'relation');
  const nodes = new Map(els.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  const ways = new Map(els.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  return { id, rel, nodes, ways };
};

const R = { 18352908: load(18352908), 18352907: load(18352907), 18417590: load(18417590) };

// 参照する新浦安駅ののりば座標（_shinurayasu_berth_probe.json から）
const berthProbe = JSON.parse(fs.readFileSync(path.join(DIR, '_shinurayasu_berth_probe.json'), 'utf8'));
const BERTHS = {};
for (const n of berthProbe.shinurayasuBusStops || []) {
  const lr = (n.tags || {}).local_ref || '(none)';
  BERTHS[`${(n.tags || {}).name}-${lr}`] = { nodeId: n.id, lat: n.lat, lng: n.lon, note: (n.tags || {}).note || null, operator: (n.tags || {}).operator || null };
}

const out = {
  analyzedAt: new Date().toISOString(),
  berths: BERTHS,
  berthProximity: {},
  wayNodeMembership: {},
  sharedNodes: {},
  irifuneRelativePosition: null,
};

// 各 relation の way member を順に、ノード座標列として展開（densify しない生ノード列）
const rawNodeSeq = (r) => {
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

const seqs = {};
for (const id of Object.keys(R)) seqs[id] = rawNodeSeq(R[id]);

// 1-2. のりばごとの最近接距離
for (const bk of Object.keys(BERTHS)) {
  const b = BERTHS[bk];
  out.berthProximity[bk] = {};
  for (const id of Object.keys(seqs)) {
    let best = { d: Infinity, nodeId: null, wayId: null };
    for (const p of seqs[id]) {
      const d = haversine(p, b);
      if (d < best.d) best = { d: Math.round(d * 10) / 10, nodeId: p.nodeId, wayId: p.wayId };
    }
    out.berthProximity[bk][id] = best;
  }
}

// 3. relation 間の共有ノード（合流可能点）
const nodeSetOf = (id) => new Set(seqs[id].map((p) => p.nodeId));
const pairs = [['18352907', '18352908'], ['18352907', '18417590'], ['18352908', '18417590']];
for (const [a, b] of pairs) {
  const sa = nodeSetOf(a);
  const sb = nodeSetOf(b);
  const shared = [...sa].filter((n) => sb.has(n));
  out.sharedNodes[`${a}&${b}`] = {
    count: shared.length,
    nodeIds: shared,
    detail: shared.map((n) => {
      const pa = seqs[a].filter((p) => p.nodeId === n);
      const pb = seqs[b].filter((p) => p.nodeId === n);
      return {
        nodeId: n,
        lat: pa[0].lat,
        lng: pa[0].lng,
        inA: pa.map((p) => ({ wayId: p.wayId, index: seqs[a].indexOf(p) })),
        inB: pb.map((p) => ({ wayId: p.wayId, index: seqs[b].indexOf(p) })),
      };
    }),
  };
}

// 4. 入船中央エステート platform の 18352907 上の位置と、共有ノード 288384935 の位置関係
const platformOf = (r, nameNeedle) => {
  for (const m of (r.rel.members || []).filter((x) => x.type === 'node' && /platform/.test(x.role))) {
    const n = r.nodes.get(m.ref);
    if (n && n.tags && n.tags.name && n.tags.name.includes(nameNeedle)) {
      return { nodeId: m.ref, role: m.role, lat: n.lat, lng: n.lon, name: n.tags.name, local_ref: n.tags.local_ref || null };
    }
  }
  return null;
};

const irifune07 = platformOf(R[18352907], '入船中央エステート');
const shinH = platformOf(R[18352907], '新浦安駅');
const nearestIdx = (id, p) => {
  let best = { d: Infinity, index: -1, nodeId: null, wayId: null };
  seqs[id].forEach((q, i) => {
    const d = haversine(q, p);
    if (d < best.d) best = { d: Math.round(d * 10) / 10, index: i, nodeId: q.nodeId, wayId: q.wayId };
  });
  return best;
};
out.irifuneRelativePosition = {
  irifunePlatform: irifune07,
  shinurayasuPlatformIn18352907: shinH,
  irifuneNearestOn18352907: irifune07 ? nearestIdx('18352907', irifune07) : null,
  shinurayasuNearestOn18352907: shinH ? nearestIdx('18352907', shinH) : null,
  junction288384935IndexIn18352907: seqs['18352907'].findIndex((p) => p.nodeId === 288384935),
  junction288384935IndexIn18352908: seqs['18352908'].findIndex((p) => p.nodeId === 288384935),
  totalNodes18352907: seqs['18352907'].length,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');

console.log('=== のりば → route-18 relation path 最近接距離 (m)');
const order = ['18352907', '18352908', '18417590'];
console.log('berth'.padEnd(22), order.map((o) => o.padStart(12)).join(''));
for (const bk of Object.keys(out.berthProximity)) {
  const row = order.map((o) => String(out.berthProximity[bk][o].d).padStart(12)).join('');
  const note = BERTHS[bk].note ? ` note=${BERTHS[bk].note}` : '';
  console.log(bk.padEnd(22), row, note);
}
console.log('');
console.log('=== 18352907 と 18352908 の共有ノード', out.sharedNodes['18352907&18352908'].count);
for (const d of out.sharedNodes['18352907&18352908'].detail) {
  console.log('  node', d.nodeId, d.lat, d.lng, 'A(07)', JSON.stringify(d.inA.map((x) => x.index)), 'B(08)', JSON.stringify(d.inB.map((x) => x.index)));
}
console.log('');
console.log('=== 入船中央エステート / 新浦安駅H / 分岐点 288384935 の 18352907 上の位置');
console.log(JSON.stringify(out.irifuneRelativePosition, null, 1));
console.log('');
console.log('wrote', OUT);
