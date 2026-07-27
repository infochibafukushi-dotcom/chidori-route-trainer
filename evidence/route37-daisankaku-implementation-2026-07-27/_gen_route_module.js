'use strict';
/** Generate route-37 modules from urayasu-higashi-danchi-line-23-route-v1.js template. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-daisankaku-line-v1';
const EVIDENCE_DIR = 'evidence/route37-daisankaku-implementation-2026-07-27';

const SYSTEMS = [
  { key: '37-minamigyotoku-tds', constName: 'NAMES_37_MINAMIGYOTOKU_TDS', resolved: '2026-07-27-daisankaku37-minamigyotoku-tds-v1' },
  { key: '37-minamigyotoku-maihama', constName: 'NAMES_37_MINAMIGYOTOKU_MAIHAMA', resolved: '2026-07-27-daisankaku37-minamigyotoku-maihama-v1' },
  { key: '37-tds-minamigyotoku', constName: 'NAMES_37_TDS_MINAMIGYOTOKU', resolved: '2026-07-27-daisankaku37-tds-minamigyotoku-v1' },
  { key: '37-maihama-minamigyotoku', constName: 'NAMES_37_MAIHAMA_MINAMIGYOTOKU', resolved: '2026-07-27-daisankaku37-maihama-minamigyotoku-v1' },
  { key: '37-tds-horie6', constName: 'NAMES_37_TDS_HORIE6', resolved: '2026-07-27-daisankaku37-tds-horie6-v1' },
  { key: '37-fujimi3-tds', constName: 'NAMES_37_FUJIMI3_TDS', resolved: '2026-07-27-daisankaku37-fujimi3-tds-v1' },
  { key: '37-horie6-tds', constName: 'NAMES_37_HORIE6_TDS', resolved: '2026-07-27-daisankaku37-horie6-tds-v1' },
];

const DEFAULT_SYSTEM = '37-minamigyotoku-tds';
const INDEX_PLATFORM_SYSTEMS = new Set(SYSTEMS.map((s) => s.key));

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 大三角線（系統番号37・route-37）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★route-9（舞浜線・浦安駅入口発）とは完全分離。南行徳↔舞浜/TDS は OSM 18323271/72 のみ。
// ★舞浜止まり vs TDS行きは別系統（符号無印/シー）。京成ローズタウン02/03は9混載→trip凡例で37のみ採用。
// 7運行パターン：18323271 outbound / 18323272 inbound + verified short turns。
// 停留所座標：OSM platform採用（byIndex）。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-37';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'daisankaku-line-system-v1';
  const DISPLAY_CODE = '37';
  const INDEX_PLATFORM_SYSTEMS = new Set(${JSON.stringify([...INDEX_PLATFORM_SYSTEMS])});
`;
  src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);

  const namesBlocks = SYSTEMS.map((s) => {
    const names = ORDERS.systems[s.key].stopNames;
    return `  const ${s.constName} = ${indentJson(names)};`;
  }).join('\n\n');

  const defs = SYSTEMS.map((s) => {
    const o = ORDERS.systems[s.key];
    const shortTurn = o.shortTurn ? `\n      shortTurn: true,` : '';
    return `    '${s.key}': {
      key: '${s.key}', displayCode: DISPLAY_CODE, directionGroup: '${o.directionGroup}',
      title: '${o.title}',
      summary: '${o.summary}',
      relationId: ${o.osmRelationId},
      timetableSymbol: '',
      naviCourse: '${o.course}',
      names: ${s.constName},${shortTurn}
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
    [/URAYASU_HIGASHI_DANCHI_LINE_23/g, 'DAISANKAKU_LINE'],
    [/urayasuHigashiDanchiLine23/g, 'daisankakuLine'],
    [/UrayasuHigashiDanchiLine23/g, 'DaisankakuLine'],
    [/urayasu-higashi-danchi-line-23-system-v1/g, 'daisankaku-line-system-v1'],
    [/urayasu23-/g, 'daisankaku37-'],
    [/浦安東団地線/g, '大三角線'],
    [/route-23/g, 'route-37'],
    [/23-maihama-sogo/g, '37-minamigyotoku-tds'],
    [/23-sogo-maihama/g, '37-tds-minamigyotoku'],
    [/route23StopEditor/g, 'route37StopEditor'],
    [/openRoute23StopEditor/g, 'openRoute37StopEditor'],
    [/23系統/g, '37系統'],
    [/【２３系統】/g, '【３７系統】'],
  ];
  for (const [from, to] of replacements) src = src.replace(from, to);

  if (/URAYASU_HIGASHI|urayasu-higashi-danchi-line-23|route-23'|'route-23|MAIHAMA_LINE_|route-9'|'route-9|9-maihama/.test(src)) {
    throw new Error('template leak check failed');
  }

  fs.writeFileSync(path.join(ROOT, 'daisankaku-line-route-v1.js'), src, 'utf8');
  console.log('wrote daisankaku-line-route-v1.js');
}

function buildPathPolicy() {
  const minPts = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, Math.max(80, Math.floor(v.pathPoints * 0.85))]),
  );
  const expectedHashes = Object.fromEntries(
    Object.entries(BUILD.systems).map(([k, v]) => [k, v.pathHash]),
  );
  const src = `// 大三角線（route-37）道路形状ポリシー。
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
    return MIN_PATH_POINTS_BY_SYSTEM[systemKey] || 80;
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

  window.DAISANKAKU_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsFor,
    validateRuntimePath,
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'daisankaku-line-path-policy-v1.js'), src, 'utf8');
  console.log('wrote path-policy');
}

function buildStopImages() {
  fs.writeFileSync(path.join(ROOT, 'daisankaku-line-stop-images-v1.js'), `// 大三角線（route-37）停留所画像バンク。
(() => {
  window.DAISANKAKU_LINE_STOP_IMAGES_V1 = window.DAISANKAKU_LINE_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'daisankaku-line-stop-images-v1.css'), `/* route-37 大三角線 停留所画像 */
.daisankaku37-stop-image { max-width: 100%; height: auto; border-radius: 8px; }
`, 'utf8');
  console.log('wrote stop-images');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
