'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'official-stop-orders.json'), 'utf8'),
);

let s = fs.readFileSync(path.join(ROOT, 'symbol-road-line-route-v1.js'), 'utf8');

const reps = [
  ['高洲線（系統番号10・route-10）', 'シンボルロード線（系統番号11・route-11）'],
  [
    'evidence/route10-takasu-implementation-2026-07-25/official-stop-orders.json',
    'evidence/route11-symbol-road-implementation-2026-07-25/official-stop-orders.json',
  ],
  [
    '記号「み」=10系統みなと南行き。F乗り場の無印は19系統（対象外）。',
    '記号なし。望海/明海五丁目経由は系統3。relation 18419852禁止。',
  ],
  ['OSM「みなと南（鉄鋼団地）」→公式「みなと南」。', 'OSM「日の出南（墓地公園）」→公式「日の出南」。'],
  [
    '道路形状：OSM relation 18381757 / 18381756。Google Directionsは使用しない。',
    '道路形状：OSM relation 18352884 / 18352883。Google Directionsは使用しない。',
  ],
  ["const ROUTE_ID = 'route-10';", "const ROUTE_ID = 'route-11';"],
  ["const VERSION = '2026-07-25-takasu-line-v1';", "const VERSION = '2026-07-25-symbol-road-line-v1';"],
  [
    "const SYSTEM_KEY = 'chidori-takasu-line-system-v1';",
    "const SYSTEM_KEY = 'chidori-symbol-road-line-system-v1';",
  ],
  ["const DISPLAY_CODE = '10';", "const DISPLAY_CODE = '11';"],
  ['TAKASU_LINE_PLATFORMS_V1', 'SYMBOL_ROAD_LINE_PLATFORMS_V1'],
  ['TAKASU_LINE_PATH_V1', 'SYMBOL_ROAD_LINE_PATH_V1'],
  ['TAKASU_LINE_PATH_POLICY_V1', 'SYMBOL_ROAD_LINE_PATH_POLICY_V1'],
  ['TAKASU_LINE_STOP_IMAGES_V1', 'SYMBOL_ROAD_LINE_STOP_IMAGES_V1'],
  ['TAKASU_LINE_ROUTE_V1', 'SYMBOL_ROAD_LINE_ROUTE_V1'],
  ['takasuLineVersion', 'symbolRoadLineVersion'],
  ['takasuLineStopImages', 'symbolRoadLineStopImages'],
  ['takasuLineStopImageUpdatedAt', 'symbolRoadLineStopImageUpdatedAt'],
  ['takasu-line-', 'symbol-road-'],
  ['takasuLine-stop-image', 'symbolRoadLine-stop-image'],
  ['takasu-line-stop-image', 'symbol-road-line-stop-image'],
  ['[takasuLine]', '[symbolRoadLine]'],
  ['高洲線の走行データを確認できません。', 'シンボルロード線の走行データを確認できません。'],
  ['高洲線｜', 'シンボルロード線｜'],
  ['高洲線 停留所設定', 'シンボルロード線 停留所設定'],
  ['高洲線・系統', 'シンボルロード線・系統'],
  [
    "route.description = '高洲線：2運行パターン（公式系統番号はいずれも10。記号み。F乗り場無印の19系統は対象外）';",
    "route.description = 'シンボルロード線：11運行パターン（公式系統番号はいずれも11。望海/明海五丁目経由は系統3）';",
  ],
  [
    "route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認（み=10）。座標・道路はOSM relation 18381757/18381756採用（要走行確認）。';",
    "route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認。座標・道路はOSM relation 18352884/18352883採用（要走行確認）。relation 18419852禁止。';",
  ],
];

for (const [a, b] of reps) {
  if (!s.includes(a)) console.warn('MISSING:', a.slice(0, 80));
  s = s.split(a).join(b);
}

// Build SYSTEM_DEFINITIONS block
const defs = {
  '11-urayasu-hinode': {
    directionGroup: 'outbound',
    title: '日の出南行き（浦安駅入口発）',
    summary: '浦安駅入口 → 新浦安駅 → 日の出公民館 → 日の出南',
    relationId: 18352884,
  },
  '11-urayasu-sogo-via-hinode-kominkan': {
    directionGroup: 'outbound',
    title: '総合公園行き（浦安駅入口発）・日の出公民館経由',
    summary: '浦安駅入口 → 新浦安駅 → 日の出公民館 → 総合公園',
    relationId: 18352884,
  },
  '11-urayasu-baypark': {
    directionGroup: 'outbound',
    title: 'ベイパーク行き（浦安駅入口発）',
    summary: '浦安駅入口 → 新浦安駅 → 日の出公民館 → ベイパーク',
    relationId: 18352884,
  },
  '11-urayasu-shinurayasu': {
    directionGroup: 'outbound',
    title: '新浦安駅行き（浦安駅入口発）',
    summary: '浦安駅入口 → 美浜東団地 → 新浦安駅',
    relationId: 18352884,
  },
  '11-shinurayasu-hinode': {
    directionGroup: 'outbound',
    title: '日の出南行き（新浦安駅発）',
    summary: '新浦安駅 → 日の出公民館 → 総合公園 → 日の出南',
    relationId: 18352884,
  },
  '11-shinurayasu-sogo': {
    directionGroup: 'outbound',
    title: '総合公園行き（新浦安駅発）',
    summary: '新浦安駅 → 日の出公民館 → ベイパーク → 総合公園',
    relationId: 18352884,
  },
  '11-shinurayasu-baypark': {
    directionGroup: 'outbound',
    title: 'ベイパーク行き（新浦安駅発）',
    summary: '新浦安駅 → 日の出公民館 → ベイモール → ベイパーク',
    relationId: 18352884,
  },
  '11-hinode-urayasu': {
    directionGroup: 'inbound',
    title: '浦安駅入口行き（日の出南発）',
    summary: '日の出南 → 日の出公民館 → 新浦安駅 → 浦安駅入口',
    relationId: 18352883,
  },
  '11-hinode-shinurayasu': {
    directionGroup: 'inbound',
    title: '新浦安駅行き（日の出南発）',
    summary: '日の出南 → 総合公園 → 日の出公民館 → 新浦安駅',
    relationId: 18352883,
  },
  '11-sogo-shinurayasu': {
    directionGroup: 'inbound',
    title: '新浦安駅行き（総合公園発）',
    summary: '総合公園 → ベイパーク → 日の出公民館 → 新浦安駅',
    relationId: 18352883,
  },
  '11-sogo-urayasu': {
    directionGroup: 'inbound',
    title: '浦安駅入口行き（総合公園発）',
    summary: '総合公園 → 日の出公民館 → 新浦安駅 → 浦安駅入口',
    relationId: 18352883,
  },
};

const order = [
  '11-urayasu-hinode',
  '11-urayasu-sogo-via-hinode-kominkan',
  '11-urayasu-baypark',
  '11-urayasu-shinurayasu',
  '11-shinurayasu-hinode',
  '11-shinurayasu-sogo',
  '11-shinurayasu-baypark',
  '11-hinode-urayasu',
  '11-hinode-shinurayasu',
  '11-sogo-shinurayasu',
  '11-sogo-urayasu',
];

const nameConsts = [];
const resolved = [];
const systemDefs = [];

for (const key of order) {
  const short = key.replace(/^11-/, '').replace(/-/g, '_').toUpperCase();
  const constName = `NAMES_${short}`;
  const names = ORDERS.systems[key].stopNames;
  nameConsts.push(
    `  const ${constName} = ${JSON.stringify(names, null, 4).replace(/\n/g, '\n  ')};`,
  );
  const verKey = key.replace(/^11-/, '');
  resolved.push(`    '${key}': '2026-07-25-symbol-road-${verKey}-v1',`);
  const d = defs[key];
  systemDefs.push(
    [
      `    '${key}': {`,
      `      key: '${key}', displayCode: DISPLAY_CODE, directionGroup: '${d.directionGroup}',`,
      `      title: ${JSON.stringify(d.title)},`,
      `      summary: ${JSON.stringify(d.summary)},`,
      `      relationId: ${d.relationId},`,
      `      names: ${constName},`,
      `    },`,
    ].join('\n'),
  );
}

const newResolved = `  const SYSTEM_RESOLVED_VERSIONS = {\n${resolved.join('\n')}\n  };`;
const newNamesAndDefs =
  `${nameConsts.join('\n\n')}\n\n  const SYSTEM_DEFINITIONS = {\n${systemDefs.join('\n')}\n  };`;

// Replace SYSTEM_RESOLVED_VERSIONS block
s = s.replace(
  /  const SYSTEM_RESOLVED_VERSIONS = \{[\s\S]*?\n  \};/,
  newResolved,
);

// Replace NAMES_* and SYSTEM_DEFINITIONS through DEFAULT_SYSTEM_KEY
s = s.replace(
  /  const NAMES_[\s\S]*?const DEFAULT_SYSTEM_KEY = '[^']+';/,
  `${newNamesAndDefs}\n\n  const DEFAULT_SYSTEM_KEY = '11-urayasu-hinode';`,
);

// Fix migrateStopId regex for symbol-road keys
s = s.replace(
  /\/\^symbol-road-10-\[\\w-\]\+-\\d\{2\}\$\//,
  '/^symbol-road-11-[\\w-]+-\\d{2}$/',
);

fs.writeFileSync(path.join(ROOT, 'symbol-road-line-route-v1.js'), s);
console.log('updated symbol-road-line-route-v1.js', s.length);

// Policy
let policy = fs.readFileSync(path.join(ROOT, 'symbol-road-line-path-policy-v1.js'), 'utf8');
const pathBank = JSON.parse(fs.readFileSync(path.join(__dirname, '_path_bank.json'), 'utf8'));
const minPts = {};
for (const [k, v] of Object.entries(pathBank)) {
  minPts[k] = Math.max(50, Math.floor((v.pathPoints || []).length * 0.7));
}
policy = policy
  .replace('高洲線（route-10）', 'シンボルロード線（route-11）')
  .replace('（み=10）。', '。')
  .replace('18381757/18381756', '18352884/18352883')
  .replace("'2026-07-25-takasu-line-path-v1'", "'2026-07-25-symbol-road-line-path-v1'")
  .replace(/  const MIN_PATH_POINTS_BY_SYSTEM = \{[\s\S]*?\n  \};/, `  const MIN_PATH_POINTS_BY_SYSTEM = ${JSON.stringify(minPts, null, 4).replace(/\n/g, '\n  ')};`)
  .replace('TAKASU_LINE_PATH_POLICY_V1', 'SYMBOL_ROAD_LINE_PATH_POLICY_V1')
  .replace('高洲線の走行データを確認できません。', 'シンボルロード線の走行データを確認できません。');
fs.writeFileSync(path.join(ROOT, 'symbol-road-line-path-policy-v1.js'), policy);
console.log('updated policy', minPts);

// Stop images
let imgs = fs.readFileSync(path.join(ROOT, 'symbol-road-line-stop-images-v1.js'), 'utf8');
imgs = imgs
  .replace('高洲線（route-10）', 'シンボルロード線（route-11）')
  .replace('10-minato-minami|みなと南', '11-urayasu-hinode|日の出南')
  .replace('route.takasuLineStopImages', 'route.symbolRoadLineStopImages')
  .replace('TAKASU_LINE_STOP_IMAGES_V1', 'SYMBOL_ROAD_LINE_STOP_IMAGES_V1')
  .replace('2026-07-25-takasu-line-stop-images-v1', '2026-07-25-symbol-road-line-stop-images-v1');
fs.writeFileSync(path.join(ROOT, 'symbol-road-line-stop-images-v1.js'), imgs);

let css = fs.readFileSync(path.join(ROOT, 'symbol-road-line-stop-images-v1.css'), 'utf8');
css = css
  .replace(/高洲線（route-10）/g, 'シンボルロード線（route-11）')
  .replace(/\.takasu-line-stop-image/g, '.symbol-road-line-stop-image')
  .replace(/takasu-line-stop-image/g, 'symbol-road-line-stop-image');
fs.writeFileSync(path.join(ROOT, 'symbol-road-line-stop-images-v1.css'), css);
console.log('done transform');
