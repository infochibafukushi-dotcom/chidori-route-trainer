'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(ROOT, 'route-assets-loader.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

ok('CACHE v119', /chidori-route-map-v119/.test(sw));
ok('index loader v119', /route-assets-loader\.js\?v=119/.test(idx));
ok('sw loader v119', /route-assets-loader\.js\?v=119/.test(sw));
for (const r of ['20', '22', '23', '24', '25', '37', '38']) {
  ok(`PACKS route-${r}`, new RegExp(`'route-${r}'`).test(loader));
}
ok('copyright', app.includes('©山本信勝'));

const banks = {
  20: ['chidori-line-path-v1.js', 'CHIDORI_LINE_PATH_V1'],
  22: ['wakashio-dori-line-22-path-v1.js', 'WAKASHIO_DORI_LINE_22_PATH_V1'],
  23: ['urayasu-higashi-danchi-line-23-path-v1.js', 'URAYASU_HIGASHI_DANCHI_LINE_23_PATH_V1'],
  24: ['fujimi-loop-line-path-v1.js', 'FUJIMI_LOOP_LINE_PATH_V1'],
  25: ['maihama-takasu-line-path-v1.js', 'MAIHAMA_TAKASU_LINE_PATH_V1'],
  37: ['daisankaku-line-path-v1.js', 'DAISANKAKU_LINE_PATH_V1'],
  38: ['akemi-quon-line-path-v1.js', 'AKEMI_QUON_LINE_PATH_V1'],
};

const ctx = { window: {} };
ctx.window = ctx;
for (const [routeNum, [file, globalName]] of Object.entries(banks)) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  const bank = ctx.window[globalName];
  ok(`bank route-${routeNum}`, bank && Object.keys(bank).length > 0, `${Object.keys(bank || {}).length} systems`);
  for (const [k, d] of Object.entries(bank || {})) {
    ok(`${routeNum} ${k} hash`, typeof d.pathHash === 'string' && d.pathHash.length === 64);
    ok(`${routeNum} ${k} pts`, Array.isArray(d.pathPoints) && d.pathPoints.length >= 2);
  }
}

const baselineFiles = [
  ['urayasu-higashi-danchi-path-v1.js', 'URAYASU_HIGASHI_DANCHI_PATH_V1', 'route-3'],
  ['hinode-line-17-path-v1.js', 'HINODE_LINE_17_PATH_V1', 'route-17'],
  ['akemi-takasu-line-path-v1.js', 'AKEMI_TAKASU_LINE_PATH_V1', 'route-18'],
  ['takasu-minami-line-path-v1.js', 'TAKASU_MINAMI_LINE_PATH_V1', 'route-19'],
];

for (const [file, globalName, label] of baselineFiles) {
  let baseBank;
  try {
    const src = execSync(`git show f4c6d5a:${file}`, { encoding: 'utf8', cwd: ROOT });
    const c = { window: {} };
    c.window = c;
    vm.runInNewContext(src, c, { filename: `base-${file}` });
    baseBank = c.window[globalName];
  } catch (_) {
    baseBank = null;
  }
  const c2 = { window: {} };
  c2.window = c2;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c2, { filename: file });
  const curBank = c2.window[globalName];
  if (baseBank && curBank) {
    for (const k of Object.keys(baseBank)) {
      ok(`${label} hash unchanged ${k}`, baseBank[k].pathHash === curBank[k].pathHash);
    }
  }
}

const report = {
  validatedAt: new Date().toISOString(),
  baseline: 'f4c6d5a',
  checks,
  pass: checks.every((c) => c.pass),
  fail: checks.filter((c) => !c.pass),
};
fs.writeFileSync(path.join(__dirname, '_regression_routes_20_38_2026-07-27.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, total: checks.length, fail: report.fail.length }, null, 2));
if (report.fail.length) console.log(JSON.stringify(report.fail, null, 2));
process.exit(report.pass ? 0 : 1);
