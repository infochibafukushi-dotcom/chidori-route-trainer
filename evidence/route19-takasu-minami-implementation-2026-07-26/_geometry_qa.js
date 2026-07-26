'use strict';
/**
 * Geometry QA for route-19 paths vs sibling routes 10/15/18.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

function loadBank(file, globalName) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window[globalName];
}

const own = loadBank('takasu-minami-line-path-v1.js', 'TAKASU_MINAMI_LINE_PATH_V1');
const siblings = {
  10: loadBank('takasu-line-path-v1.js', 'TAKASU_LINE_PATH_V1'),
  15: loadBank('shione-no-machi-line-path-v1.js', 'SHIONE_NO_MACHI_LINE_PATH_V1'),
  18: loadBank('akemi-takasu-line-path-v1.js', 'AKEMI_TAKASU_LINE_PATH_V1'),
};

const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
const isExactEqual = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[i]));
const isReverseOf = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[b.length - 1 - i]));

const failures = [];
const checks = [];

for (const [key, sys] of Object.entries(own)) {
  const pts = sys.pathPoints;
  checks.push({ system: key, pathPoints: pts.length, pathHash: sys.pathHash, relationId: sys.relationId });
  if (sys.pathHash !== BUILD.systems[key]?.pathHash) {
    failures.push(`${key}: pathHash mismatch vs build summary`);
  }
  for (const [sibRoute, bank] of Object.entries(siblings)) {
    for (const [sibKey, sibSys] of Object.entries(bank || {})) {
      if (!sibSys?.pathPoints) continue;
      if (isExactEqual(pts, sibSys.pathPoints)) failures.push(`${key} identical to route-${sibRoute}/${sibKey}`);
      if (isReverseOf(pts, sibSys.pathPoints)) failures.push(`${key} reverse of route-${sibRoute}/${sibKey}`);
    }
  }
}

// Own systems must not be reverse of each other
const a = own['19-takasu-seaside'].pathPoints;
const b = own['19-shinurayasu'].pathPoints;
if (isReverseOf(a, b)) failures.push('19-shinurayasu is exact reverse of 19-takasu-seaside');
if (isExactEqual(a, b)) failures.push('both systems have identical paths');

const report = {
  checkedAt: new Date().toISOString(),
  checks,
  failures,
  ok: failures.length === 0,
  note: 'Proves route-19 geometry is not a truncate/reverse of route-10/15/18 packs.',
};
fs.writeFileSync(path.join(OUT, '_geometry_qa_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
