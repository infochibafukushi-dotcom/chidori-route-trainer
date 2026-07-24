'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const orders = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'official-stop-orders.json'), 'utf8'),
);
let src = fs.readFileSync(path.join(ROOT, 'shiyakusho-route-v1.js'), 'utf8');

const nameKeys = {
  '9-maihama': orders.systems['9-maihama'].stopNames,
  '9-rosetown': orders.systems['9-rosetown'].stopNames,
  '9-urayasu': orders.systems['9-urayasu'].stopNames,
  '9-tokai': orders.systems['9-tokai'].stopNames,
  '9-maihama-tokai': orders.systems['9-maihama-tokai'].stopNames,
  '9-urayasu-rosetown': orders.systems['9-urayasu-rosetown'].stopNames,
};

const namesBlock = Object.entries(nameKeys)
  .map(([key, arr]) => {
    const constName = `NAMES_${key.toUpperCase().replace(/-/g, '_')}`;
    return `  const ${constName} = ${JSON.stringify(arr, null, 2).replace(/^/gm, '  ')};`;
  })
  .join('\n\n');

const defs = `  const SYSTEM_DEFINITIONS = {
    '9-maihama': {
      key: '9-maihama', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '舞浜駅行き',
      summary: '浦安駅入口 → 堀江六丁目 → 京成ローズタウン → 舞浜駅',
      relationId: 18320323,
      names: NAMES_9_MAIHAMA,
    },
    '9-rosetown': {
      key: '9-rosetown', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '京成ローズタウン行き',
      summary: '浦安駅入口 → 堀江六丁目 → 京成ローズタウン',
      relationId: 18320323,
      names: NAMES_9_ROSETOWN,
      shortTurn: true,
      serviceTypes: ['regular', 'late-night'],
    },
    '9-urayasu': {
      key: '9-urayasu', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き',
      summary: '舞浜駅 → 京成ローズタウン → 堀江六丁目 → 浦安駅入口',
      relationId: 3498220,
      names: NAMES_9_URAYASU,
    },
    '9-tokai': {
      key: '9-tokai', displayCode: DISPLAY_CODE, directionGroup: 'inbound-school',
      title: '東海大浦安高校入口行き',
      summary: '舞浜駅 → 京成ローズタウン → 堀江六丁目 → 東海大浦安高校入口',
      relationId: 18419884,
      names: NAMES_9_TOKAI,
      shortTurn: true,
      serviceTypes: ['regular', 'late-night'],
    },
    '9-maihama-tokai': {
      key: '9-maihama-tokai', displayCode: DISPLAY_CODE, directionGroup: 'outbound-school',
      title: '舞浜駅行き（高校入口発）',
      summary: '東海大浦安高校入口 → 堀江六丁目 → 京成ローズタウン → 舞浜駅',
      relationId: 18419885,
      names: NAMES_9_MAIHAMA_TOKAI,
    },
    '9-urayasu-rosetown': {
      key: '9-urayasu-rosetown', displayCode: DISPLAY_CODE, directionGroup: 'inbound-short',
      title: '浦安駅入口行き（ローズタウン発）',
      summary: '京成ローズタウン → 堀江六丁目 → 浦安駅入口',
      relationId: 3498220,
      names: NAMES_9_URAYASU_ROSETOWN,
      shortTurn: true,
    },
  };`;

const header = `// 舞浜線（系統番号9・route-9）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ通過時刻表で確認（evidence/route9-maihama-implementation-2026-07-25/official-stop-orders.json）。
// 停留所座標：OSM platform採用（往復で別platform）。
// 道路形状：OSM relation way鎖。Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-9';
  const VERSION = '2026-07-25-maihama-line-v1';
  const SYSTEM_RESOLVED_VERSIONS = {
    '9-maihama': '2026-07-25-maihama-line-maihama-v1',
    '9-rosetown': '2026-07-25-maihama-line-rosetown-v1',
    '9-urayasu': '2026-07-25-maihama-line-urayasu-v1',
    '9-tokai': '2026-07-25-maihama-line-tokai-v1',
    '9-maihama-tokai': '2026-07-25-maihama-line-maihama-tokai-v1',
    '9-urayasu-rosetown': '2026-07-25-maihama-line-urayasu-rosetown-v1',
  };
  const SYSTEM_KEY = 'chidori-maihama-line-system-v1';
  const DISPLAY_CODE = '9';
`;

src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);
src = src.replace(
  /const NAMES_MAIHAMA = [\s\S]*?const SYSTEM_DEFINITIONS = {[\s\S]*?};\n\n  const DEFAULT_SYSTEM_KEY = '6-maihama';/m,
  `${namesBlock}\n\n${defs}\n\n  const DEFAULT_SYSTEM_KEY = '9-maihama';`,
);

const replacements = [
  [/SHIYAKUSHO/g, 'MAIHAMA_LINE'],
  [/shiyakusho/g, 'maihamaLine'],
  [/市役所線/g, '舞浜線'],
  [/route-6/g, 'route-9'],
  [/route6StopEditor/g, 'route9StopEditor'],
  [/stopEditorShiyakushoV1/g, 'stopEditorMaihamaLineV1'],
  [/2026-07-24-shiyakusho-v1/g, '2026-07-25-maihama-line-v1'],
  [/2026-07-24-shiyakusho-/g, '2026-07-25-maihama-line-'],
  [/\.shiyakusho-stop-image/g, '.maihama-line-stop-image'],
  [
    /route\.description = '[^']+'/,
    "route.description = '舞浜線：6運行パターン（公式系統番号はいずれも9）'",
  ],
  [
    /route\.sourcePolicy = '[^']+'/,
    "route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認。座標・道路はOSM relation採用（系統キー単位・要走行確認）。'",
  ],
  [
    /const order = \['6-maihama', '6-chidori', '6-urayasu-maihama', '6-tokai', '6-urayasu-chidori'\];/,
    "const order = ['9-maihama', '9-rosetown', '9-urayasu', '9-tokai', '9-maihama-tokai', '9-urayasu-rosetown'];",
  ],
  [
    /if \(definition\.directionGroup === 'inbound'\)/,
    "if (definition.directionGroup === 'inbound' || definition.directionGroup === 'inbound-school' || definition.directionGroup === 'inbound-short')",
  ],
  [
    /function migrateStopId\(definition, stop, index\) {[\s\S]*?return false;\n  }/m,
    `function migrateStopId(definition, stop, index) {
    const newId = \`maihama-line-\${definition.key}-\${String(index + 1).padStart(2, '0')}\`;
    if (stop.id === newId) return false;
    if (!stop.id || /^maihama-line-9-[\\w-]+-\\d{2}$/.test(stop.id)) {
      stop.id = newId;
      return true;
    }
    return false;
  }`,
  ],
  [
    /id: \`shiyakusho-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}\`/g,
    "id: `maihama-line-${definition.key}-${String(index + 1).padStart(2, '0')}`",
  ],
  [/\^shiyakusho-6-\\d\{2\}\$/g, '^maihama-line-9-[\\\\w-]+-\\\\d{2}$'],
];

for (const [pattern, replacement] of replacements) {
  src = src.replace(pattern, replacement);
}

fs.writeFileSync(path.join(ROOT, 'maihama-line-route-v1.js'), src);
console.log('wrote maihama-line-route-v1.js', src.length, 'bytes');
