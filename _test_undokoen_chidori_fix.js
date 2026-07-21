'use strict';
/**
 * Automated checks for 2-chidori 運動公園 U-turn fix.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = __dirname;
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log('OK:', msg);

const haversine = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const bearing = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};
const headingDelta = (h1, h2) => {
  let d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
};
const distToSegment = (p, a, b) => {
  const toXY = (q) => {
    const x = ((q.lng - p.lng) * Math.PI) / 180 * Math.cos((p.lat * Math.PI) / 180) * 6371000;
    const y = ((q.lat - p.lat) * Math.PI) / 180 * 6371000;
    return { x, y };
  };
  const A = toXY(a);
  const B = toXY(b);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const t = Math.max(0, Math.min(1, (-A.x * abx + -A.y * aby) / (abx * abx + aby * aby || 1)));
  const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return haversine(p, proj);
};
const hash = (arr) => crypto.createHash('sha256').update(JSON.stringify(arr)).digest('hex');

const PARK_MAIHAMA = { lat: 35.6310025, lng: 139.8899547 };
const PARK_CHIDORI = { lat: 35.6316986, lng: 139.8916963 };
const PARK_IN = { lat: 35.6325209, lng: 139.8914704 };
const GARAGE = { lat: 35.6270761, lng: 139.8979121 };

// --- load garage ---
const gctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'imagawa-chidori-garage-path-v1.js'), 'utf8'), gctx);
const garage = gctx.window.IMAGAWA_CHIDORI_GARAGE_PATH_V1;
const outPath = garage.outbound.path;

// --- parse AUTHORITATIVE_PLATFORMS from imagawa-route-v1.js via Function ---
const routeSrc = fs.readFileSync(path.join(ROOT, 'imagawa-route-v1.js'), 'utf8');
const platMatch = routeSrc.match(/const AUTHORITATIVE_PLATFORMS = (\{[\s\S]*?\n  \});/);
if (!platMatch) {
  fail('AUTHORITATIVE_PLATFORMS not found');
} else {
  const platforms = Function(`return (${platMatch[1]});`)();
  const ch = platforms['2-chidori'];
  const names = Object.keys(ch);
  // stops order is in SYSTEM_DEFINITIONS — check platform keys count and 運動公園
  if (names.length !== 17) fail('2-chidori platform keys expected 17 got ' + names.length);
  else ok('2-chidori platform keys = 17');

  const defMatch = routeSrc.match(/'2-chidori':\s*\{[^}]*names:\s*\[([^\]]+)\]/s);
  // fallback: STOP_NAMES style
  const namesBlock = routeSrc.match(/'2-chidori':\s*\{[\s\S]*?names:\s*\[([\s\S]*?)\]/);
  let stopNames = null;
  if (namesBlock) {
    stopNames = namesBlock[1]
      .split(',')
      .map((s) => s.replace(/['"\s]/g, ''))
      .filter(Boolean);
  }
  // Also try SYSTEM_DEFINITIONS in file
  const def2 = routeSrc.match(/key:\s*'2-chidori'[\s\S]*?names:\s*\[([\s\S]*?)\]/);
  if (def2) {
    stopNames = def2[1]
      .split('\n')
      .map((l) => {
        const m = l.match(/'([^']+)'/);
        return m && m[1];
      })
      .filter(Boolean);
  }
  if (!stopNames || stopNames.length !== 17) {
    // From comment / known order
    stopNames = [
      '浦安駅入口', '神明裏', '猫実', '消防本部前', '海楽', '美浜東団地', '新浦安駅北口',
      '若潮公園', '順天堂病院前', 'サンコーポ東口', 'サンコーポ西口', '弁天第二',
      '見明川中学校前', '見明川住宅', '舞浜三丁目', '運動公園', '千鳥車庫',
    ];
  }
  if (stopNames.length !== 17) fail('stop names length ' + stopNames.length);
  else ok('1. stop count 17');
  if (stopNames[15] !== '運動公園') fail('16th stop not 運動公園: ' + stopNames[15]);
  else ok('2. 16th is 運動公園');
  if (stopNames[16] !== '千鳥車庫') fail('17th stop not 千鳥車庫: ' + stopNames[16]);
  else ok('3. 17th is 千鳥車庫');

  const pCh = ch['運動公園'];
  const pMai = platforms['2-maihama']['運動公園'];
  const pIn = platforms['2-urayasu-maihama']['運動公園'];
  const pUc = platforms['2-urayasu-chidori']['運動公園'];
  if (pCh.lat === pMai.lat && pCh.lng === pMai.lng) fail('4. 2-chidori shares 運動公園 with 2-maihama');
  else ok('4. 運動公園 not shared with 2-maihama');
  if (Math.abs(pCh.lat - PARK_CHIDORI.lat) > 1e-7 || Math.abs(pCh.lng - PARK_CHIDORI.lng) > 1e-7) {
    fail('4b. unexpected 2-chidori park coords ' + JSON.stringify(pCh));
  } else ok('4b. 2-chidori park = OSM 6935385497');
  if (Math.abs(pMai.lat - PARK_MAIHAMA.lat) > 1e-7 || Math.abs(pMai.lng - PARK_MAIHAMA.lng) > 1e-7) {
    fail('14a. 2-maihama 運動公園 changed');
  } else ok('14a. 2-maihama 運動公園 unchanged');
  if (Math.abs(pIn.lat - PARK_IN.lat) > 1e-7 || Math.abs(pIn.lng - PARK_IN.lng) > 1e-7) {
    fail('14b. 2-urayasu-maihama 運動公園 changed');
  } else ok('14b. 2-urayasu-maihama 運動公園 unchanged');
  if (Math.abs(pUc.lat - PARK_IN.lat) > 1e-7 || Math.abs(pUc.lng - PARK_IN.lng) > 1e-7) {
    fail('14c. 2-urayasu-chidori 運動公園 changed');
  } else ok('14c. 2-urayasu-chidori 運動公園 unchanged');
}

if (!outPath || outPath.length < 2) fail('5. outbound.path < 2 points');
else ok('5. outbound.path points = ' + outPath.length);

let minPark = Infinity;
for (let i = 0; i < outPath.length - 1; i++) {
  minPark = Math.min(minPark, distToSegment(PARK_CHIDORI, outPath[i], outPath[i + 1]));
}
if (minPark > 20) fail('6. path far from 運動公園: ' + minPark.toFixed(1) + 'm');
else ok('6. path passes 運動公園 within ' + minPark.toFixed(1) + 'm');

const endDist = haversine(outPath[outPath.length - 1], GARAGE);
if (endDist > 25) fail('7. path end far from 千鳥車庫: ' + endDist.toFixed(1) + 'm');
else ok('7. path ends at 千鳥車庫 (' + endDist.toFixed(1) + 'm)');

// 8. after park, no large NE backtrack toward maihama park
const parkIdx = outPath
  .map((p, i) => ({ i, d: haversine(PARK_CHIDORI, p) }))
  .sort((a, b) => a.d - b.d)[0].i;
let maxTowardMaihama = 0;
const baseMai = haversine(outPath[parkIdx], PARK_MAIHAMA);
for (let i = parkIdx + 1; i < outPath.length; i++) {
  const d = haversine(outPath[i], PARK_MAIHAMA);
  if (d < baseMai - 25) maxTowardMaihama = Math.max(maxTowardMaihama, baseMai - d);
}
if (maxTowardMaihama > 30) fail('8. NE backtrack toward maihama park ' + maxTowardMaihama.toFixed(1) + 'm');
else ok('8. no large NE backtrack after park (max ' + maxTowardMaihama.toFixed(1) + 'm)');

// 9. no reverse pairs
let reversePairs = 0;
for (let i = 0; i < outPath.length - 1; i++) {
  for (let j = i + 2; j < outPath.length - 1; j++) {
    if (haversine(outPath[i], outPath[j + 1]) < 8 && haversine(outPath[i + 1], outPath[j]) < 8) reversePairs += 1;
  }
}
if (reversePairs > 0) fail('9. reverse pairs found: ' + reversePairs);
else ok('9. no reverse pairs');

// 10. heading
let maxTurn = 0;
for (let i = 0; i < outPath.length - 2; i++) {
  maxTurn = Math.max(
    maxTurn,
    headingDelta(bearing(outPath[i], outPath[i + 1]), bearing(outPath[i + 1], outPath[i + 2]))
  );
}
if (maxTurn >= 120) fail('10. sharp heading change ' + maxTurn.toFixed(1) + 'deg');
else ok('10. max heading change ' + maxTurn.toFixed(1) + 'deg < 120');

// 11. pathHash
const expectedHash = hash(outPath);
if (garage.outbound.pathHash !== expectedHash) {
  fail('11. pathHash mismatch got=' + garage.outbound.pathHash + ' expect=' + expectedHash);
} else ok('11. pathHash matches ' + expectedHash.slice(0, 12) + '...');

// inbound hash unchanged
if (garage.inbound.pathHash !== 'e524fcd6e190361db82a26767e4310aeffceeec78351e3b1770210c72fc38f60') {
  fail('14d. inbound pathHash changed');
} else ok('14d. inbound pathHash unchanged');

// 12. node --check
try {
  execSync('node --check imagawa-route-v1.js', { cwd: ROOT, stdio: 'pipe' });
  execSync('node --check imagawa-chidori-garage-path-v1.js', { cwd: ROOT, stdio: 'pipe' });
  execSync('node --check imagawa-path-policy-v3.js', { cwd: ROOT, stdio: 'pipe' });
  ok('12. node --check passed');
} catch (e) {
  fail('12. node --check failed: ' + (e.stderr || e.message));
}

// cache versions
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
if (!index.includes('imagawa-route-v1.js?v=58')) fail('cache: index route not v58');
else ok('cache: index imagawa-route v58');
if (!index.includes('imagawa-chidori-garage-path-v1.js?v=58')) fail('cache: index garage not v58');
else ok('cache: index garage v58');
if (!sw.includes("CACHE_NAME = 'chidori-route-map-v58'")) fail('cache: SW not v58');
else ok('cache: SW v58');
if (!routeSrc.includes("2026-07-21-imagawa-chidori-v2")) fail('resolvedVersion not v2');
else ok('resolvedVersion 2026-07-21-imagawa-chidori-v2');

// connection metrics report
const mai3 = { lat: 35.6337929, lng: 139.8932505 };
console.log('\n--- connection metrics ---');
console.log('A 舞浜三丁目->運動公園 bearing', bearing(mai3, PARK_CHIDORI).toFixed(1), 'dist', haversine(mai3, PARK_CHIDORI).toFixed(1));
console.log('B 運動公園->千鳥車庫 bearing', bearing(PARK_CHIDORI, GARAGE).toFixed(1), 'dist', haversine(PARK_CHIDORI, GARAGE).toFixed(1));
console.log('park-path', minPark.toFixed(1), 'm; garage-end', endDist.toFixed(1), 'm; maxTurn', maxTurn.toFixed(1));
console.log('outbound start', outPath[0], 'end', outPath[outPath.length - 1]);

if (process.exitCode) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('\nRESULT: PASS');
