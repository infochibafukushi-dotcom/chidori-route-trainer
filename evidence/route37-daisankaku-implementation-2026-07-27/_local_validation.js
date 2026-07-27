'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

const ROUTE9_STOPS = ['浦安駅入口', 'フラワー通り', '堀江三丁目', '南小入口', '東野一丁目', '東野プール', '東海大浦安高校入口'];
const ROUTE9_RELATIONS = [18320323, 3498220, 18419884, 18419885];

const files = {
  loader: fs.readFileSync(path.join(ROOT, 'route-assets-loader.js'), 'utf8'),
  sw: fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'),
  route: fs.readFileSync(path.join(ROOT, 'daisankaku-line-route-v1.js'), 'utf8'),
  route9path: fs.readFileSync(path.join(ROOT, 'maihama-line-path-v1.js'), 'utf8'),
};

const ctx = { window: {}, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } } };
ctx.window = ctx;
const load = (name) => {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), 'utf8'), ctx, { filename: name });
};

load('daisankaku-line-platforms-v1.js');
load('daisankaku-line-path-v1.js');
load('daisankaku-line-path-policy-v1.js');
load('maihama-line-path-v1.js');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

ok('PACKS route-37', /'route-37'\s*:/.test(files.loader) && /daisankaku-line-route-v1\.js\?v=117/.test(files.loader));
ok('CACHE v119', /chidori-route-map-v119/.test(files.sw));
ok('loader v119', /route-assets-loader\.js\?v=119/.test(files.sw));
ok('globals platforms', !!ctx.window.DAISANKAKU_LINE_PLATFORMS_V1);
ok('globals path', !!ctx.window.DAISANKAKU_LINE_PATH_V1);
ok('globals policy', !!ctx.window.DAISANKAKU_LINE_PATH_POLICY_V1);
ok('7 systems path', Object.keys(ctx.window.DAISANKAKU_LINE_PATH_V1).length === 7);
ok('7 systems platforms', Object.keys(ctx.window.DAISANKAKU_LINE_PLATFORMS_V1).length === 7);
ok('build no blockers', (BUILD.blockers || []).length === 0, JSON.stringify(BUILD.blockers));
ok('pathHash distinct', BUILD.pathHashDistinct === true);

const policy = ctx.window.DAISANKAKU_LINE_PATH_POLICY_V1;
for (const [key, data] of Object.entries(ctx.window.DAISANKAKU_LINE_PATH_V1)) {
  const names = ORDERS.systems[key]?.stopNames || [];
  ok(`${key} stop count`, data.pathPoints.length >= 80 && names.length === ORDERS.systems[key].stopCount);
  const v = policy.validateRuntimePath({
    systemKey: key,
    path: data.pathPoints,
    pathHash: data.pathHash,
    expectedPathHash: data.pathHash,
    resolvedVersion: data.resolvedVersion,
    expectedResolvedVersion: data.resolvedVersion,
    directionGroup: ORDERS.systems[key].directionGroup,
    pathSource: data.pathSource,
  });
  ok(`${key} policy`, v.ok, v.reasons?.join(';'));
}

ok('maihama vs tds split', (() => {
  const a = ctx.window.DAISANKAKU_LINE_PATH_V1['37-minamigyotoku-maihama'].pathHash;
  const b = ctx.window.DAISANKAKU_LINE_PATH_V1['37-minamigyotoku-tds'].pathHash;
  return a !== b;
})());

const route9Hashes = new Set(Object.values(ctx.window.MAIHAMA_LINE_PATH_V1 || {}).map((d) => d.pathHash));
const overlap9 = Object.entries(ctx.window.DAISANKAKU_LINE_PATH_V1)
  .filter(([, d]) => route9Hashes.has(d.pathHash))
  .map(([k]) => k);
ok('9-vs-37 pathHash separation', overlap9.length === 0, overlap9.join(','));

const route9StopLeak = Object.values(ctx.window.DAISANKAKU_LINE_PLATFORMS_V1)
  .flatMap((p) => Object.keys(p))
  .filter((n) => ROUTE9_STOPS.includes(n));
ok('9-vs-37 stop separation', route9StopLeak.length === 0, route9StopLeak.join(','));

const usedRelations = new Set(Object.values(ctx.window.DAISANKAKU_LINE_PATH_V1).map((d) => d.relationId));
const forbiddenRelHit = [...usedRelations].filter((id) => ROUTE9_RELATIONS.includes(id));
ok('9-vs-37 OSM relation separation', forbiddenRelHit.length === 0, forbiddenRelHit.join(','));

ok('route module API', /DAISANKAKU_LINE_ROUTE_V1/.test(files.route) && /route-37/.test(files.route));

const report = {
  validatedAt: new Date().toISOString(),
  routeId: 'route-37',
  versionChoice: 'v117 PACKS for route-37; SW/loader v119 (route-38 already at v118 in e6c78d5)',
  checks,
  pass: checks.every((c) => c.pass),
};
fs.writeFileSync(path.join(OUT, '_local_validation_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
