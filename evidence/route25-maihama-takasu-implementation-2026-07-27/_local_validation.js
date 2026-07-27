'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));

const files = {
  loader: fs.readFileSync(path.join(ROOT, 'route-assets-loader.js'), 'utf8'),
  sw: fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'),
  route: fs.readFileSync(path.join(ROOT, 'maihama-takasu-line-route-v1.js'), 'utf8'),
  policy: fs.readFileSync(path.join(ROOT, 'maihama-takasu-line-path-policy-v1.js'), 'utf8'),
};

const ctx = { window: {}, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } } };
ctx.window = ctx;
const load = (name) => {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  vm.runInNewContext(src, ctx, { filename: name });
};

load('maihama-takasu-line-platforms-v1.js');
load('maihama-takasu-line-path-v1.js');
load('maihama-takasu-line-path-policy-v1.js');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

ok('PACKS route-25', /'route-25'\s*:/.test(files.loader) && /maihama-takasu-line-route-v1\.js\?v=116/.test(files.loader));
ok('CACHE v116', /chidori-route-map-v116/.test(files.sw));
ok('loader v116', /route-assets-loader\.js\?v=116/.test(files.sw));
ok('globals platforms', !!ctx.window.MAIHAMA_TAKASU_LINE_PLATFORMS_V1);
ok('globals path', !!ctx.window.MAIHAMA_TAKASU_LINE_PATH_V1);
ok('globals policy', !!ctx.window.MAIHAMA_TAKASU_LINE_PATH_POLICY_V1);
ok('4 systems path', Object.keys(ctx.window.MAIHAMA_TAKASU_LINE_PATH_V1).length === 4);
ok('4 systems platforms', Object.keys(ctx.window.MAIHAMA_TAKASU_LINE_PLATFORMS_V1).length === 4);
ok('build no blockers', (BUILD.blockers || []).length === 0, JSON.stringify(BUILD.blockers));
ok('pathHash distinct', BUILD.pathHashDistinct === true);

const policy = ctx.window.MAIHAMA_TAKASU_LINE_PATH_POLICY_V1;
for (const [key, data] of Object.entries(ctx.window.MAIHAMA_TAKASU_LINE_PATH_V1)) {
  const names = ORDERS.systems[key]?.stopNames || [];
  ok(`${key} stop count`, data.pathPoints.length >= 100 && names.length === ORDERS.systems[key].stopCount);
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

ok('seaside vs sogo split', (() => {
  const a = ctx.window.MAIHAMA_TAKASU_LINE_PATH_V1['25-maihama-takasu-seaside'].pathHash;
  const b = ctx.window.MAIHAMA_TAKASU_LINE_PATH_V1['25-maihama-sogo'].pathHash;
  return a !== b;
})());

ok('route module API', /MAIHAMA_TAKASU_LINE_ROUTE_V1/.test(files.route) && /route-25/.test(files.route));

const report = {
  validatedAt: new Date().toISOString(),
  routeId: 'route-25',
  versionChoice: 'v116 (route-24 already committed at v115 in 1c090d8)',
  checks,
  pass: checks.every((c) => c.pass),
};
fs.writeFileSync(path.join(OUT, '_local_validation_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
