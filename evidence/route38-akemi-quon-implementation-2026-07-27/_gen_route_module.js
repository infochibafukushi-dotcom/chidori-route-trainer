'use strict';
/** Generate route-38 modules from fujimi-loop-line-route-v1.js template. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-akemi-quon-line-v1';
const EVIDENCE_DIR = 'evidence/route38-akemi-quon-implementation-2026-07-27';

const SYSTEMS = [
  { key: '38-shinurayasu-quon-express', constName: 'NAMES_38_SHINURAYASU_QUON_EXPRESS', resolved: '2026-07-27-akemi38-shinurayasu-quon-express-v1' },
];

const DEFAULT_SYSTEM = '38-shinurayasu-quon-express';
const INDEX_PLATFORM_SYSTEMS = new Set(SYSTEMS.map((s) => s.key));
const EXPRESS_PASS = (ORDERS.expressPassLocations || []).map((x) => x.name);

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'fujimi-loop-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 明海クオン線（系統番号38・route-38）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表 course 0008200316 berth 38（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★＜急行＞便。system.stops は乗車停留所のみ（${EXPRESS_PASS.join('・')} は path 通過のみで stops[] 除外）。
// ★新浦安駅のりば38 + 凡例「ク…【３８系統】明海小学校・クオン新浦安方面」。
// ★18/15/19/10系統 path・OSM relation は使用禁止。OSM 18396354 のみ。
// 1周：新浦安駅(B)→明海小学校→クオン新浦安→新浦安駅(X)。海風の街は roadside express pass。
// 停留所座標：OSM platform byIndex（同名新浦安駅は entry B / exit X）。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-38';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'akemi-quon-line-system-v1';
  const DISPLAY_CODE = '38';
  const INDEX_PLATFORM_SYSTEMS = new Set(${JSON.stringify([...INDEX_PLATFORM_SYSTEMS])});
  const EXPRESS_PASS_LOCATIONS = ${JSON.stringify(EXPRESS_PASS)};
`;
  src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);

  const namesBlocks = SYSTEMS.map((s) => {
    const names = ORDERS.systems[s.key].stopNames;
    return `  const ${s.constName} = ${indentJson(names)};`;
  }).join('\n\n');

  const defs = SYSTEMS.map((s) => {
    const o = ORDERS.systems[s.key];
    return `    '${s.key}': {
      key: '${s.key}', displayCode: DISPLAY_CODE, directionGroup: '${o.directionGroup}',
      title: '${o.title}',
      summary: '${o.summary}',
      relationId: ${o.osmRelationId},
      timetableSymbol: '${o.timetableSymbol}',
      naviCourse: '${o.course}',
      names: ${s.constName},
    },`;
  }).join('\n');

  const namesAndDefs = `${namesBlocks}

  const SYSTEM_DEFINITIONS = {
${defs}
  };

  const DEFAULT_SYSTEM_KEY = '${DEFAULT_SYSTEM}';`;

  src = src.replace(
    /const NAMES_24_FUJIMI_LOOP = [\s\S]*?const DEFAULT_SYSTEM_KEY = '24-fujimi-loop';/,
    namesAndDefs.trimStart(),
  );

  const replacements = [
    [/FUJIMI_LOOP_LINE/g, 'AKEMI_QUON_LINE'],
    [/fujimiLoopLine/g, 'akemiQuonLine'],
    [/FujimiLoopLine/g, 'AkemiQuonLine'],
    [/fujimi-loop-line-system-v1/g, 'akemi-quon-line-system-v1'],
    [/fujimi24-/g, 'akemi38-'],
    [/fujimi-24-/g, 'akemi-38-'],
    [/富士見循環線/g, '明海クオン線'],
    [/route-24/g, 'route-38'],
    [/24-fujimi-loop/g, '38-shinurayasu-quon-express'],
    [/route24StopEditor/g, 'route38StopEditor'],
    [/openRoute24StopEditor/g, 'openRoute38StopEditor'],
    [/24系統/g, '38系統'],
    [/【２４系統】/g, '【３８系統】'],
  ];
  for (const [from, to] of replacements) src = src.replace(from, to);

  if (/FUJIMI|fujimi-loop|route-24|24-fujimi/.test(src)) throw new Error('template leak');

  fs.writeFileSync(path.join(ROOT, 'akemi-quon-line-route-v1.js'), src, 'utf8');
  console.log('wrote akemi-quon-line-route-v1.js');
}

function buildPathPolicy() {
  const key = '38-shinurayasu-quon-express';
  const sys = BUILD.systems[key];
  const minPts = Math.max(100, Math.floor(sys.pathPoints.length * 0.85));
  const src = `// 明海クオン線（route-38）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '${VERSION}-path';
  const MIN_PATH_POINTS_BY_SYSTEM = { '${key}': ${minPts} };
  const EXPECTED_PATH_HASHES = { '${key}': '${sys.pathHash}' };
  const EXPRESS_PASS_LOCATIONS = ${JSON.stringify(EXPRESS_PASS)};
  const MAX_GAP_M = 30;
  const MAX_IDENTICAL_RUN = 5;
  const LAT_MIN = 35.60;
  const LAT_MAX = 35.70;
  const LNG_MIN = 139.86;
  const LNG_MAX = 139.96;

  function distanceMeters(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function minPathPointsFor(systemKey) {
    return MIN_PATH_POINTS_BY_SYSTEM[systemKey] || 100;
  }

  function validateRuntimePath({
    systemKey, path, pathHash, expectedPathHash, resolvedVersion, expectedResolvedVersion, directionGroup, pathSource,
  }) {
    const reasons = [];
    const minPoints = minPathPointsFor(systemKey);
    if (!systemKey) reasons.push('systemKey不在');
    if (!directionGroup) reasons.push('directionGroup不在');
    if (!pathSource) reasons.push('pathSource不在');
    if (!expectedResolvedVersion) reasons.push('expectedResolvedVersion不在');
    else if (resolvedVersion !== expectedResolvedVersion) reasons.push('resolvedVersion不一致');
    const expHash = expectedPathHash || EXPECTED_PATH_HASHES[systemKey];
    if (!expHash) reasons.push('期待pathHash不在');
    else if (!pathHash) reasons.push('pathHash未計算');
    else if (pathHash !== expHash) reasons.push('pathHash不一致');
    if (!Array.isArray(path) || path.length < minPoints) reasons.push(\`path点数不足（最低\${minPoints}）\`);
    let maxGapM = 0;
    (path || []).forEach((point, index) => {
      if (!point || point.lat == null || point.lng == null) reasons.push(\`座標null（index=\${index}）\`);
      if (index === 0) return;
      maxGapM = Math.max(maxGapM, distanceMeters(path[index - 1], point));
    });
    if (maxGapM > MAX_GAP_M) reasons.push(\`最大ギャップ \${maxGapM.toFixed(1)}m > \${MAX_GAP_M}m\`);
    return { ok: reasons.length === 0, reasons, maxGapM };
  }

  function validateExpressStops(stopNames) {
    const hits = (stopNames || []).filter((n) => EXPRESS_PASS_LOCATIONS.includes(n));
    return { ok: hits.length === 0, hits };
  }

  window.AKEMI_QUON_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    expressPassLocations: EXPRESS_PASS_LOCATIONS,
    minPathPointsFor,
    validateRuntimePath,
    validateExpressStops,
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'akemi-quon-line-path-policy-v1.js'), src, 'utf8');
  console.log('wrote path-policy');
}

function buildStopImages() {
  fs.writeFileSync(path.join(ROOT, 'akemi-quon-line-stop-images-v1.js'), `// 明海クオン線（route-38）停留所画像バンク。
(() => {
  window.AKEMI_QUON_LINE_STOP_IMAGES_V1 = window.AKEMI_QUON_LINE_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'akemi-quon-line-stop-images-v1.css'), `/* route-38 明海クオン線 停留所画像 */
.akemi38-stop-image { max-width: 100%; height: auto; border-radius: 8px; }
`, 'utf8');
  console.log('wrote stop-images');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
