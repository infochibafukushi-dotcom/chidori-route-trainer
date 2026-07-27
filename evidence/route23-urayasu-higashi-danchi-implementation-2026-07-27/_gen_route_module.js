'use strict';
/** Generate route-23 modules from wakashio-dori-line-22-route-v1.js template. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-urayasu-higashi-danchi-line-23-v1';
const EVIDENCE_DIR = 'evidence/route23-urayasu-higashi-danchi-implementation-2026-07-27';

const SYSTEMS = [
  { key: '23-maihama-sogo', constName: 'NAMES_23_MAIHAMA_SOGO', resolved: '2026-07-27-urayasu23-maihama-sogo-v1' },
  { key: '23-sogo-maihama', constName: 'NAMES_23_SOGO_MAIHAMA', resolved: '2026-07-27-urayasu23-sogo-maihama-v1' },
];

const DEFAULT_SYSTEM = '23-maihama-sogo';
const INDEX_PLATFORM_SYSTEMS = new Set(['23-maihama-sogo', '23-sogo-maihama']);

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'wakashio-dori-line-22-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 浦安東団地線（系統番号23・route-23）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★新浦安駅のりばH等では [3]/[23]/[11]/[18] が混載（Navi「3 [23]」併記）。出発のりば凡例で【２３系統】に解決した便のみ採用。
// ★3系統（route-3 / 浦安駅入口 terminal）relation 18417570/18417571/18417579 は使用禁止。
// 2運行パターン：18419895 outbound（舞浜→総合公園）/ 18419894 inbound。route-3 資産は流用しない。
// 停留所座標：OSM platform採用（byIndex）。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-23';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'urayasu-higashi-danchi-line-23-system-v1';
  const DISPLAY_CODE = '23';
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
    /const NAMES_22_SHINURAYASU_CHIDORI_GARAGE = [\s\S]*?const DEFAULT_SYSTEM_KEY = '22-shinurayasu-chidori-garage';/,
    namesAndDefs.trimStart(),
  );

  const replacements = [
    [/WAKASHIO_DORI_LINE_22/g, 'URAYASU_HIGASHI_DANCHI_LINE_23'],
    [/wakashioDoriLine22/g, 'urayasuHigashiDanchiLine23'],
    [/WakashioDoriLine22/g, 'UrayasuHigashiDanchiLine23'],
    [/wakashio-dori-line-22-system-v1/g, 'urayasu-higashi-danchi-line-23-system-v1'],
    [/wakashio-22-/g, 'urayasu23-'],
    [/若潮通り線/g, '浦安東団地線'],
    [/route-22/g, 'route-23'],
    [/22-shinurayasu-chidori-garage/g, '23-maihama-sogo'],
    [/22-chidori-garage-shinurayasu/g, '23-sogo-maihama'],
    [/22千鳥東/g, '23'],
    [/route22StopEditor/g, 'route23StopEditor'],
    [/openRoute22StopEditor/g, 'openRoute23StopEditor'],
    [/22系統/g, '23系統'],
    [/【２２系統】/g, '【２３系統】'],
    [/20系統/g, '3系統'],
    [/route-20/g, 'route-3'],
    [/千鳥車庫/g, '新浦安駅'],
  ];
  for (const [from, to] of replacements) src = src.replace(from, to);

  if (/WAKASHIO|wakashio-dori-line-22|route-22|22-shinurayasu|urayasu-higashi-danchi-route-v1|URAYASU_HIGASHI_DANCHI_PATH_V1[^_]|route-3-path/.test(src)) {
    throw new Error('template leak check failed');
  }
  if (src.includes('chidori-urayasu-higashi-danchi')) throw new Error('route-3 SYSTEM_KEY leak');

  fs.writeFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-route-v1.js'), src, 'utf8');
  console.log('wrote urayasu-higashi-danchi-line-23-route-v1.js');
}

function buildPathPolicy() {
  const minPts = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, Math.max(100, Math.floor(v.pathPoints * 0.85))]),
  );
  const expectedHashes = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, v.pathHash]),
  );
  const src = `// 浦安東団地線（route-23）道路形状ポリシー。
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

  window.URAYASU_HIGASHI_DANCHI_LINE_23_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsFor,
    validateRuntimePath,
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-path-policy-v1.js'), src, 'utf8');
  console.log('wrote path-policy');
}

function buildStopImages() {
  fs.writeFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-stop-images-v1.js'), `// 浦安東団地線（route-23）停留所画像バンク。
(() => {
  window.URAYASU_HIGASHI_DANCHI_LINE_23_STOP_IMAGES_V1 = window.URAYASU_HIGASHI_DANCHI_LINE_23_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-stop-images-v1.css'), `/* route-23 浦安東団地線 停留所画像 */
.urayasu23-stop-image { max-width: 100%; height: auto; border-radius: 8px; }
`, 'utf8');
  console.log('wrote stop-images');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
