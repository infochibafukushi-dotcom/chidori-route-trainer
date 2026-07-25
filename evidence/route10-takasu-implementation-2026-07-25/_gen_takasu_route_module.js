'use strict';
/**
 * Generate takasu-line-route-v1.js by cloning maihama-line-route-v1.js with route-10 renames.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const orders = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'official-stop-orders.json'), 'utf8'),
);
let src = fs.readFileSync(path.join(ROOT, 'maihama-line-route-v1.js'), 'utf8');
// Normalize line endings for reliable regex
src = src.replace(/\r\n/g, '\n');

const namesOut = orders.systems['10-minato-minami'].stopNames;
const namesIn = orders.systems['10-shinurayasu'].stopNames;

const header = `// 高洲線（系統番号10・route-10）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ通過時刻表で確認（evidence/route10-takasu-implementation-2026-07-25/official-stop-orders.json）。
// 記号「み」=10系統みなと南行き。F乗り場の無印は19系統（対象外）。
// 停留所座標：OSM platform採用（往復で別platform）。OSM「みなと南（鉄鋼団地）」→公式「みなと南」。
// 道路形状：OSM relation 18381757 / 18381756。Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-10';
  const VERSION = '2026-07-25-takasu-line-v1';
  const SYSTEM_RESOLVED_VERSIONS = {
    '10-minato-minami': '2026-07-25-takasu-line-minato-minami-v1',
    '10-shinurayasu': '2026-07-25-takasu-line-shinurayasu-v1',
  };
  const SYSTEM_KEY = 'chidori-takasu-line-system-v1';
  const DISPLAY_CODE = '10';
`;

src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);

const namesAndDefs = `  const NAMES_10_MINATO_MINAMI = ${JSON.stringify(namesOut, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n')};

  const NAMES_10_SHINURAYASU = ${JSON.stringify(namesIn, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n')};

  const SYSTEM_DEFINITIONS = {
    '10-minato-minami': {
      key: '10-minato-minami', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: 'みなと南（鉄鋼団地）行き',
      summary: '新浦安駅 → 東京学館前 → 高洲四丁目 → みなと南',
      relationId: 18381757,
      names: NAMES_10_MINATO_MINAMI,
    },
    '10-shinurayasu': {
      key: '10-shinurayasu', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '新浦安駅行き',
      summary: 'みなと南 → 高洲四丁目 → 東京学館前 → 新浦安駅',
      relationId: 18381756,
      names: NAMES_10_SHINURAYASU,
    },
  };

  const DEFAULT_SYSTEM_KEY = '10-minato-minami';`;

const namesRe = /const NAMES_9_MAIHAMA = [\s\S]*?const DEFAULT_SYSTEM_KEY = '9-maihama';/;
if (!namesRe.test(src)) {
  console.error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  process.exit(1);
}
src = src.replace(namesRe, namesAndDefs.trimStart());

const replacements = [
  [/MAIHAMA_LINE/g, 'TAKASU_LINE'],
  [/maihamaLine/g, 'takasuLine'],
  [/maihama-line/g, 'takasu-line'],
  [/舞浜線/g, '高洲線'],
  [/route-9/g, 'route-10'],
  [/route9StopEditor/g, 'route10StopEditor'],
  [/stopEditorMaihamaLineV1/g, 'stopEditorTakasuLineV1'],
  [/2026-07-25-maihama-line-v1/g, '2026-07-25-takasu-line-v1'],
  [/2026-07-25-maihama-line-/g, '2026-07-25-takasu-line-'],
  [/\.maihama-line-stop-image/g, '.takasu-line-stop-image'],
  [
    /route\.description = '[^']+'/,
    "route.description = '高洲線：2運行パターン（公式系統番号はいずれも10。記号み。F乗り場無印の19系統は対象外）'",
  ],
  [
    /route\.sourcePolicy = '[^']+'/,
    "route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認（み=10）。座標・道路はOSM relation 18381757/18381756採用（要走行確認）。'",
  ],
  [
    /const order = \['9-maihama', '9-rosetown', '9-urayasu', '9-tokai', '9-maihama-tokai', '9-urayasu-rosetown'\];/,
    "const order = ['10-minato-minami', '10-shinurayasu'];",
  ],
  [
    /function migrateStopId\(definition, stop, index\) \{[\s\S]*?return false;\n  \}/m,
    `function migrateStopId(definition, stop, index) {
    const newId = \`takasu-line-\${definition.key}-\${String(index + 1).padStart(2, '0')}\`;
    if (stop.id === newId) return false;
    if (!stop.id || /^takasu-line-10-[\\w-]+-\\d{2}$/.test(stop.id)) {
      stop.id = newId;
      return true;
    }
    return false;
  }`,
  ],
  [
    /id: `maihama-line-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}`/g,
    'id: `takasu-line-${definition.key}-${String(index + 1).padStart(2, \'0\')}`',
  ],
  [
    /id: `takasu-line-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}`/g,
    'id: `takasu-line-${definition.key}-${String(index + 1).padStart(2, \'0\')}`',
  ],
];

for (const [pattern, replacement] of replacements) {
  src = src.replace(pattern, replacement);
}

const leftover = [];
if (/NAMES_9_/.test(src)) leftover.push('NAMES_9_');
if (/'9-maihama'/.test(src)) leftover.push('9-maihama');
if (/MAIHAMA_LINE/.test(src)) leftover.push('MAIHAMA_LINE');
if (/maihamaLine/.test(src)) leftover.push('maihamaLine');
if (/route-9/.test(src)) leftover.push('route-9');
if (/18381771|18381770/.test(src)) leftover.push('route19-rel');
if (leftover.length) {
  console.error('LEFTOVER', leftover.join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'takasu-line-route-v1.js'), src.replace(/\n/g, '\r\n'));
console.log('wrote takasu-line-route-v1.js', src.length, 'bytes');

const required = [
  "ROUTE_ID = 'route-10'",
  "DISPLAY_CODE = '10'",
  "VERSION = '2026-07-25-takasu-line-v1'",
  "SYSTEM_KEY = 'chidori-takasu-line-system-v1'",
  '10-minato-minami',
  '10-shinurayasu',
  'takasuLineVersion',
  'takasuLineStopImages',
  '高洲線の走行データを確認できません',
  'window.TAKASU_LINE_ROUTE_V1',
  'route10StopEditor',
  'NAMES_10_MINATO_MINAMI',
  "DEFAULT_SYSTEM_KEY = '10-minato-minami'",
];
let ok = true;
for (const t of required) {
  if (!src.includes(t)) {
    console.error('MISSING', t);
    ok = false;
  } else console.log('OK', t);
}
if (!ok) process.exit(1);
