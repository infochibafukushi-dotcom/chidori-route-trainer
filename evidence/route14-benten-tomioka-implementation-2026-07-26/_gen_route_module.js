'use strict';
/**
 * Generate route-14 弁天・富岡線 modules by porting the maihama-resort-line (route-12) pattern.
 *   benten-tomioka-line-route-v1.js
 *   benten-tomioka-line-path-policy-v1.js
 *   benten-tomioka-line-stop-images-v1.js / .css
 *
 * Stop names come from official-stop-orders.json only.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-benten-tomioka-line-v1';
const EVIDENCE_DIR = 'evidence/route14-benten-tomioka-implementation-2026-07-26';

const SYSTEMS = [
  { key: '14-maihama', constName: 'NAMES_14_MAIHAMA', resolved: '2026-07-26-benten-tomioka-maihama-v1' },
  { key: '14-chidori-garage', constName: 'NAMES_14_CHIDORI_GARAGE', resolved: '2026-07-26-benten-tomioka-chidori-garage-v1' },
  { key: '14-shinurayasu-maihama', constName: 'NAMES_14_SHINURAYASU_MAIHAMA', resolved: '2026-07-26-benten-tomioka-shinurayasu-maihama-v1' },
  { key: '14-shinurayasu-chidori', constName: 'NAMES_14_SHINURAYASU_CHIDORI', resolved: '2026-07-26-benten-tomioka-shinurayasu-chidori-v1' },
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'maihama-resort-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 弁天・富岡線（系統番号14・route-14）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// 系統の切り分けは時刻表凡例の符号で判定：無印=舞浜駅行／新浦安駅行、ち=千鳥車庫行、し=千鳥車庫発新浦安駅行。
// 千鳥車庫のりば02は[2]/[4]/[6]/[14]混載のため、コース名だけでは系統を確定しない。
// 停留所座標：OSM platform採用（4系統それぞれ別relationのplatform）。
// 道路形状：OSM relation 18323926 / 18419877 / 9983017 / 18419876。Google Directionsは使用しない。
// 往路pathの反転や、舞浜便pathの切り詰めによる千鳥車庫便pathの生成は禁止。
(() => {
  const ROUTE_ID = 'route-14';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-benten-tomioka-line-system-v1';
  const DISPLAY_CODE = '14';
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

  const DEFAULT_SYSTEM_KEY = '14-maihama';`;

  const namesRe = /const NAMES_12_MAIHAMA_VIA_RESORT = [\s\S]*?const DEFAULT_SYSTEM_KEY = '12-maihama-via-resort';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/MAIHAMA_RESORT_LINE/g, 'BENTEN_TOMIOKA_LINE'],
    [/maihamaResortLine/g, 'bentenTomiokaLine'],
    [/maihama-resort-/g, 'benten-tomioka-'],
    [/舞浜リゾート線/g, '弁天・富岡線'],
    [/route-12/g, 'route-14'],
    [/route12StopEditor/g, 'route14StopEditor'],
    [/openRoute6StopEditor/g, 'openRoute14StopEditor'],
    [/renderShiyakushoStopList/g, 'renderBentenTomiokaStopList'],
    [/routesShiyakushoV1/g, 'routesBentenTomiokaLineV1'],
    [/stopEditorMaihamaResortLineV1/g, 'stopEditorBentenTomiokaLineV1'],
    [
      /route\.description = '[^']*'/,
      "route.description = '弁天・富岡線：4運行パターン（公式系統番号はいずれも14。符号 無印／ち／し）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（凡例の符号で系統判定）。座標・道路はOSM relation 18323926/18419877/9983017/18419876採用（要走行確認）。'",
    ],
    [
      /const order = \['12-maihama-via-resort', '12-urayasu-via-resort'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
    [
      /if \(!stop\.id \|\| \/\^benten-tomioka-12-\[\\w-\]\+-\\d\{2\}\$\/\.test\(stop\.id\)\) \{/,
      "if (!stop.id || /^benten-tomioka-14-[\\w-]+-\\d{2}$/.test(stop.id)) {",
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [];
  for (const needle of ['NAMES_12_', '12-maihama-via-resort', '12-urayasu-via-resort', 'MAIHAMA_RESORT', 'maihamaResortLine', 'route-12', 'maihama-resort-', '舞浜リゾート線', 'Shiyakusho', 'shiyakusho', 'benten-tomioka-12-']) {
    if (src.includes(needle)) leftover.push(needle);
  }
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  const required = [
    "ROUTE_ID = 'route-14'",
    "DISPLAY_CODE = '14'",
    "SYSTEM_KEY = 'chidori-benten-tomioka-line-system-v1'",
    'window.BENTEN_TOMIOKA_LINE_ROUTE_V1',
    'BENTEN_TOMIOKA_LINE_PLATFORMS_V1',
    'BENTEN_TOMIOKA_LINE_PATH_V1',
    'BENTEN_TOMIOKA_LINE_PATH_POLICY_V1',
    'bentenTomiokaLineVersion',
    'bentenTomiokaLineStopImages',
    'benten-tomioka-14-',
    ...SYSTEMS.map((s) => `'${s.key}'`),
  ];
  const missing = required.filter((t) => !src.includes(t));
  if (missing.length) throw new Error(`MISSING ${missing.join(', ')}`);

  fs.writeFileSync(path.join(ROOT, 'benten-tomioka-line-route-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote benten-tomioka-line-route-v1.js', src.length);
  return src;
}

function buildPathPolicy() {
  let src = fs.readFileSync(path.join(ROOT, 'maihama-resort-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const minPoints = {};
  for (const s of SYSTEMS) {
    // Allow a small margin below the generated count so a future re-densify does not hard-fail.
    minPoints[s.key] = Math.max(50, Math.floor(BUILD.systems[s.key].pathPoints * 0.95));
  }
  const header = `// 弁天・富岡線（route-14）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（符号 無印／ち／し）。
// 座標・道路：OSM relation 18323926/18419877/9983017/18419876採用（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-26-benten-tomioka-line-path-v1';
  const MIN_PATH_POINTS_BY_SYSTEM = ${indentJson(minPoints)};`;
  src = src.replace(/^\/\/[\s\S]*?const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\};/m, header);
  src = src.replace(/MAIHAMA_RESORT_LINE_PATH_POLICY_V1/g, 'BENTEN_TOMIOKA_LINE_PATH_POLICY_V1');
  src = src.replace(/舞浜リゾート線/g, '弁天・富岡線');
  if (src.includes('MAIHAMA_RESORT') || src.includes('12-maihama-via-resort')) throw new Error('policy leftover');
  for (const s of SYSTEMS) {
    if (!src.includes(`"${s.key}"`)) throw new Error(`policy missing ${s.key}`);
  }
  fs.writeFileSync(path.join(ROOT, 'benten-tomioka-line-path-policy-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote benten-tomioka-line-path-policy-v1.js', JSON.stringify(minPoints));
}

function buildStopImages() {
  const js = `// 弁天・富岡線（route-14）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.bentenTomiokaLineStopImages。
(() => {
  window.BENTEN_TOMIOKA_LINE_STOP_IMAGES_V1 = window.BENTEN_TOMIOKA_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-benten-tomioka-line-stop-images-v1',
    images: {},
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'benten-tomioka-line-stop-images-v1.js'), js.replace(/\n/g, '\r\n'), 'utf8');

  let css = fs.readFileSync(path.join(ROOT, 'maihama-resort-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n');
  css = css.replace(/maihamaResortLine-stop-image/g, 'bentenTomiokaLine-stop-image')
    .replace(/舞浜リゾート線/g, '弁天・富岡線')
    .replace(/route-12/g, 'route-14');
  fs.writeFileSync(path.join(ROOT, 'benten-tomioka-line-stop-images-v1.css'), css.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote benten-tomioka-line-stop-images-v1.js / .css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
