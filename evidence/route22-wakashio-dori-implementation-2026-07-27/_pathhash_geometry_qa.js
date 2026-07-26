'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const SYSTEMS = Object.keys(BUILD.systems);

function loadBank(file, globalName) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window[globalName];
}

function sha256(points) {
  const payload = points.map((p) => `${Number(p.lat).toFixed(7)},${Number(p.lng).toFixed(7)}`).join(';');
  return crypto.createHash('sha256').update(payload).digest('hex');
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

const pathBank = loadBank('wakashio-dori-line-22-path-v1.js', 'WAKASHIO_DORI_LINE_22_PATH_V1');
const platBank = loadBank('wakashio-dori-line-22-platforms-v1.js', 'WAKASHIO_DORI_LINE_22_PLATFORMS_V1');

const integrity = { systems: {}, failures: [], ok: true };
for (const key of SYSTEMS) {
  const sys = pathBank[key];
  const recomputed = sha256(sys.pathPoints);
  const row = {
    pathHash: sys.pathHash,
    recomputed,
    match: recomputed === sys.pathHash,
    pathPoints: sys.pathPoints.length,
    resolvedVersion: sys.resolvedVersion,
  };
  integrity.systems[key] = row;
  if (!row.match) integrity.failures.push(`${key}: pathHash mismatch`);
  if (sys.pathHash !== BUILD.systems[key].pathHash) integrity.failures.push(`${key}: build summary hash mismatch`);
}
integrity.ok = integrity.failures.length === 0;
fs.writeFileSync(path.join(OUT, 'pathhash-integrity-report.json'), JSON.stringify(integrity, null, 2), 'utf8');

const geom = { systems: {}, failures: [], ok: true };
const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
const isReverseOf = (a, b) => a.length === b.length && a.every((p, i) => samePoint(p, b[b.length - 1 - i]));
const hashes = new Set();
for (const key of SYSTEMS) {
  const pts = pathBank[key].pathPoints;
  const mg = maxGap(pts);
  geom.systems[key] = { pathPoints: pts.length, maxGap_m: mg, pathHash: pathBank[key].pathHash };
  if (mg > 30) geom.failures.push(`${key}: maxGap ${mg}m > 30m`);
  if (hashes.has(pathBank[key].pathHash)) geom.failures.push(`${key}: duplicate pathHash`);
  hashes.add(pathBank[key].pathHash);
}
for (let i = 0; i < SYSTEMS.length; i++) {
  for (let j = i + 1; j < SYSTEMS.length; j++) {
    const a = pathBank[SYSTEMS[i]].pathPoints;
    const b = pathBank[SYSTEMS[j]].pathPoints;
    if (isReverseOf(a, b)) geom.failures.push(`${SYSTEMS[j]} reverse of ${SYSTEMS[i]}`);
  }
}
geom.ok = geom.failures.length === 0;
fs.writeFileSync(path.join(OUT, 'geometry-qa-report.json'), JSON.stringify(geom, null, 2), 'utf8');

console.log('pathhash', integrity.ok ? 'PASS' : 'FAIL', integrity.failures);
console.log('geometry', geom.ok ? 'PASS' : 'FAIL', geom.failures);
if (!integrity.ok || !geom.ok) process.exit(1);
