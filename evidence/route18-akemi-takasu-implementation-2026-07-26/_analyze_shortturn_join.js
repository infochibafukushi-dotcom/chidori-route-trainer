/**
 * route-18 短縮便（course 0008200288 / 0008200287）の道路出典を OSM 実データから判定する。
 *
 * 目的:
 *  1. 新浦安駅の platform node が relation ごとに同一か別かを確定する
 *     （18417590 = のりばE始発 / 18352908 = 通過 / 18352907 = 通過）
 *  2. 同一でない場合、のりばE発の 18417590 と通し便 18352908 が合流する node を特定し、
 *     合流点以降の way 列が完全一致するかを検査する（approach C の前提条件）
 *  3. 逆方向（高洲海浜公園→新浦安駅）は 18352907 の起点が短縮便と同じのりば03のため、
 *     終点=新浦安駅 の到着 platform / 分岐点を特定する
 *
 * 出典のみを使い、推測は一切しない。判定結果は JSON に落とす。
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, '_shortturn_join_analysis.json');

const load = (id) => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `osm-relation-${id}.json`), 'utf8'));
  const els = j.elements || [];
  const rel = els.find((e) => e.type === 'relation');
  const nodes = new Map();
  const ways = new Map();
  for (const e of els) {
    if (e.type === 'node') nodes.set(e.id, e);
    if (e.type === 'way') ways.set(e.id, e);
  }
  return { id, rel, nodes, ways };
};

const R = {
  18352908: load(18352908),
  18352907: load(18352907),
  18417590: load(18417590),
};

const platformsOf = (r) => r.rel.members
  .filter((m) => m.type === 'node' && /platform/.test(m.role))
  .map((m, i) => {
    const n = r.nodes.get(m.ref);
    return {
      index: i,
      nodeId: m.ref,
      role: m.role,
      name: n && n.tags ? (n.tags.name || null) : null,
      lat: n ? n.lat : null,
      lon: n ? n.lon : null,
      tags: n && n.tags ? n.tags : null,
    };
  });

const wayIdsOf = (r) => r.rel.members
  .filter((m) => m.type === 'way' && (!m.role || m.role === ''))
  .map((m) => m.ref);

const out = {
  analyzedAt: new Date().toISOString(),
  purpose: '短縮便2便（0008200288 / 0008200287）の道路出典判定',
  platforms: {},
  wayOrder: {},
  shinurayasuPlatformIdentity: null,
  joinAnalysis: {},
};

for (const id of Object.keys(R)) {
  const r = R[id];
  out.platforms[id] = platformsOf(r);
  const wids = wayIdsOf(r);
  out.wayOrder[id] = wids.map((w) => {
    const way = r.ways.get(w);
    return {
      wayId: w,
      name: way && way.tags ? (way.tags.name || null) : null,
      highway: way && way.tags ? (way.tags.highway || null) : null,
      oneway: way && way.tags ? (way.tags.oneway || null) : null,
      bus: way && way.tags ? (way.tags.bus || null) : null,
      psv: way && way.tags ? (way.tags.psv || null) : null,
      firstNode: way ? way.nodes[0] : null,
      lastNode: way ? way.nodes[way.nodes.length - 1] : null,
      nodeCount: way ? way.nodes.length : 0,
    };
  });
}

// 新浦安駅の platform node が relation 間で同一かを確認
const shin = {};
for (const id of Object.keys(R)) {
  const hits = out.platforms[id].filter((p) => p.name && p.name.includes('新浦安駅'));
  shin[id] = hits.map((h) => ({ index: h.index, nodeId: h.nodeId, role: h.role, lat: h.lat, lon: h.lon, tags: h.tags }));
}
out.shinurayasuPlatformIdentity = {
  perRelation: shin,
  sameNodeAcrossAll: (() => {
    const ids = Object.keys(shin).map((k) => (shin[k][0] ? shin[k][0].nodeId : null));
    return new Set(ids).size === 1 && ids[0] !== null;
  })(),
};

// way 列の共通部分（接尾/接頭）を求める
const wl = (id) => out.wayOrder[id].map((w) => w.wayId);

const commonSuffix = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return a.slice(a.length - n);
};
const commonPrefix = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return a.slice(0, n);
};

// 往路短縮: のりばE発（18417590 の前半） + 高洲海浜公園方向（18352908 の後半）
{
  const night = wl(18417590);
  const through = wl(18352908);
  const shared = night.filter((w) => through.includes(w));
  out.joinAnalysis.outboundShort = {
    course: '0008200288',
    nightWays: night.length,
    throughWays: through.length,
    sharedWayIds: shared,
    sharedCount: shared.length,
    nightIndexOfShared: shared.map((w) => night.indexOf(w)),
    throughIndexOfShared: shared.map((w) => through.indexOf(w)),
  };
}

// 復路短縮: のりば03発（18352907 と同じ起点） → 新浦安駅止まり
{
  const inbound = wl(18352907);
  const night = wl(18417590);
  out.joinAnalysis.inboundShort = {
    course: '0008200287',
    inboundWays: inbound.length,
    sharedWithNight: inbound.filter((w) => night.includes(w)),
  };
}

// 参考: 3 relation 間の共通接頭/接尾
out.joinAnalysis.pairwise = {};
const ids = [18352908, 18352907, 18417590];
for (const a of ids) {
  for (const b of ids) {
    if (a === b) continue;
    out.joinAnalysis.pairwise[`${a}->${b}`] = {
      commonPrefix: commonPrefix(wl(a), wl(b)),
      commonSuffix: commonSuffix(wl(a), wl(b)),
    };
  }
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');

// 人が読む用の要約
console.log('--- 新浦安駅 platform node');
for (const id of Object.keys(shin)) {
  console.log(' ', id, JSON.stringify(shin[id]));
}
console.log('sameNodeAcrossAll', out.shinurayasuPlatformIdentity.sameNodeAcrossAll);
console.log('');
console.log('--- 往路短縮 (0008200288) 18417590 vs 18352908');
const ob = out.joinAnalysis.outboundShort;
console.log('  nightWays', ob.nightWays, 'throughWays', ob.throughWays, 'shared', ob.sharedCount);
console.log('  shared wayIds', JSON.stringify(ob.sharedWayIds));
console.log('  night idx', JSON.stringify(ob.nightIndexOfShared));
console.log('  through idx', JSON.stringify(ob.throughIndexOfShared));
console.log('');
console.log('--- 復路短縮 (0008200287)');
console.log('  inboundWays', out.joinAnalysis.inboundShort.inboundWays,
  'sharedWithNight', JSON.stringify(out.joinAnalysis.inboundShort.sharedWithNight));
console.log('');
console.log('--- 18417590 way order (のりばE発)');
for (const w of out.wayOrder[18417590]) {
  console.log('   ', w.wayId, w.name, '|', w.highway, '| oneway', w.oneway, '| bus', w.bus, '| n', w.nodeCount, w.firstNode, '->', w.lastNode);
}
console.log('');
console.log('--- 18352908 way order (浦安駅入口発 通し)');
out.wayOrder[18352908].forEach((w, i) => {
  console.log('   ', i, w.wayId, w.name, '|', w.highway, '| oneway', w.oneway, '| bus', w.bus, '| n', w.nodeCount, w.firstNode, '->', w.lastNode);
});
console.log('');
console.log('--- 18352907 way order (高洲海浜公園発 通し)');
out.wayOrder[18352907].forEach((w, i) => {
  console.log('   ', i, w.wayId, w.name, '|', w.highway, '| oneway', w.oneway, '| bus', w.bus, '| n', w.nodeCount, w.firstNode, '->', w.lastNode);
});
console.log('');
console.log('wrote', OUT);
