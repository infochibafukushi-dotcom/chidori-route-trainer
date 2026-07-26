/**
 * 短縮便2便の道路出典を確定するための追加 Overpass 調査。
 *
 * A. ref=18 / network=明海・高洲線 / name~18系統 の relation をより広く再探索
 *    （短縮便専用 relation が存在しないことの再確認）
 * B. 新浦安駅 の highway=bus_stop ノードを local_ref つきで全列挙
 * C. それらノードを含む bus route relation を role つきで取得し、
 *    「新浦安駅止まりの便がどのノードに platform_exit_only で着くか」を実データで確定
 *
 * リクエストは全てタイムアウト付き、各ステップごとにチェックポイント保存する。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const OUT = path.join(DIR, '_shinurayasu_berth_probe.json');
const REQUEST_TIMEOUT_MS = 120000;

const HOSTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const state = {
  probedAt: new Date().toISOString(),
  steps: [],
  refProbeWide: null,
  networkProbe: null,
  nameProbe: null,
  shinurayasuBusStops: null,
  relationsAtShinurayasu: null,
  exitOnlyUsage: null,
  errors: [],
};

const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 1), 'utf8');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'chidori-route-trainer/route18-berth-probe',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} ${data.slice(0, 200)}`)); return; }
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`bad json: ${e.message}`)); }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function query(label, ql) {
  for (const host of HOSTS) {
    try {
      process.stdout.write(`[${label}] ${host} ... `);
      const j = await post(host, `data=${encodeURIComponent(ql)}`);
      const n = (j.elements || []).length;
      console.log(`ok ${n} elements`);
      state.steps.push({ label, host, ok: true, elements: n });
      save();
      return j;
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      state.steps.push({ label, host, ok: false, error: e.message });
      state.errors.push(`${label}@${host}: ${e.message}`);
      save();
    }
  }
  return null;
}

const BBOX = '35.6300,139.8850,35.6800,139.9450';

(async () => {
  // A. 広めの ref=18 / network / name 再探索
  const a1 = await query('refProbeWide', `[out:json][timeout:180];
relation["type"="route"]["route"="bus"]["ref"="18"](${BBOX});
out tags;`);
  if (a1) {
    state.refProbeWide = (a1.elements || []).map((e) => ({ id: e.id, tags: e.tags }));
    save();
  }

  const a2 = await query('networkProbe', `[out:json][timeout:180];
relation["type"="route"]["network"="明海・高洲線"];
out tags;`);
  if (a2) {
    state.networkProbe = (a2.elements || []).map((e) => ({ id: e.id, tags: e.tags }));
    save();
  }

  const a3 = await query('nameProbe', `[out:json][timeout:180];
relation["type"="route"]["route"="bus"]["name"~"18系統"](${BBOX});
out tags;`);
  if (a3) {
    state.nameProbe = (a3.elements || []).map((e) => ({ id: e.id, tags: e.tags }));
    save();
  }

  // B. 新浦安駅 の bus_stop ノード全列挙
  const b = await query('shinurayasuBusStops', `[out:json][timeout:180];
node["highway"="bus_stop"]["name"~"新浦安駅"](35.6440,139.9050,35.6580,139.9250);
out body;`);
  if (b) {
    state.shinurayasuBusStops = (b.elements || []).map((e) => ({
      id: e.id, lat: e.lat, lon: e.lon, tags: e.tags,
    })).sort((x, y) => String((x.tags || {}).local_ref || '').localeCompare(String((y.tags || {}).local_ref || '')));
    save();
    console.log('  新浦安駅 bus_stop nodes:');
    for (const n of state.shinurayasuBusStops) {
      console.log('   ', n.id, 'local_ref=', (n.tags || {}).local_ref, (n.tags || {}).name, n.lat, n.lon);
    }
  }

  // C. それらノードを使う bus relation を role つきで取得
  if (state.shinurayasuBusStops && state.shinurayasuBusStops.length) {
    const ids = state.shinurayasuBusStops.map((n) => n.id).join(',');
    const c = await query('relationsAtShinurayasu', `[out:json][timeout:240];
node(id:${ids})->.stops;
relation(bn.stops)["type"="route"]["route"="bus"];
out body;`);
    if (c) {
      const rels = (c.elements || []).filter((e) => e.type === 'relation');
      const stopIds = new Set(state.shinurayasuBusStops.map((n) => n.id));
      const byNode = {};
      state.relationsAtShinurayasu = rels.map((r) => {
        const hits = (r.members || [])
          .map((m, i) => ({ ...m, memberIndex: i }))
          .filter((m) => m.type === 'node' && stopIds.has(m.ref));
        const platformMembers = (r.members || []).filter((m) => m.type === 'node' && /platform/.test(m.role));
        for (const h of hits) {
          byNode[h.ref] = byNode[h.ref] || [];
          byNode[h.ref].push({
            relation: r.id,
            ref: (r.tags || {}).ref,
            name: (r.tags || {}).name,
            role: h.role,
            platformIndex: platformMembers.findIndex((m) => m.ref === h.ref),
            platformCount: platformMembers.length,
            isFirstPlatform: platformMembers.length > 0 && platformMembers[0].ref === h.ref,
            isLastPlatform: platformMembers.length > 0
              && platformMembers[platformMembers.length - 1].ref === h.ref,
          });
        }
        return {
          id: r.id,
          ref: (r.tags || {}).ref,
          name: (r.tags || {}).name,
          network: (r.tags || {}).network,
          operator: (r.tags || {}).operator,
          shinurayasuHits: hits.map((h) => ({ nodeId: h.ref, role: h.role })),
          firstPlatform: platformMembers.length ? platformMembers[0].ref : null,
          lastPlatform: platformMembers.length ? platformMembers[platformMembers.length - 1].ref : null,
          platformCount: platformMembers.length,
        };
      });
      state.exitOnlyUsage = byNode;
      save();

      console.log('');
      console.log('  --- 新浦安駅ノードごとの利用 relation（role / 最終platformか）');
      for (const nodeId of Object.keys(byNode)) {
        const stop = state.shinurayasuBusStops.find((n) => String(n.id) === String(nodeId));
        const lr = stop ? (stop.tags || {}).local_ref : '?';
        console.log(`   node ${nodeId} (local_ref=${lr}) 利用 ${byNode[nodeId].length} relation`);
        for (const u of byNode[nodeId]) {
          console.log(`      rel ${u.relation} ref=${u.ref} role=${u.role} first=${u.isFirstPlatform} last=${u.isLastPlatform} :: ${u.name}`);
        }
      }
    }
  }

  save();
  console.log('');
  console.log('wrote', OUT);
})();
