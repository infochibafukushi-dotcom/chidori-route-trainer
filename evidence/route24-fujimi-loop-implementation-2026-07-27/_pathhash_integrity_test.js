'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const SYSTEM = '24-fujimi-loop';

function loadBank(file, globalName) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window[globalName];
}

function sha256(points) {
  return crypto.createHash('sha256').update(JSON.stringify(points.map((p) => [Math.round(p.lat * 1e6), Math.round(p.lng * 1e6)]))).digest('hex');
}

function haversine(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function maxGap(points) {
  let max = 0;
  for (let i = 1; i < points.length; i++) max = Math.max(max, haversine(points[i - 1], points[i]));
  return Math.round(max * 10) / 10;
}

const pathBank = loadBank('fujimi-loop-line-path-v1.js', 'FUJIMI_LOOP_LINE_PATH_V1');
const platBank = loadBank('fujimi-loop-line-platforms-v1.js', 'FUJIMI_LOOP_LINE_PLATFORMS_V1');
const sys = pathBank[SYSTEM];
const pts = sys.pathPoints;
const recomputed = sha256(pts);
const mg = maxGap(pts);

const integrity = {
  system: SYSTEM,
  pathHash: sys.pathHash,
  recomputed,
  match: recomputed === sys.pathHash,
  pathPoints: pts.length,
  maxGap_m: mg,
  buildSummaryHash: BUILD.pathHash,
  buildSummaryMatch: sys.pathHash === BUILD.pathHash,
  platformDists: BUILD.platformDists,
  maxPlatformDist_m: BUILD.maxPlatformDist_m,
  ok: recomputed === sys.pathHash && mg <= 30 && BUILD.maxPlatformDist_m <= 30,
  failures: [],
};
if (!integrity.match) integrity.failures.push('pathHash mismatch');
if (mg > 30) integrity.failures.push(`maxGap ${mg}m`);
if (BUILD.maxPlatformDist_m > 30) integrity.failures.push(`maxPlatformDist ${BUILD.maxPlatformDist_m}m`);
if (!platBank[SYSTEM]?.byIndex || platBank[SYSTEM].byIndex.length !== 24) integrity.failures.push('platform byIndex count');
integrity.ok = integrity.failures.length === 0;

fs.writeFileSync(path.join(OUT, 'pathhash-integrity-report.json'), JSON.stringify(integrity, null, 2));
console.log(integrity.ok ? 'OK' : 'FAIL', integrity.failures.join('; ') || `maxGap ${mg} maxPlat ${BUILD.maxPlatformDist_m}`);
process.exit(integrity.ok ? 0 : 1);
