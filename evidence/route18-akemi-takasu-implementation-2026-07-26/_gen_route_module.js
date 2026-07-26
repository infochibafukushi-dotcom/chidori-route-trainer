'use strict';
/**
 * Generate route-18 明海・高洲線 modules by porting the shione-no-machi-line (route-15) pattern.
 *   akemi-takasu-line-route-v1.js
 *   akemi-takasu-line-path-policy-v1.js
 *   akemi-takasu-line-stop-images-v1.js / .css
 *
 * Globals use the AKEMI_TAKASU_LINE prefix. The generator refuses to emit anything that
 * references route-15 data (relations 18419865/18419864, the 明海交差点/入船橋/高洲 stops,
 * or SHIONE_NO_MACHI_LINE_* globals) or the sibling routes 19 / 10 / 11 / 3 / 23.
 *
 * Unlike route-17, 高洲 and 東京学館前 cannot be blanket-banned as leftovers: 高洲橋 / 高洲中央公園 /
 * 高洲海浜公園 / 高洲北小学校 / 高洲八丁目 / 高洲四丁目 / 高洲三丁目 / 高洲西児童公園 / 高洲二丁目 and
 * 東京学館前 are all legitimate route-18 stops. Sibling stops are therefore checked as exact,
 * quoted stop-array entries instead of substrings.
 *
 * The route-15 template is read but never written. Stop names come from official-stop-orders.json only.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-akemi-takasu-line-v1';
const EVIDENCE_DIR = 'evidence/route18-akemi-takasu-implementation-2026-07-26';

const SYSTEMS = [
  { key: '18-takasu-seaside', constName: 'NAMES_18_TAKASU_SEASIDE', resolved: '2026-07-26-akemitakasu18-takasu-seaside-v1' },
  { key: '18-urayasu-eki-iriguchi', constName: 'NAMES_18_URAYASU_EKI_IRIGUCHI', resolved: '2026-07-26-akemitakasu18-urayasu-eki-iriguchi-v1' },
  { key: '18-takasu-kita-shogakko', constName: 'NAMES_18_TAKASU_KITA_SHOGAKKO', resolved: '2026-07-26-akemitakasu18-takasu-kita-shogakko-v1' },
  { key: '18-takasu-seaside-from-shinurayasu', constName: 'NAMES_18_TAKASU_SEASIDE_FROM_SHINURAYASU', resolved: '2026-07-26-akemitakasu18-takasu-seaside-from-shinurayasu-v1' },
  { key: '18-shinurayasu-from-takasu', constName: 'NAMES_18_SHINURAYASU_FROM_TAKASU', resolved: '2026-07-26-akemitakasu18-shinurayasu-from-takasu-v1' },
];

const DEFAULT_SYSTEM = '18-takasu-seaside';

/** Anything from a sibling route that must never appear in the emitted route-18 data. */
const SIBLING_RELATIONS = [
  '18419865', '18419864', // 15
  '18381771', '18381770', // 19
  '18381757', '18381756', // 10
  '18352883', '18352884', '18419852', // 11
  '18417570', '18417571', '18417579', // 3
  '18419894', '18419895', // 23
];
/** Exact stop names owned by sibling routes. Checked as quoted array entries, never as substrings. */
const SIBLING_EXCLUSIVE_STOPS = [
  '明海交差点', '入船橋', '高洲', // 15
  '浦安南高校', '特別養護老人ホーム', // 19
  'みなと南', // 10
  'ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '日の出南', '新浦安温泉', // 11
  '総合公園', 'ベイサイドホテルエリア', '望海の街', '明海五丁目', 'ハイアットリージェンシー', '三井ガーデンホテル', '明海南小学校', '明海六丁目', // 3/23
];
const SIBLING_GLOBALS = [
  'SHIONE_NO_MACHI_LINE_PLATFORMS_V1', 'SHIONE_NO_MACHI_LINE_PATH_V1', 'SHIONE_NO_MACHI_LINE_PATH_POLICY_V1',
  'SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1', 'SHIONE_NO_MACHI_LINE_ROUTE_V1', 'SHIONE_NO_MACHI_LINE_DRIVE_STATE',
  'shioneNoMachiLine', 'ShioneNoMachi', 'shione-no-machi-', '潮音の街線',
  'HINODE_LINE_17', 'hinode17Line', 'HINODE_LINE_PLATFORMS_V1',
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function assertNoSiblingLeak(src, label, { allowRelationMention = false } = {}) {
  const hits = SIBLING_GLOBALS.filter((n) => src.includes(n));
  if (hits.length) throw new Error(`${label}: sibling identifier leak ${hits.join(', ')}`);
  if (!allowRelationMention) {
    const rel = SIBLING_RELATIONS.filter((n) => src.includes(n));
    if (rel.length) throw new Error(`${label}: sibling relation leak ${rel.join(', ')}`);
  }
}

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 明海・高洲線（系統番号18・route-18）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★新浦安駅のりばEは [15] と [18]（および深夜バス）を完全同一のコース名で混載する。
//   系統の切り分けは2段凡例ゲート（掲載時刻表の凡例＋出発のりばの凡例）で判定済み。
//   無印…【１５系統】東京学館前経由 高洲海浜公園行き ← 本モジュールでは採用しない
//   ゆ…【１８系統】夢海の街、高洲橋、潮音の街経由 高洲海浜公園行き（通し／新浦安駅発短縮）
//   う…【１８系統】夢海の街、新浦安駅経由 浦安駅入口行き
//   た／★た…【１８系統】夢海の街・潮音の街・高洲四丁目経由 高洲北小学校行き（★は深夜バス・運賃倍額）
// 18系統固有の経由地は 明海大学前・海風の街・夢海の街・高洲橋。15系統固有の 明海交差点・入船橋・高洲 は通らない。
// 停留所座標：OSM platform採用（系統ごとに別relationのplatform。中央分離帯道路のため往復で座標が異なる）。
// 道路形状：OSM relation 18352908／18352907／18417590。新浦安駅発着短縮便は検証済み composition
// （のりばE始発＝18417590∩18352908、降車のりばX＝18352907接頭＋18352908ロータリー）。
// Google Directionsは使用しない。往路pathの反転による復路生成、blind mid-station slice、
// および15/19/10/11/3/23系統のpath流用は禁止。
(() => {
  const ROUTE_ID = 'route-18';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-akemi-takasu-line-system-v1';
  const DISPLAY_CODE = '18';
`;
  src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);

  const namesBlocks = SYSTEMS.map((s) => {
    const names = ORDERS.systems[s.key].stopNames;
    return `  const ${s.constName} = ${indentJson(names)};`;
  }).join('\n\n');

  const defs = SYSTEMS.map((s) => {
    const o = ORDERS.systems[s.key];
    const relationId = o.osmRelationId == null ? 'null' : String(o.osmRelationId);
    return `    '${s.key}': {
      key: '${s.key}', displayCode: DISPLAY_CODE, directionGroup: '${o.directionGroup}',
      title: '${o.title}',
      summary: '${o.summary}',
      relationId: ${relationId},
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

  const namesRe = /const NAMES_15_TAKASU_SEASIDE = [\s\S]*?const DEFAULT_SYSTEM_KEY = '15-takasu-seaside';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/SHIONE_NO_MACHI_LINE/g, 'AKEMI_TAKASU_LINE'],
    [/shioneNoMachiLine/g, 'akemiTakasuLine'],
    [/ShioneNoMachi/g, 'AkemiTakasu'],
    // The 15- form must be rewritten before the generic prefix, or the id-migration
    // regex would keep pointing at the route-15 id shape.
    [/shione-no-machi-15-/g, 'akemi-takasu-18-'],
    [/shione-no-machi-/g, 'akemi-takasu-'],
    [/潮音の街線/g, '明海・高洲線'],
    [/route-15/g, 'route-18'],
    [/route15StopEditor/g, 'route18StopEditor'],
    [/openRoute15StopEditor/g, 'openRoute18StopEditor'],
    [
      /route\.description = '[^']*'/,
      "route.description = '明海・高洲線：5運行パターン（公式系統番号はいずれも18。新浦安駅のりばEでは符号 ゆ／た／★た、浦安駅入口のりば11では符号 ゆ、高洲海浜公園のりば03では符号 う／ゆ が【１８系統】）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（掲載時刻表と出発のりばの2段凡例で【１８系統】を判定し15/19/10/11/3/23系統を除外）。座標・道路はOSM relation 18352908/18352907/18417590採用。新浦安駅発着短縮便は検証済みcomposition（のりばE／のりばX）。'",
    ],
    [
      /const order = \['15-takasu-seaside', '15-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [
    'NAMES_15_', '15-takasu-seaside', '15-shinurayasu', 'SHIONE_NO_MACHI', 'shioneNoMachiLine',
    'ShioneNoMachi', 'shione-no-machi-', '潮音の街線', 'akemi-takasu-15-', 'route-15',
    'route15StopEditor', 'openRoute15StopEditor',
  ].filter((needle) => src.includes(needle));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  // Sibling routes must never leak into route-18 data. The header comment and route.description
  // name 15系統 on purpose (to tell the two apart), so scope the stop check to what actually
  // drives the app: the stop-name arrays and the system definitions.
  const dataStart = src.indexOf(`const ${SYSTEMS[0].constName}`);
  const dataEnd = src.indexOf(`const DEFAULT_SYSTEM_KEY = '${DEFAULT_SYSTEM}';`);
  if (dataStart < 0 || dataEnd < 0) throw new Error('FAILED to locate route-18 data region');
  const dataRegion = src.slice(dataStart, dataEnd);
  const stopLeak = SIBLING_EXCLUSIVE_STOPS.filter((n) => dataRegion.includes(`"${n}"`) || dataRegion.includes(`'${n}'`));
  if (stopLeak.length) throw new Error(`SIBLING STOP LEAK ${stopLeak.join(', ')}`);

  // Every stop name in the emitted arrays must come from official-stop-orders.json.
  const officialNames = new Set(SYSTEMS.flatMap((s) => ORDERS.systems[s.key].stopNames));
  for (const m of dataRegion.matchAll(/"([^"]+)"/g)) {
    if (!officialNames.has(m[1])) throw new Error(`UNOFFICIAL STOP NAME in data region: ${m[1]}`);
  }

  const body = src.slice(src.indexOf('(() => {'));
  const relLeak = SIBLING_RELATIONS.filter((n) => body.includes(n));
  if (relLeak.length) throw new Error(`SIBLING RELATION LEAK ${relLeak.join(', ')}`);
  const globalLeak = SIBLING_GLOBALS.filter((n) => body.includes(n));
  if (globalLeak.length) throw new Error(`SIBLING GLOBAL LEAK ${globalLeak.join(', ')}`);

  const required = [
    "ROUTE_ID = 'route-18'",
    "DISPLAY_CODE = '18'",
    "SYSTEM_KEY = 'chidori-akemi-takasu-line-system-v1'",
    'window.AKEMI_TAKASU_LINE_ROUTE_V1',
    'AKEMI_TAKASU_LINE_PLATFORMS_V1',
    'AKEMI_TAKASU_LINE_PATH_V1',
    'AKEMI_TAKASU_LINE_PATH_POLICY_V1',
    'akemiTakasuLineVersion',
    'akemiTakasuLineStopImages',
    'akemi-takasu-18-',
    ...SYSTEMS.map((s) => `'${s.key}'`),
  ];
  const missing = required.filter((t) => !src.includes(t));
  if (missing.length) throw new Error(`MISSING ${missing.join(', ')}`);

  if (!src.includes('©山本信勝') && fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8').includes('©山本信勝')) {
    throw new Error('copyright notice ©山本信勝 was lost');
  }

  fs.writeFileSync(path.join(ROOT, 'akemi-takasu-line-route-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote akemi-takasu-line-route-v1.js', src.length);
  return src;
}

function buildPathPolicy() {
  let src = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
  const minPoints = {};
  for (const s of SYSTEMS) {
    // Allow a small margin below the generated count so a future re-densify does not hard-fail.
    minPoints[s.key] = Math.max(50, Math.floor(BUILD.systems[s.key].pathPoints * 0.95));
  }
  const header = `// 明海・高洲線（route-18）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（掲載時刻表と出発のりばの2段凡例で【１８系統】を判定）。
// 15系統（東京学館前・高洲経由）は新浦安駅のりばE・高洲海浜公園のりば03を共有する別系統であり、本ポリシーの対象外。
// 座標・道路：OSM relation 18352908／18352907／18417590。短縮便2本は検証済み composition（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-26-akemi-takasu-line-path-v1';
  const MIN_PATH_POINTS_BY_SYSTEM = ${indentJson(minPoints)};`;
  src = src.replace(/^\/\/[\s\S]*?const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\};/m, header);
  src = src.replace(/SHIONE_NO_MACHI_LINE_PATH_POLICY_V1/g, 'AKEMI_TAKASU_LINE_PATH_POLICY_V1');
  src = src.replace(/SHIONE_NO_MACHI_LINE/g, 'AKEMI_TAKASU_LINE');
  src = src.replace(/潮音の街線/g, '明海・高洲線');
  src = src.replace(/route-15/g, 'route-18');
  if (src.includes('SHIONE_NO_MACHI') || src.includes('15-takasu-seaside') || src.includes('15-shinurayasu')) {
    throw new Error('policy leftover');
  }
  for (const s of SYSTEMS) {
    if (!src.includes(`"${s.key}"`)) throw new Error(`policy missing ${s.key}`);
  }
  assertNoSiblingLeak(src, 'path-policy');
  fs.writeFileSync(path.join(ROOT, 'akemi-takasu-line-path-policy-v1.js'), src.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote akemi-takasu-line-path-policy-v1.js', JSON.stringify(minPoints));
}

function buildStopImages() {
  const js = `// 明海・高洲線（route-18）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.akemiTakasuLineStopImages。
// 潮音の街線（route-15）や日の出線（route-17）の画像バンクとは独立したストア。
// 画像は捏造しない。初期状態は空バンク。
(() => {
  window.AKEMI_TAKASU_LINE_STOP_IMAGES_V1 = window.AKEMI_TAKASU_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-akemi-takasu-line-stop-images-v1',
    images: {},
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'akemi-takasu-line-stop-images-v1.js'), js.replace(/\n/g, '\r\n'), 'utf8');

  let css = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n');
  css = css.replace(/shioneNoMachiLine-stop-image/g, 'akemiTakasuLine-stop-image')
    .replace(/潮音の街線/g, '明海・高洲線')
    .replace(/route-15/g, 'route-18');
  if (css.includes('shioneNoMachiLine')) throw new Error('css still references route-15 class');
  if (css.includes('hinode17Line-stop-image')) throw new Error('css collides with route-17 class');
  fs.writeFileSync(path.join(ROOT, 'akemi-takasu-line-stop-images-v1.css'), css.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote akemi-takasu-line-stop-images-v1.js / .css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
