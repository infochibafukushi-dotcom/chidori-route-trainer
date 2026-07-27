'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const EXPECTED_CACHE = 'chidori-route-map-v115';
const ROUTE24_PACK = [
  './fujimi-loop-line-platforms-v1.js?v=115',
  './fujimi-loop-line-path-v1.js?v=115',
  './fujimi-loop-line-path-policy-v1.js?v=115',
  './fujimi-loop-line-stop-images-v1.js?v=115',
  './fujimi-loop-line-route-v1.js?v=115',
];

const report = {
  routeId: 'route-24',
  expectedCache: EXPECTED_CACHE,
  pack: ROUTE24_PACK,
  failures: [],
  pass: false,
};

const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const loader = fs.readFileSync(path.join(ROOT, 'route-assets-loader.js'), 'utf8');
if (!sw.includes(EXPECTED_CACHE)) report.failures.push(`service-worker not ${EXPECTED_CACHE}`);
if (!loader.includes("'route-24'")) report.failures.push('route-24 pack missing in loader');
if (!loader.includes('v=115')) report.failures.push('loader not v115');
for (const f of ['fujimi-loop-line-platforms-v1.js', 'fujimi-loop-line-path-v1.js', 'fujimi-loop-line-route-v1.js']) {
  if (!fs.existsSync(path.join(ROOT, f))) report.failures.push(`missing ${f}`);
}
report.pass = report.failures.length === 0;
fs.writeFileSync(path.join(OUT, 'pwa-offline-report.json'), JSON.stringify(report, null, 2));
console.log(report.pass ? 'OK' : 'FAIL', report.failures.join('; '));
process.exit(report.pass ? 0 : 1);
