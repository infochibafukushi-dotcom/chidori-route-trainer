/**
 * 正本文照合：既存3資料の title/blocks 不変 + 追加資料の存在確認
 * node _verify_study_materials_canon.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const dataPath = path.join(__dirname, 'study-materials-data.js');
const snapshotPath = path.join(__dirname, 'study-materials-canon-snapshot.json');

const code = fs.readFileSync(dataPath);
const sha = crypto.createHash('sha256').update(code).digest('hex');
const sandbox = { window: {} };
vm.runInNewContext(code.toString('utf8'), sandbox);
const materials = sandbox.window.STUDY_MATERIALS;

function canonize(list) {
  return (list || []).map((item) => ({
    id: item.id,
    title: item.title,
    blocks: (item.blocks || []).map((block) => ({
      type: block.type,
      text: block.text,
    })),
  }));
}

const actual = canonize(materials);
const expectedAll = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const expectedCore = expectedAll.filter((m) => ['stroller', 'wheelchair', 'mic-guide'].includes(m.id));
const actualCore = actual.filter((m) => ['stroller', 'wheelchair', 'mic-guide'].includes(m.id));

if (JSON.stringify(actualCore) !== JSON.stringify(canonize(expectedCore))) {
  console.error('CORE CANON MISMATCH (stroller/wheelchair/mic-guide must stay unchanged)');
  process.exit(1);
}

const bicycle = materials.find((m) => m.id === 'bicycle-accident-prevention');
if (!bicycle || bicycle.title !== '自転車事故防止の三原則') {
  console.error('bicycle material missing or title mismatch', bicycle);
  process.exit(1);
}

const driverHealth = materials.find((m) => m.id === 'driver-health-emergency-response');
if (!driverHealth || driverHealth.title !== '運行中に体調の異変を感じた時の対応') {
  console.error('driver-health material missing or title mismatch', driverHealth);
  process.exit(1);
}

const accident = materials.find((m) => m.id === 'accident-response-guide');
if (!accident || accident.title !== '事故発生時の処置') {
  console.error('accident-response material missing or title mismatch', accident);
  process.exit(1);
}

const hijacking = materials.find((m) => m.id === 'bus-hijacking-response-manual');
if (!hijacking || hijacking.title !== 'バスジャック対応マニュアル') {
  console.error('bus-hijacking material missing or title mismatch', hijacking);
  process.exit(1);
}

const intersection = materials.find((m) => m.id === 'intersection-turning-safety-guide');
if (!intersection || intersection.title !== '交差点右左折時の実践要領') {
  console.error('intersection-turning material missing or title mismatch', intersection);
  process.exit(1);
}

const passenger = materials.find((m) => m.id === 'passenger-injury-prevention-guide');
if (!passenger || passenger.title !== '車内事故防止の徹底') {
  console.error('passenger-injury material missing or title mismatch', passenger);
  process.exit(1);
}

const rollCall = materials.find((m) => m.id === 'start-end-roll-call-guide');
if (!rollCall || rollCall.title !== '始業・終業点呼の手順') {
  console.error('start-end-roll-call material missing or title mismatch', rollCall);
  process.exit(1);
}

const preTrip = materials.find((m) => m.id === 'pre-trip-inspection-procedure');
if (!preTrip || preTrip.title !== '始業点検の手順') {
  console.error('pre-trip-inspection material missing or title mismatch', preTrip);
  process.exit(1);
}

const departure = materials.find((m) => m.id === 'bus-stop-departure-safety');
if (!departure || departure.title !== '停留所発進時の安全習慣') {
  console.error('bus-stop-departure material missing or title mismatch', departure);
  process.exit(1);
}

const arrival = materials.find((m) => m.id === 'bus-stop-arrival-safety');
if (!arrival || arrival.title !== '停留所到着時の安全習慣') {
  console.error('bus-stop-arrival material missing or title mismatch', arrival);
  process.exit(1);
}

const doorSafety = materials.find((m) => m.id === 'passenger-door-safety-guide');
if (!doorSafety || doorSafety.title !== '乗降扱い時の安全習慣') {
  console.error('passenger-door-safety material missing or title mismatch', doorSafety);
  process.exit(1);
}

fs.writeFileSync(snapshotPath, JSON.stringify(actual, null, 2) + '\n', 'utf8');

console.log('OK canon', {
  sha256: sha,
  materials: actual.length,
  coreBlocks: actualCore.reduce((n, m) => n + m.blocks.length, 0),
  bicycleOk: true,
  driverHealthOk: true,
  accidentOk: true,
  hijackingOk: true,
  intersectionOk: true,
  passengerOk: true,
  rollCallOk: true,
  preTripOk: true,
  departureOk: true,
  arrivalOk: true,
  doorSafetyOk: true,
});
process.exit(0);
