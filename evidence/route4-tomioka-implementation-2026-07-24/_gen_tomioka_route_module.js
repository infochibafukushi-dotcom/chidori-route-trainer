'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const orders = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'official-stop-orders.json'), 'utf8')
);
const src = fs.readFileSync(path.join(ROOT, 'urayasu-higashi-danchi-route-v1.js'), 'utf8');

const names = {
  '4-maihama': orders.systems['4-maihama'].stops,
  '4-tdl': orders.systems['4-tdl'].stops,
  '4-chidori': orders.systems['4-chidori'].stops,
  '4-urayasu-maihama': orders.systems['4-urayasu-maihama'].stops,
  '4-urayasu-tdl': orders.systems['4-urayasu-tdl'].stops,
  '4-urayasu-chidori': orders.systems['4-urayasu-chidori'].stops,
};

const header = `// 富岡線（系統番号4・route-4）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ通過時刻表で確認（evidence/route4-tomioka-implementation-2026-07-24/official-stop-orders.json）。
// 停留所座標：OSM platform採用（往復で別platform）。
// 道路形状：OSM relation way鎖（9983006 / 18323875 / 18417665 / 18417664）。Google Directionsは使用しない。
// UI構造・走行シミュレーションは urayasu-higashi-danchi-route-v1.js パターンを移植。
(() => {
  const ROUTE_ID = 'route-4';
  const VERSION = '2026-07-24-tomioka-v1';
  const SYSTEM_RESOLVED_VERSIONS = {
    '4-maihama': '2026-07-24-tomioka-maihama-v1',
    '4-tdl': '2026-07-24-tomioka-tdl-v1',
    '4-chidori': '2026-07-24-tomioka-chidori-v1',
    '4-urayasu-maihama': '2026-07-24-tomioka-urayasu-maihama-v1',
    '4-urayasu-tdl': '2026-07-24-tomioka-urayasu-tdl-v1',
    '4-urayasu-chidori': '2026-07-24-tomioka-urayasu-chidori-v1',
  };
  const SYSTEM_KEY = 'chidori-tomioka-system-v1';
  const DISPLAY_CODE = '4';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const MAP_ZOOM = 18;
  const DRIVE_VISUAL_MS = 900;
  const HEADING_MIN_METERS = 5;
  const MAX_DATA_URL_CHARS = 70000;

  const NAMES_MAIHAMA = ${JSON.stringify(names['4-maihama'], null, 2)};
  const NAMES_TDL = ${JSON.stringify(names['4-tdl'], null, 2)};
  const NAMES_CHIDORI = ${JSON.stringify(names['4-chidori'], null, 2)};
  const NAMES_URAYASU_MAIHAMA = ${JSON.stringify(names['4-urayasu-maihama'], null, 2)};
  const NAMES_URAYASU_TDL = ${JSON.stringify(names['4-urayasu-tdl'], null, 2)};
  const NAMES_URAYASU_CHIDORI = ${JSON.stringify(names['4-urayasu-chidori'], null, 2)};

  const SYSTEM_DEFINITIONS = {
    '4-maihama': {
      key: '4-maihama', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '舞浜駅行き',
      summary: '浦安駅入口 → 市役所入口・郵便局前 → 舞浜駅',
      relationId: 9983006,
      names: NAMES_MAIHAMA,
    },
    '4-tdl': {
      key: '4-tdl', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '東京ディズニーランド行き',
      summary: '浦安駅入口 → 舞浜駅 → 東京ディズニーランド',
      relationId: 9983006,
      names: NAMES_TDL,
    },
    '4-chidori': {
      key: '4-chidori', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '千鳥車庫行き',
      summary: '浦安駅入口 → 順天堂病院前 → 千鳥車庫',
      relationId: 18417665,
      names: NAMES_CHIDORI,
    },
    '4-urayasu-maihama': {
      key: '4-urayasu-maihama', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（舞浜駅発）',
      summary: '舞浜駅 → 浦安駅入口',
      relationId: 18323875,
      names: NAMES_URAYASU_MAIHAMA,
    },
    '4-urayasu-tdl': {
      key: '4-urayasu-tdl', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（東京ディズニーランド発）',
      summary: '東京ディズニーランド → 舞浜駅 → 浦安駅入口',
      relationId: 18323875,
      names: NAMES_URAYASU_TDL,
    },
    '4-urayasu-chidori': {
      key: '4-urayasu-chidori', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（千鳥車庫発）',
      summary: '千鳥車庫 → 順天堂病院前 → 浦安駅入口',
      relationId: 18417664,
      names: NAMES_URAYASU_CHIDORI,
    },
  };

  const DEFAULT_SYSTEM_KEY = '4-tdl';
`;

const idx = src.indexOf('  const previousRoutes = routes;');
if (idx < 0) throw new Error('anchor not found');
let body = src.slice(idx);

const replacements = [
  [/URAYASU_HIGASHI_DANCHI_PLATFORMS_V1/g, 'TOMIOKA_PLATFORMS_V1'],
  [/URAYASU_HIGASHI_DANCHI_PATH_V1/g, 'TOMIOKA_PATH_V1'],
  [/URAYASU_HIGASHI_DANCHI_PATH_POLICY_V1/g, 'TOMIOKA_PATH_POLICY_V1'],
  [/URAYASU_HIGASHI_DANCHI_ROUTE_V1/g, 'TOMIOKA_ROUTE_V1'],
  [/URAYASU_HIGASHI_DANCHI_DRIVE_STATE/g, 'TOMIOKA_DRIVE_STATE'],
  [/urayasu-higashi-danchi-/g, 'tomioka-'],
  [/urayasuHigashiDanchiVersion/g, 'tomiokaVersion'],
  [/route3StopEditor/g, 'route4StopEditor'],
  [/stopEditorUrayasuHigashiDanchiV1/g, 'stopEditorTomiokaV1'],
  [/浦安東団地線/g, '富岡線'],
  [/\[urayasu-higashi-danchi\]/g, '[tomioka]'],
  [/urayasu-higashi-danchi-stop-image/g, 'tomioka-stop-image'],
];
for (const [re, to] of replacements) body = body.replace(re, to);

// Simplify platform/path accessors (remove akeumi slice logic left in body before previousRoutes)
// Body starts at previousRoutes — akeumi helpers are BEFORE that, so already excluded by header.

// Fix migrate regex if present
body = body.replace(/\^tomioka-3-\\d\{2\}\$/g, '^tomioka-4-\\d{2}$');
body = body.replace(/tomioka-3-(\\d{2})/g, 'tomioka-4-$1');

// inbound systems should clear outbound labeling like route-3 does for 3-urayasu
// Check if ensureRoute sets inbound — keep as-is from template.

const out = header + '\n' + body;
let fixed = out;
fixed = fixed.replace(
  /\/\*\* 3-akeumi[\s\S]*?function pathDataForSystem\(systemKey\) \{\n    const bank = window\.TOMIOKA_PATH_V1 \|\| \{\};\n    if \(systemKey === '3-akeumi'\) return sliceAkeumiPath\(bank\);\n    return bank\[systemKey\] \|\| null;\n  \}/,
  `function platformsForSystem(systemKey) {
    const bank = window.TOMIOKA_PLATFORMS_V1 || {};
    return bank[systemKey] || {};
  }

  function pathDataForSystem(systemKey) {
    const bank = window.TOMIOKA_PATH_V1 || {};
    return bank[systemKey] || null;
  }`
);
fixed = fixed.replace(
  "const order = ['3-sogo', '3-urayasu', '3-symbol', '3-akeumi'];",
  "const order = ['4-maihama','4-tdl','4-chidori','4-urayasu-maihama','4-urayasu-tdl','4-urayasu-chidori'];"
);
fixed = fixed.replace(/urayasuHigashiDanchiStopImages/g, 'tomiokaStopImages');
fixed = fixed.replace(/urayasuHigashiDanchiStopImageUpdatedAt/g, 'tomiokaStopImageUpdatedAt');
fixed = fixed.replace('公式系統番号はいずれも3', '公式系統番号はいずれも4');

fs.writeFileSync(path.join(ROOT, 'tomioka-route-v1.js'), fixed);
console.log('wrote', fixed.length);
const leftovers = {
  URAYASU: (fixed.match(/URAYASU_HIGASHI/g) || []).length,
  route3: (fixed.match(/route-3/g) || []).length,
  akeumi: (fixed.match(/3-akeumi|AKEUMI|sliceAkeumi/g) || []).length,
  stopImages: (fixed.match(/tomiokaStopImages/g) || []).length,
  urayasuImg: (fixed.match(/urayasuHigashi/g) || []).length,
  utf: fixed.includes('富岡線'),
  ROUTE_ID_ok: fixed.includes("ROUTE_ID = 'route-4'"),
};
console.log(leftovers);
