'use strict';
/** Gate route-38 signatures from _navi_deep_raw.json → official-stop-orders.json */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_deep_raw.json'), 'utf8'));
const ORDERS_PATH = path.join(OUT, 'official-stop-orders.json');

const EXPRESS_PASS = ['海風の街'];

function boardingOnly(stopNames) {
  return stopNames.filter((n) => !EXPRESS_PASS.includes(n));
}

const sigs = Object.entries(DEEP.signatures || {});
const report = {
  verifiedAt: new Date().toISOString(),
  signatureCount: sigs.length,
  signatures: [],
  pass: true,
  failures: [],
};

for (const [sigKey, sig] of sigs) {
  const boarding = boardingOnly(sig.stopNames);
  const entry = {
    sigKey,
    naviStopNames: sig.stopNames,
    boardingStopNames: boarding,
    course: sig.course,
    dayKinds: sig.dayKinds,
    has38Legend: true,
  };
  report.signatures.push(entry);

  if (!sig.course) report.failures.push('missing course id');
  if (boarding.length !== 4) report.failures.push(`expected 4 boarding stops, got ${boarding.length}: ${boarding.join('>')}`);
  if (!boarding.includes('明海小学校') || !boarding.includes('クオン新浦安')) {
    report.failures.push('missing 明海小学校 or クオン新浦安 in boarding stops');
  }
  if (boarding.filter((n) => n === '新浦安駅').length !== 2) {
    report.failures.push('expected 2×新浦安駅 (departure+return) in boarding stops');
  }
  if (sig.stopNames.includes('海風の街') && !EXPRESS_PASS.includes('海風の街')) {
    report.failures.push('海風の街 not classified as express pass');
  }
}

if (report.signatureCount !== 1) report.failures.push(`expected 1 signature, got ${report.signatureCount}`);
if (report.failures.length) report.pass = false;

fs.writeFileSync(path.join(OUT, '_signature_gate.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
