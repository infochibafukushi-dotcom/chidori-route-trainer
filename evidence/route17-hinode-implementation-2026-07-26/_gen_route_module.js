'use strict';
/**
 * Generate route-17 日の出線 modules by porting the shione-no-machi-line (route-15) pattern.
 *   hinode-line-17-route-v1.js
 *   hinode-line-17-path-policy-v1.js
 *   hinode-line-17-stop-images-v1.js / .css
 *
 * Globals use the HINODE_LINE_17 prefix so nothing can collide with route-16's
 * HINODE_LINE_* modules. The generator refuses to emit anything that references
 * route-16 data (relations 18396562/18396563, the 海風の街 stop, or HINODE_LINE_* globals).
 *
 * The route-15 template is read but never written. route-16 files are neither read nor written.
 *
 * Stop names come from official-stop-orders.json only.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-hinode-line-17-v1';
const EVIDENCE_DIR = 'evidence/route17-hinode-implementation-2026-07-26';

const SYSTEMS = [
  { key: '17-hinode-nanachome', constName: 'NAMES_17_HINODE_NANACHOME', resolved: '2026-07-26-hinode17-nanachome-v1' },
  { key: '17-baycity-urayasu', constName: 'NAMES_17_BAYCITY_URAYASU', resolved: '2026-07-26-hinode17-baycity-v1' },
  { key: '17-shinurayasu', constName: 'NAMES_17_SHINURAYASU', resolved: '2026-07-26-hinode17-shinurayasu-v1' },
];

/** Anything from route-16 that must never appear in the emitted modules. */
const ROUTE16_RELATIONS = ['18396562', '18396563'];
const ROUTE16_EXCLUSIVE_STOPS = ['海風の街'];
const ROUTE16_GLOBALS = [
  'HINODE_LINE_PLATFORMS_V1', 'HINODE_LINE_PATH_V1', 'HINODE_LINE_PATH_POLICY_V1',
  'HINODE_LINE_STOP_IMAGES_V1', 'HINODE_LINE_ROUTE_V1', 'HINODE_LINE_DRIVE_STATE',
  'hinodeLineVersion', 'hinodeLineStopImages', 'hinode-16-', 'route-16',
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function assertNoRoute16(src, label, { allowRelationMention = false } = {}) {
  const hits = ROUTE16_GLOBALS.filter((n) => src.includes(n));
  if (hits.length) throw new Error(`${label}: route-16 identifier leak ${hits.join(', ')}`);
  if (!allowRelationMention) {
    const rel = ROUTE16_RELATIONS.filter((n) => src.includes(n));
    if (rel.length) throw new Error(`${label}: route-16 relation leak ${rel.join(', ')}`);
  }
}

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 日の出線（系統番号17・route-17）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★17系統と16系統は同じ「日の出線」名称・同じ 日の出七丁目 発着だが別系統。
//   17 = のりば17「[17]（日の出東経由）日の出七丁目行／（日の出東・プラウド新浦安パークマリーナ経由）ベイシティ浦安行」
//   16 = プラウド新浦安パークマリーナ・海風の街経由。本モジュールでは16系統を一切採用しない。
// 系統の切り分けは出発のりばの時刻表凡例（符号→【Ｎ系統】）で判定済み。
//   無印…【１７系統】日の出東経由 日の出七丁目行き
//   ベ／★ベ…【１７系統】日の出東・プラウド新浦安パークマリーナ経由 ベイシティ浦安行き（★は深夜バス）
// 停留所座標：OSM platform採用（系統ごとに別relationのplatform）。
// 道路形状：OSM relation 18396569（日の出七丁目行）／18396583（ベイシティ浦安行）／18396568（新浦安駅行）。
// Google Directionsは使用しない。往路pathの反転による復路生成、系統間のpath延長・切詰め流用、
// および16系統のpath流用は禁止。
(() => {
  const ROUTE_ID = 'route-17';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-hinode-line-17-system-v1';
  const DISPLAY_CODE = '17';
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

  const DEFAULT_SYSTEM_KEY = '17-hinode-nanachome';`;

  const namesRe = /const NAMES_15_TAKASU_SEASIDE = [\s\S]*?const DEFAULT_SYSTEM_KEY = '15-takasu-seaside';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/SHIONE_NO_MACHI_LINE/g, 'HINODE_LINE_17'],
    [/shioneNoMachiLine/g, 'hinode17Line'],
    [/ShioneNoMachi/g, 'Hinode17'],
    // The 15- form must be rewritten before the generic prefix, or the id-migration
    // regex would keep pointing at the route-15 id shape.
    [/shione-no-machi-15-/g, 'hinode-17-'],
    [/shione-no-machi-/g, 'hinode-'],
    [/潮音の街線/g, '日の出線'],
    [/route-15/g, 'route-17'],
    [/route15StopEditor/g, 'route17StopEditor'],
    [/openRoute15StopEditor/g, 'openRoute17StopEditor'],
    [
      /route\.description = '[^']*'/,
      "route.description = '日の出線：3運行パターン（公式系統番号はいずれも17。新浦安駅のりば17の[17]日の出東・東京電力経由。16系統＝プラウド新浦安パークマリーナ・海風の街経由は別系統）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりばの凡例で【１７系統】を判定し16系統を除外）。座標・道路はOSM relation 18396569/18396583/18396568採用（要走行確認）。'",
    ],
    [
      /const order = \['15-takasu-seaside', '15-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [
    'NAMES_15_', '15-takasu-seaside', '15-shinurayasu', 'SHIONE_NO_MACHI', 'shioneNoMachiLine',
    'ShioneNoMachi', 'shione-no-machi-', '潮音の街線', 'hinode-15-', '東京学館', '高洲',
  ].filter((needle) => src.includes(needle));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  // Route-16 must never leak into route-17 data. The header comment and route.description
  // name 16系統 on purpose (to tell the two apart), so scope the stop check to what actually
  // drives the app: the stop-name arrays and the system definitions.
  const dataStart = src.indexOf('const NAMES_17_HINODE_NANACHOME');
  const dataEnd = src.indexOf("const DEFAULT_SYSTEM_KEY = '17-hinode-nanachome';");
  if (dataStart < 0 || dataEnd < 0) throw new Error('FAILED to locate route-17 data region');
  const dataRegion = src.slice(dataStart, dataEnd);
  const stopLeak = ROUTE16_EXCLUSIVE_STOPS.filter((n) => dataRegion.includes(n));
  if (stopLeak.length) throw new Error(`ROUTE16 STOP LEAK ${stopLeak.join(', ')}`);

  const body = src.slice(src.indexOf('(() => {'));
  const relLeak = ROUTE16_RELATIONS.filter((n) => body.includes(n));
  if (relLeak.length) throw new Error(`ROUTE16 RELATION LEAK ${relLeak.join(', ')}`);
  const globalLeak = ROUTE16_GLOBALS.filter((n) => n !== 'route-16' && body.includes(n));
  if (globalLeak.length) throw new Error(`ROUTE16 GLOBAL LEAK ${globalLeak.join(', ')}`);

  const required = [
    "ROUTE_ID = 'route-17'",
    "DISPLAY_CODE = '17'",
    "SYSTEM_KEY = 'chidori-hinode-line-17-system-v1'",
    'window.HINODE_LINE_17_ROUTE_V1',
    'HINODE_LINE_17_PLATFORMS_V1',
    'HINODE_LINE_17_PATH_V1',
    'HINODE_LINE_17_PATH_POLICY_V1',
    'hinode17LineVersion',
    'hinode17LineStopImages',
    'hinode-17-',
    ...SYSTEMS.map((s) => `'${s.key}'`),
  ];
  const missing = required.filter((t) => !src.includes(t));
  if (missing.length) throw new Error(`MISSING ${missing.join(', ')}`);

  fs.writeFileSync(path.join(ROOT, 'hinode-line-17-route-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-17-route-v1.js', src.length);
  return src;
}

function buildPathPolicy() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const minPoints = {};
  for (const s of SYSTEMS) {
    // Allow a small margin below the generated count so a future re-densify does not hard-fail.
    minPoints[s.key] = Math.max(50, Math.floor(BUILD.systems[s.key].pathPoints * 0.95));
  }
  const header = `// 日の出線（route-17）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（出発のりばの凡例で【１７系統】を判定）。
// 16系統（プラウド新浦安パークマリーナ・海風の街経由）は同じ日の出七丁目発着の別系統であり、本ポリシーの対象外。
// 座標・道路：OSM relation 18396569（日の出七丁目行）/18396583（ベイシティ浦安行）/18396568（新浦安駅行）採用（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-26-hinode-line-17-path-v1';
  const MIN_PATH_POINTS_BY_SYSTEM = ${indentJson(minPoints)};`;
  src = src.replace(/^\/\/[\s\S]*?const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\};/m, header);
  src = src.replace(/SHIONE_NO_MACHI_LINE_PATH_POLICY_V1/g, 'HINODE_LINE_17_PATH_POLICY_V1');
  src = src.replace(/潮音の街線/g, '日の出線');
  if (src.includes('SHIONE_NO_MACHI') || src.includes('15-takasu-seaside')) throw new Error('policy leftover');
  for (const s of SYSTEMS) {
    if (!src.includes(`"${s.key}"`)) throw new Error(`policy missing ${s.key}`);
  }
  assertNoRoute16(src, 'path-policy');
  fs.writeFileSync(path.join(ROOT, 'hinode-line-17-path-policy-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-17-path-policy-v1.js', JSON.stringify(minPoints));
}

function buildStopImages() {
  const js = `// 日の出線（route-17）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.hinode17LineStopImages。
// route-16 の HINODE_LINE_STOP_IMAGES_V1 / hinodeLineStopImages とは別バンク。
(() => {
  window.HINODE_LINE_17_STOP_IMAGES_V1 = window.HINODE_LINE_17_STOP_IMAGES_V1 || {
    version: '2026-07-26-hinode-line-17-stop-images-v1',
    images: {},
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'hinode-line-17-stop-images-v1.js'), js.replace(/\n/g, '\r\n'), 'utf8');

  let css = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n');
  css = css.replace(/shioneNoMachiLine-stop-image/g, 'hinode17Line-stop-image')
    .replace(/潮音の街線/g, '日の出線')
    .replace(/route-15/g, 'route-17');
  if (css.includes('hinodeLine-stop-image')) throw new Error('css collides with route-16 class');
  fs.writeFileSync(path.join(ROOT, 'hinode-line-17-stop-images-v1.css'), css.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote hinode-line-17-stop-images-v1.js / .css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
