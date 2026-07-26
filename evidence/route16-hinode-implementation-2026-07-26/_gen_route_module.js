'use strict';
/**
 * Generate route-16 日の出線 modules by porting the shione-no-machi-line (route-15) pattern.
 *   hinode-line-route-v1.js
 *   hinode-line-path-policy-v1.js
 *   hinode-line-stop-images-v1.js / .css
 *
 * Globals use the HINODE_LINE prefix. No route-17 module exists in this repo, and this
 * generator refuses to emit anything that references route-17 data.
 *
 * Stop names come from official-stop-orders.json only.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-hinode-line-v1';
const EVIDENCE_DIR = 'evidence/route16-hinode-implementation-2026-07-26';

const SYSTEMS = [
  { key: '16-hinode-nanachome', constName: 'NAMES_16_HINODE_NANACHOME', resolved: '2026-07-26-hinode-nanachome-v1' },
  { key: '16-shinurayasu', constName: 'NAMES_16_SHINURAYASU', resolved: '2026-07-26-hinode-shinurayasu-v1' },
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 日の出線（系統番号16・route-16）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★16系統と17系統は同じ「日の出線」名称・同じ 日の出七丁目 発着だが別系統。
//   16 = のりばC「[16]（プラウド新浦安パークマリーナ経由）日の出七丁目行」
//   17 = 日の出東経由（東京電力経由）。本モジュールでは17系統を一切採用しない。
// 系統の切り分けは出発のりばの時刻表凡例（符号→【Ｎ系統】）で判定済み。
// 停留所座標：OSM platform採用（往復それぞれ別relationのplatform）。
// 道路形状：OSM relation 18396563（往路）／18396562（復路）。Google Directionsは使用しない。
// 往路pathの反転による復路生成、および route-17（relation 18396568/18396569/18396583）の
// path流用は禁止。
(() => {
  const ROUTE_ID = 'route-16';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-hinode-line-system-v1';
  const DISPLAY_CODE = '16';
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

  const DEFAULT_SYSTEM_KEY = '16-hinode-nanachome';`;

  const namesRe = /const NAMES_15_TAKASU_SEASIDE = [\s\S]*?const DEFAULT_SYSTEM_KEY = '15-takasu-seaside';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/SHIONE_NO_MACHI_LINE/g, 'HINODE_LINE'],
    [/shioneNoMachiLine/g, 'hinodeLine'],
    [/ShioneNoMachi/g, 'Hinode'],
    [/shione-no-machi-/g, 'hinode-'],
    [/潮音の街線/g, '日の出線'],
    [/route-15/g, 'route-16'],
    [/route15StopEditor/g, 'route16StopEditor'],
    [/openRoute15StopEditor/g, 'openRoute16StopEditor'],
    [/hinode-15-/g, 'hinode-16-'],
    [
      /route\.description = '[^']*'/,
      "route.description = '日の出線：2運行パターン（公式系統番号はいずれも16。新浦安駅のりばCの[16]プラウド新浦安パークマリーナ経由。17系統＝日の出東経由は別系統）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりばの凡例で【１６系統】を判定し17系統を除外）。座標・道路はOSM relation 18396563/18396562採用（要走行確認）。'",
    ],
    [
      /const order = \['15-takasu-seaside', '15-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [
    'NAMES_15_', '15-takasu-seaside', '15-shinurayasu', 'SHIONE_NO_MACHI', 'shioneNoMachiLine',
    'ShioneNoMachi', 'route-15', 'shione-no-machi-', '潮音の街線', 'hinode-15-', '東京学館', '高洲',
  ].filter((needle) => src.includes(needle));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  // Route-17 must never leak into route-16 data. The header comment and route.description
  // name 17系統 on purpose (to tell the two apart), so scope the check to what actually
  // drives the app: the stop-name arrays, the system definitions, and the relation ids.
  const dataStart = src.indexOf('const NAMES_16_HINODE_NANACHOME');
  const dataEnd = src.indexOf("const DEFAULT_SYSTEM_KEY = '16-hinode-nanachome';");
  if (dataStart < 0 || dataEnd < 0) throw new Error('FAILED to locate route-16 data region');
  const dataRegion = src.slice(dataStart, dataEnd);
  const stopLeak = ['日の出東', '東京電力', '日の出小学校', 'アールフォーラム', '日の出保育園', '東口']
    .filter((n) => dataRegion.includes(n));
  if (stopLeak.length) throw new Error(`ROUTE17 STOP LEAK ${stopLeak.join(', ')}`);

  const body = src.slice(src.indexOf('(() => {'));
  const relLeak = ['18396568', '18396569', '18396583'].filter((n) => body.includes(n));
  if (relLeak.length) throw new Error(`ROUTE17 RELATION LEAK ${relLeak.join(', ')}`);

  const required = [
    "ROUTE_ID = 'route-16'",
    "DISPLAY_CODE = '16'",
    "SYSTEM_KEY = 'chidori-hinode-line-system-v1'",
    'window.HINODE_LINE_ROUTE_V1',
    'HINODE_LINE_PLATFORMS_V1',
    'HINODE_LINE_PATH_V1',
    'HINODE_LINE_PATH_POLICY_V1',
    'hinodeLineVersion',
    'hinodeLineStopImages',
    'hinode-16-',
    ...SYSTEMS.map((s) => `'${s.key}'`),
  ];
  const missing = required.filter((t) => !src.includes(t));
  if (missing.length) throw new Error(`MISSING ${missing.join(', ')}`);

  fs.writeFileSync(path.join(ROOT, 'hinode-line-route-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-route-v1.js', src.length);
  return src;
}

function buildPathPolicy() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const minPoints = {};
  for (const s of SYSTEMS) {
    // Allow a small margin below the generated count so a future re-densify does not hard-fail.
    minPoints[s.key] = Math.max(50, Math.floor(BUILD.systems[s.key].pathPoints * 0.95));
  }
  const header = `// 日の出線（route-16）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（出発のりばの凡例で【１６系統】を判定）。
// 17系統（日の出東経由）は同じ日の出七丁目発着の別系統であり、本ポリシーの対象外。
// 座標・道路：OSM relation 18396563（往路）/18396562（復路）採用（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-26-hinode-line-path-v1';
  const MIN_PATH_POINTS_BY_SYSTEM = ${indentJson(minPoints)};`;
  src = src.replace(/^\/\/[\s\S]*?const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\};/m, header);
  src = src.replace(/SHIONE_NO_MACHI_LINE_PATH_POLICY_V1/g, 'HINODE_LINE_PATH_POLICY_V1');
  src = src.replace(/潮音の街線/g, '日の出線');
  if (src.includes('SHIONE_NO_MACHI') || src.includes('15-takasu-seaside')) throw new Error('policy leftover');
  for (const s of SYSTEMS) {
    if (!src.includes(`"${s.key}"`)) throw new Error(`policy missing ${s.key}`);
  }
  fs.writeFileSync(path.join(ROOT, 'hinode-line-path-policy-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-path-policy-v1.js', JSON.stringify(minPoints));
}

function buildStopImages() {
  const js = `// 日の出線（route-16）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.hinodeLineStopImages。
(() => {
  window.HINODE_LINE_STOP_IMAGES_V1 = window.HINODE_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-hinode-line-stop-images-v1',
    images: {},
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'hinode-line-stop-images-v1.js'), js.replace(/\n/g, '\r\n'), 'utf8');

  let css = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n');
  css = css.replace(/shioneNoMachiLine-stop-image/g, 'hinodeLine-stop-image')
    .replace(/潮音の街線/g, '日の出線')
    .replace(/route-15/g, 'route-16');
  fs.writeFileSync(path.join(ROOT, 'hinode-line-stop-images-v1.css'), css.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-stop-images-v1.js / .css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
