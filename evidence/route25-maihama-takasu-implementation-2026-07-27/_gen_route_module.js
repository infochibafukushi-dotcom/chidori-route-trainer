'use strict';
/** Generate route-25 modules from urayasu-higashi-danchi-line-23-route-v1.js template. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-maihama-takasu-line-v1';
const EVIDENCE_DIR = 'evidence/route25-maihama-takasu-implementation-2026-07-27';

const SYSTEMS = [
  { key: '25-maihama-takasu-seaside', constName: 'NAMES_25_MAIHAMA_TAKASU_SEASIDE', resolved: '2026-07-27-maihama25-maihama-takasu-seaside-v1' },
  { key: '25-takasu-seaside-maihama', constName: 'NAMES_25_TAKASU_SEASIDE_MAIHAMA', resolved: '2026-07-27-maihama25-takasu-seaside-maihama-v1' },
  { key: '25-maihama-sogo', constName: 'NAMES_25_MAIHAMA_SOGO', resolved: '2026-07-27-maihama25-maihama-sogo-v1' },
  { key: '25-sogo-maihama', constName: 'NAMES_25_SOGO_MAIHAMA', resolved: '2026-07-27-maihama25-sogo-maihama-v1' },
];

const DEFAULT_SYSTEM = '25-maihama-takasu-seaside';
const INDEX_PLATFORM_SYSTEMS = new Set(SYSTEMS.map((s) => s.key));

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 舞浜・高洲線（系統番号25・route-25）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★高洲海浜公園のりば19/03は [19]/[15]/[18] 混載、総合公園のりば04は [11]/[25] 混載（符号◇ま=【２５系統】）。
// ★10/15/18/19系統の path・OSM relation は使用禁止。総合公園行と高洲海浜公園行は別系統。
// 4運行パターン：18352023/22（海浜公園）/ 18352045/44（総合公園）。
// 停留所座標：OSM platform採用（byIndex）。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-25';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'maihama-takasu-line-system-v1';
  const DISPLAY_CODE = '25';
  const INDEX_PLATFORM_SYSTEMS = new Set(${JSON.stringify([...INDEX_PLATFORM_SYSTEMS])});
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
      timetableSymbol: '',
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
    /const NAMES_23_MAIHAMA_SOGO = [\s\S]*?const DEFAULT_SYSTEM_KEY = '23-maihama-sogo';/,
    namesAndDefs.trimStart(),
  );

  const replacements = [
    [/URAYASU_HIGASHI_DANCHI_LINE_23/g, 'MAIHAMA_TAKASU_LINE'],
    [/urayasuHigashiDanchiLine23/g, 'maihamaTakasuLine'],
    [/UrayasuHigashiDanchiLine23/g, 'MaihamaTakasuLine'],
    [/urayasu-higashi-danchi-line-23-system-v1/g, 'maihama-takasu-line-system-v1'],
    [/urayasu23-/g, 'maihama25-'],
    [/浦安東団地線/g, '舞浜・高洲線'],
    [/route-23/g, 'route-25'],
    [/23-maihama-sogo/g, '25-maihama-takasu-seaside'],
    [/23-sogo-maihama/g, '25-takasu-seaside-maihama'],
    [/route23StopEditor/g, 'route25StopEditor'],
    [/openRoute23StopEditor/g, 'openRoute25StopEditor'],
    [/23系統/g, '25系統'],
    [/【２３系統】/g, '【２５系統】'],
    [/3系統/g, '19系統'],
    [/route-3/g, 'route-19'],
  ];
  for (const [from, to] of replacements) src = src.replace(from, to);

  // Fix over-replacement of system keys in SYSTEM_DEFINITIONS - restore all 4 systems
  // The above replaced 23-maihama-sogo globally; re-run defs block is already correct from namesAndDefs

  if (/URAYASU|urayasu-higashi-danchi-line-23|route-23|23-maihama|23-sogo/.test(src)) {
    throw new Error('template leak check failed');
  }

  fs.writeFileSync(path.join(ROOT, 'maihama-takasu-line-route-v1.js'), src, 'utf8');
  console.log('wrote maihama-takasu-line-route-v1.js');
}

function buildPathPolicy() {
  const minPts = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, Math.max(100, Math.floor(v.pathPoints * 0.85))]),
  );
  const expectedHashes = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, v.pathHash]),
  );
  const src = `// 舞浜・高洲線（route-25）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '${VERSION}-path';
  const MIN_PATH_POINTS_BY_SYSTEM = ${JSON.stringify(minPts, null, 2)};
  const EXPECTED_PATH_HASHES = ${JSON.stringify(expectedHashes, null, 2)};
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

  window.MAIHAMA_TAKASU_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsFor,
    validateRuntimePath,
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'maihama-takasu-line-path-policy-v1.js'), src, 'utf8');
  console.log('wrote path-policy');
}

function buildStopImages() {
  fs.writeFileSync(path.join(ROOT, 'maihama-takasu-line-stop-images-v1.js'), `// 舞浜・高洲線（route-25）停留所画像バンク。
(() => {
  window.MAIHAMA_TAKASU_LINE_STOP_IMAGES_V1 = window.MAIHAMA_TAKASU_LINE_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'maihama-takasu-line-stop-images-v1.css'), `/* route-25 舞浜・高洲線 停留所画像 */
.maihama25-stop-image { max-width: 100%; height: auto; border-radius: 8px; }
`, 'utf8');
  console.log('wrote stop-images');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
