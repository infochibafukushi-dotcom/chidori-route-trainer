/**
 * 合流ノードでの進行方向の合法性を OSM で確認する。
 *
 * 復路短縮便は 18352907（高洲方面→シンボルロード）でノード 288384935 に到達し、
 * そこから 18352908 のロータリー進入 way 720406629 に入る想定。
 * この movement を禁じる turn restriction が存在しないことを確認する。
 *
 * 併せて、ロータリー進入・のりばX到達に使う way のタグを完全取得する。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const OUT = path.join(DIR, '_turn_restriction_probe.json');
const REQUEST_TIMEOUT_MS = 120000;
const HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const JUNCTION_NODES = [288384935, 3731514483, 288796885, 12419760829, 288384996, 1312776534];
const ROTARY_WAYS = [720406629, 906161755, 906161756, 720406628, 1338996609, 1342409929, 1338975833];

const state = { probedAt: new Date().toISOString(), steps: [], restrictions: null, wayTags: null, errors: [] };
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
        'User-Agent': 'chidori-route-trainer/route18-turn-probe',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
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
      console.log(`ok ${(j.elements || []).length}`);
      state.steps.push({ label, host, ok: true, elements: (j.elements || []).length });
      save();
      return j;
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      state.steps.push({ label, host, ok: false, error: e.message });
      state.errors.push(`${label}: ${e.message}`);
      save();
    }
  }
  return null;
}

(async () => {
  const r = await query('turnRestrictions', `[out:json][timeout:120];
node(id:${JUNCTION_NODES.join(',')})->.j;
way(id:${ROTARY_WAYS.join(',')})->.w;
(
  relation(bn.j)["type"="restriction"];
  relation(bw.w)["type"="restriction"];
);
out body;`);
  if (r) {
    state.restrictions = (r.elements || [])
      .filter((e) => e.type === 'relation')
      .map((e) => ({ id: e.id, tags: e.tags, members: e.members }));
    save();
    console.log('  restrictions found:', state.restrictions.length);
    for (const x of state.restrictions) {
      console.log('   rel', x.id, JSON.stringify(x.tags), 'members', JSON.stringify(x.members));
    }
  }

  const w = await query('wayTags', `[out:json][timeout:120];
way(id:${ROTARY_WAYS.join(',')});
out tags;`);
  if (w) {
    state.wayTags = (w.elements || []).map((e) => ({ id: e.id, tags: e.tags }));
    save();
    console.log('');
    console.log('  way tags:');
    for (const x of state.wayTags) console.log('   ', x.id, JSON.stringify(x.tags));
  }

  save();
  console.log('');
  console.log('wrote', OUT);
})();
