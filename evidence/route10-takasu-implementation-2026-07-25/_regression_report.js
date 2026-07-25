'use strict';
/**
 * Regression: pathHashes of routes 1–9 banks must remain unchanged after route-10 add.
 * Compares current path bank files against git HEAD (pre-route-10 commit baseline).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_regression_report.json');

function loadWindowFromSource(src, globalName) {
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window);
  return sandbox.window[globalName];
}

function loadWindow(rel, globalName) {
  return loadWindowFromSource(fs.readFileSync(path.join(ROOT, rel), 'utf8'), globalName);
}

function gitShow(rel) {
  try {
    return execSync(`git show HEAD:${rel}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (e) {
    return null;
  }
}

function hashesOf(bank) {
  const out = {};
  for (const [k, v] of Object.entries(bank || {})) {
    out[k] = {
      pathHash: v.pathHash,
      resolvedVersion: v.resolvedVersion || null,
      pathPoints: (v.pathPoints || []).length,
    };
  }
  return out;
}

function compareBanks(label, file, globalName) {
  const currentSrc = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const headSrc = gitShow(file);
  const current = loadWindowFromSource(currentSrc, globalName);
  const head = headSrc ? loadWindowFromSource(headSrc, globalName) : null;
  const curH = hashesOf(current);
  const headH = hashesOf(head);
  const systems = {};
  let ok = true;
  const keys = new Set([...Object.keys(curH), ...Object.keys(headH)]);
  for (const key of keys) {
    const c = curH[key];
    const h = headH[key];
    const unchanged =
      h
      && c
      && c.pathHash === h.pathHash
      && c.pathPoints === h.pathPoints
      && c.resolvedVersion === h.resolvedVersion;
    systems[key] = {
      current: c || null,
      head: h || null,
      unchanged: Boolean(unchanged),
    };
    if (!unchanged) ok = false;
  }
  // file identical check
  const fileIdentical = headSrc != null && currentSrc === headSrc;
  return {
    label,
    file,
    ok: head ? ok : false,
    fileIdentical,
    headAvailable: Boolean(headSrc),
    systems,
  };
}

const report = {
  checkedAt: new Date().toISOString(),
  note: 'Compare path banks vs git HEAD. Route-10 is new (no HEAD baseline required).',
  routes: {},
  pass: false,
};

const banks = [
  ['舞浜線 route-9', 'maihama-line-path-v1.js', 'MAIHAMA_LINE_PATH_V1'],
  ['市役所線 route-6', 'shiyakusho-path-v1.js', 'SHIYAKUSHO_PATH_V1'],
  ['堀江線 route-5', 'horie-path-v1.js', 'HORIE_PATH_V1'],
  ['富岡線 route-4', 'tomioka-path-v1.js', 'TOMIOKA_PATH_V1'],
  ['浦安東団地線 route-3', 'urayasu-higashi-danchi-path-v1.js', 'URAYASU_HIGASHI_DANCHI_PATH_V1'],
];

let allOk = true;
for (const [label, file, g] of banks) {
  const row = compareBanks(label, file, g);
  report.routes[label] = row;
  if (!row.ok) allOk = false;
}

// Imagawa: ensure file unchanged
{
  const file = 'imagawa-route-v1.js';
  const cur = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const head = gitShow(file);
  const unchanged = head != null && cur === head;
  report.routes['今川線 route-2'] = { ok: unchanged, fileIdentical: unchanged, file };
  if (!unchanged) allOk = false;
}

// Takasu new
const takasu = loadWindow('takasu-line-path-v1.js', 'TAKASU_LINE_PATH_V1');
report.routes['高洲線 route-10 (new)'] = {
  ok: Boolean(takasu?.['10-minato-minami'] && takasu?.['10-shinurayasu']),
  systems: hashesOf(takasu),
  note: 'new — not compared to HEAD',
};

report.pass = allOk && report.routes['高洲線 route-10 (new)'].ok;
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  pass: report.pass,
  routes: Object.fromEntries(Object.entries(report.routes).map(([k, v]) => [k, v.ok])),
}, null, 2));
process.exit(report.pass ? 0 : 1);
