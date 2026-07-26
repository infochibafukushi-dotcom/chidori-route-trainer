'use strict';
/**
 * Generate route-15 潮音の街線 modules by porting the benten-tomioka-line (route-14) pattern.
 *   shione-no-machi-line-route-v1.js
 *   shione-no-machi-line-path-policy-v1.js
 *   shione-no-machi-line-stop-images-v1.js / .css
 *
 * Stop names come from official-stop-orders.json only.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-shione-no-machi-line-v1';
const EVIDENCE_DIR = 'evidence/route15-shione-no-machi-implementation-2026-07-26';

const SYSTEMS = [
  { key: '15-takasu-seaside', constName: 'NAMES_15_TAKASU_SEASIDE', resolved: '2026-07-26-shione-no-machi-takasu-seaside-v1' },
  { key: '15-shinurayasu', constName: 'NAMES_15_SHINURAYASU', resolved: '2026-07-26-shione-no-machi-shinurayasu-v1' },
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'benten-tomioka-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 潮音の街線（系統番号15・route-15）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// 新浦安駅のりばEは [15] と [18]（および深夜バス）が同一コースセルに混載されるため、
// 系統の切り分けは時刻表凡例の符号で判定：無印=【１５系統】東京学館前経由 高洲海浜公園行き。
// ゆ／た／★た は【１８系統】であり、本モジュールでは採用しない。
// 停留所座標：OSM platform採用（往復それぞれ別relationのplatform。中央分離帯道路のため左右で座標が異なる）。
// 道路形状：OSM relation 18419865（往路）／18419864（復路）。Google Directionsは使用しない。
// 往路pathの反転による復路生成、および route-10 / route-18 / route-19 のpath流用は禁止。
(() => {
  const ROUTE_ID = 'route-15';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-shione-no-machi-line-system-v1';
  const DISPLAY_CODE = '15';
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

  const DEFAULT_SYSTEM_KEY = '15-takasu-seaside';`;

  const namesRe = /const NAMES_14_MAIHAMA = [\s\S]*?const DEFAULT_SYSTEM_KEY = '14-maihama';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/BENTEN_TOMIOKA_LINE/g, 'SHIONE_NO_MACHI_LINE'],
    [/bentenTomiokaLine/g, 'shioneNoMachiLine'],
    [/BentenTomioka/g, 'ShioneNoMachi'],
    [/benten-tomioka-/g, 'shione-no-machi-'],
    [/弁天・富岡線/g, '潮音の街線'],
    [/route-14/g, 'route-15'],
    [/route14StopEditor/g, 'route15StopEditor'],
    [/openRoute14StopEditor/g, 'openRoute15StopEditor'],
    [
      /route\.description = '[^']*'/,
      "route.description = '潮音の街線：2運行パターン（公式系統番号はいずれも15。新浦安駅のりばEでは符号 無印が【１５系統】）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（凡例の符号で【１５系統】を判定し18系統を除外）。座標・道路はOSM relation 18419865/18419864採用（要走行確認）。'",
    ],
    [
      /const order = \['14-maihama', '14-chidori-garage', '14-shinurayasu-maihama', '14-shinurayasu-chidori'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
    [
      /if \(!stop\.id \|\| \/\^shione-no-machi-14-\[\\w-\]\+-\\d\{2\}\$\/\.test\(stop\.id\)\) \{/,
      "if (!stop.id || /^shione-no-machi-15-[\\w-]+-\\d{2}$/.test(stop.id)) {",
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [];
  for (const needle of ['NAMES_14_', '14-maihama', '14-chidori-garage', '14-shinurayasu', 'BENTEN_TOMIOKA', 'bentenTomiokaLine', 'BentenTomioka', 'route-14', 'benten-tomioka-', '弁天・富岡線', 'shione-no-machi-14-', '千鳥車庫のりば02']) {
    if (src.includes(needle)) leftover.push(needle);
  }
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  const required = [
    "ROUTE_ID = 'route-15'",
    "DISPLAY_CODE = '15'",
    "SYSTEM_KEY = 'chidori-shione-no-machi-line-system-v1'",
    'window.SHIONE_NO_MACHI_LINE_ROUTE_V1',
    'SHIONE_NO_MACHI_LINE_PLATFORMS_V1',
    'SHIONE_NO_MACHI_LINE_PATH_V1',
    'SHIONE_NO_MACHI_LINE_PATH_POLICY_V1',
    'shioneNoMachiLineVersion',
    'shioneNoMachiLineStopImages',
    'shione-no-machi-15-',
    ...SYSTEMS.map((s) => `'${s.key}'`),
  ];
  const missing = required.filter((t) => !src.includes(t));
  if (missing.length) throw new Error(`MISSING ${missing.join(', ')}`);

  fs.writeFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote shione-no-machi-line-route-v1.js', src.length);
  return src;
}

function buildPathPolicy() {
  let src = fs.readFileSync(path.join(ROOT, 'benten-tomioka-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const minPoints = {};
  for (const s of SYSTEMS) {
    // Allow a small margin below the generated count so a future re-densify does not hard-fail.
    minPoints[s.key] = Math.max(50, Math.floor(BUILD.systems[s.key].pathPoints * 0.95));
  }
  const header = `// 潮音の街線（route-15）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（凡例 無印=【１５系統】。ゆ／た／★た＝18系統は除外）。
// 座標・道路：OSM relation 18419865（往路）/18419864（復路）採用（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-26-shione-no-machi-line-path-v1';
  const MIN_PATH_POINTS_BY_SYSTEM = ${indentJson(minPoints)};`;
  src = src.replace(/^\/\/[\s\S]*?const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\};/m, header);
  src = src.replace(/BENTEN_TOMIOKA_LINE_PATH_POLICY_V1/g, 'SHIONE_NO_MACHI_LINE_PATH_POLICY_V1');
  src = src.replace(/弁天・富岡線/g, '潮音の街線');
  if (src.includes('BENTEN_TOMIOKA') || src.includes('14-maihama')) throw new Error('policy leftover');
  for (const s of SYSTEMS) {
    if (!src.includes(`"${s.key}"`)) throw new Error(`policy missing ${s.key}`);
  }
  fs.writeFileSync(path.join(ROOT, 'shione-no-machi-line-path-policy-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote shione-no-machi-line-path-policy-v1.js', JSON.stringify(minPoints));
}

function buildStopImages() {
  const js = `// 潮音の街線（route-15）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.shioneNoMachiLineStopImages。
(() => {
  window.SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1 = window.SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-shione-no-machi-line-stop-images-v1',
    images: {},
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.js'), js.replace(/\n/g, '\r\n'), 'utf8');

  let css = fs.readFileSync(path.join(ROOT, 'benten-tomioka-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n');
  css = css.replace(/bentenTomiokaLine-stop-image/g, 'shioneNoMachiLine-stop-image')
    .replace(/弁天・富岡線/g, '潮音の街線')
    .replace(/route-14/g, 'route-15');
  fs.writeFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.css'), css.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote shione-no-machi-line-stop-images-v1.js / .css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
