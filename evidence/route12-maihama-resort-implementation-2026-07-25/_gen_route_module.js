const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const orders = JSON.parse(fs.readFileSync(path.join(__dirname, 'official-stop-orders.json'), 'utf8'));
let src = fs.readFileSync(path.join(ROOT, 'takasu-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

const namesOut = orders.systems['12-maihama-via-resort'].stopNames;
const namesIn = orders.systems['12-urayasu-via-resort'].stopNames;

const header = `// 舞浜リゾート線（系統番号12・route-12）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ通過時刻表で確認（evidence/route12-maihama-resort-implementation-2026-07-25/official-stop-orders.json）。
// 記号「ホ」=12系統。route-4（無印/ランド/ち）は対象外。TDL非停車。
// 停留所座標：OSM platform採用（往復で別platform）。ホテルSOUTH/NORTHは往路path順で割当。
// 道路形状：OSM relation 18381677 / 18381676。Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-12';
  const VERSION = '2026-07-25-maihama-resort-line-v1';
  const SYSTEM_RESOLVED_VERSIONS = {
    '12-maihama-via-resort': '2026-07-25-maihama-resort-maihama-v1',
    '12-urayasu-via-resort': '2026-07-25-maihama-resort-urayasu-v1',
  };
  const SYSTEM_KEY = 'chidori-maihama-resort-line-system-v1';
  const DISPLAY_CODE = '12';
`;

src = src.replace(/^\/\/[\s\S]*?const SPEED_KMH = 20;/m, `${header}  const SPEED_KMH = 20;`);

const namesAndDefs = `  const NAMES_12_MAIHAMA_VIA_RESORT = ${JSON.stringify(namesOut, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n')};

  const NAMES_12_URAYASU_VIA_RESORT = ${JSON.stringify(namesIn, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n')};

  const SYSTEM_DEFINITIONS = {
    '12-maihama-via-resort': {
      key: '12-maihama-via-resort', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '舞浜駅行き（TDS・ホテル経由）',
      summary: '浦安駅入口 → 市役所入口・郵便局前 → 運動公園 → 東京ディズニーシー → リゾートホテル → 舞浜駅',
      relationId: 18381677,
      names: NAMES_12_MAIHAMA_VIA_RESORT,
    },
    '12-urayasu-via-resort': {
      key: '12-urayasu-via-resort', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（ホテル・TDS経由）',
      summary: '舞浜駅 → リゾートホテル → 東京ディズニーシー → 運動公園 → 市役所入口・郵便局前 → 浦安駅入口',
      relationId: 18381676,
      names: NAMES_12_URAYASU_VIA_RESORT,
    },
  };

  const DEFAULT_SYSTEM_KEY = '12-maihama-via-resort';`;

const namesRe = /const NAMES_10_MINATO_MINAMI = [\s\S]*?const DEFAULT_SYSTEM_KEY = '10-minato-minami';/;
if (!namesRe.test(src)) {
  console.error('FAILED to locate NAMES/SYSTEM_DEFINITIONS block');
  process.exit(1);
}
src = src.replace(namesRe, namesAndDefs.trimStart());

const replacements = [
  [/TAKASU_LINE/g, 'MAIHAMA_RESORT_LINE'],
  [/takasuLine/g, 'maihamaResortLine'],
  [/takasu-line/g, 'maihama-resort'],
  [/高洲線/g, '舞浜リゾート線'],
  [/route-10/g, 'route-12'],
  [/route10StopEditor/g, 'route12StopEditor'],
  [/stopEditorTakasuLineV1/g, 'stopEditorMaihamaResortLineV1'],
  [/2026-07-25-takasu-line-v1/g, '2026-07-25-maihama-resort-line-v1'],
  [/2026-07-25-takasu-line-/g, '2026-07-25-maihama-resort-'],
  [/\.takasu-line-stop-image/g, '.maihamaResortLine-stop-image'],
  [
    /route\.description = '[^']+'/,
    "route.description = '舞浜リゾート線：2運行パターン（公式系統番号はいずれも12。記号ホ。route-4は対象外）'",
  ],
  [
    /route\.sourcePolicy = '[^']+'/,
    "route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認（ホ=12）。座標・道路はOSM relation 18381677/18381676採用（要走行確認）。'",
  ],
  [
    /const order = \['10-minato-minami', '10-shinurayasu'\];/,
    "const order = ['12-maihama-via-resort', '12-urayasu-via-resort'];",
  ],
  [
    /function migrateStopId\(definition, stop, index\) \{[\s\S]*?return false;\n  \}/m,
    `function migrateStopId(definition, stop, index) {
    const newId = \`maihama-resort-\${definition.key}-\${String(index + 1).padStart(2, '0')}\`;
    if (stop.id === newId) return false;
    if (!stop.id || /^maihama-resort-12-[\\w-]+-\\d{2}$/.test(stop.id)) {
      stop.id = newId;
      return true;
    }
    return false;
  }`,
  ],
];

for (const [pattern, replacement] of replacements) {
  src = src.replace(pattern, replacement);
}

// Fix stop id template if still takasu-line after replacement confusion
src = src.replace(/id: `maihama-resort-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}`/g,
  'id: `maihama-resort-${definition.key}-${String(index + 1).padStart(2, \'0\')}`');

const leftover = [];
if (/NAMES_10_/.test(src)) leftover.push('NAMES_10_');
if (/'10-minato-minami'/.test(src)) leftover.push('10-minato');
if (/TAKASU_LINE/.test(src)) leftover.push('TAKASU_LINE');
if (/takasuLine/.test(src)) leftover.push('takasuLine');
if (/route-10/.test(src)) leftover.push('route-10');
if (leftover.length) {
  console.error('LEFTOVER', leftover.join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'maihama-resort-line-route-v1.js'), src.replace(/\n/g, '\r\n'));
console.log('wrote maihama-resort-line-route-v1.js', src.length);

const required = [
  "ROUTE_ID = 'route-12'",
  "DISPLAY_CODE = '12'",
  "SYSTEM_KEY = 'chidori-maihama-resort-line-system-v1'",
  '12-maihama-via-resort',
  '12-urayasu-via-resort',
  'maihamaResortLineVersion',
  'maihamaResortLineStopImages',
  'window.MAIHAMA_RESORT_LINE_ROUTE_V1',
  'maihama-resort-',
];
let ok = true;
for (const t of required) {
  if (!src.includes(t)) { console.error('MISSING', t); ok = false; }
  else console.log('OK', t);
}
if (!ok) process.exit(1);
