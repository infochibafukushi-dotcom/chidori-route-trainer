'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const EXPRESS_PASS = (ORDERS.expressPassLocations || []).map((x) => x.name);

const files = {
  loader: fs.readFileSync(path.join(ROOT, 'route-assets-loader.js'), 'utf8'),
  sw: fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'),
  route: null,
  policy: null,
};

const ctx = { window: {}, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } } };
ctx.window = ctx;
const load = (name) => {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  vm.runInNewContext(src, ctx, { filename: name });
};

load('akemi-quon-line-platforms-v1.js');
load('akemi-quon-line-path-v1.js');
load('akemi-quon-line-path-policy-v1.js');
files.route = fs.readFileSync(path.join(ROOT, 'akemi-quon-line-route-v1.js'), 'utf8');
files.policy = fs.readFileSync(path.join(ROOT, 'akemi-quon-line-path-policy-v1.js'), 'utf8');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

ok('PACKS route-38', /'route-38'\s*:/.test(files.loader) && /akemi-quon-line-route-v1\.js\?v=118/.test(files.loader));
ok('CACHE v118', /chidori-route-map-v118/.test(files.sw));
ok('loader v118', /route-assets-loader\.js\?v=118/.test(files.sw));
ok('globals platforms', !!ctx.window.AKEMI_QUON_LINE_PLATFORMS_V1);
ok('globals path', !!ctx.window.AKEMI_QUON_LINE_PATH_V1);
ok('globals policy', !!ctx.window.AKEMI_QUON_LINE_PATH_POLICY_V1);
ok('1 system path', Object.keys(ctx.window.AKEMI_QUON_LINE_PATH_V1).length === 1);
ok('build no blockers', (BUILD.blockers || []).length === 0, JSON.stringify(BUILD.blockers));

const policy = ctx.window.AKEMI_QUON_LINE_PATH_POLICY_V1;
const key = '38-shinurayasu-quon-express';
const data = ctx.window.AKEMI_QUON_LINE_PATH_V1[key];
const names = ORDERS.systems[key].stopNames;

ok(`${key} boarding stop count`, names.length === 4 && data.pathPoints.length >= 100);
ok('express pass excluded from stops', !names.some((n) => EXPRESS_PASS.includes(n)), `pass=${EXPRESS_PASS.join(',')} stops=${names.join('>')}`);

const expressCheck = policy.validateExpressStops(names);
ok('validateExpressStops', expressCheck.ok, expressCheck.hits?.join(','));

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

ok('route module API', /AKEMI_QUON_LINE_ROUTE_V1/.test(files.route) && /route-38/.test(files.route));
ok('route module express const', /EXPRESS_PASS_LOCATIONS/.test(files.route));

const report = {
  validatedAt: new Date().toISOString(),
  routeId: 'route-38',
  versionChoice: 'v118 (v117 reserved for route-37 concurrent; current CACHE v116)',
  expressPassLocations: EXPRESS_PASS,
  boardingStops: names,
  checks,
  pass: checks.every((c) => c.pass),
};
fs.writeFileSync(path.join(OUT, '_local_validation_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
