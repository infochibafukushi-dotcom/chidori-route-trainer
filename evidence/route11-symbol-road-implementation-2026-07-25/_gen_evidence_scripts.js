'use strict';
/**
 * Generate evidence QA scripts for route-11 from route-10 templates (adapted).
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const R10 = path.resolve(__dirname, '..', 'route10-takasu-implementation-2026-07-25');

const SYSTEMS = [
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

function adapt(src, extra = {}) {
  let s = src;
  const pairs = [
    ['route-10', 'route-11'],
    ['高洲線', 'シンボルロード線'],
    ['TAKASU_LINE_', 'SYMBOL_ROAD_LINE_'],
    ['takasu-line-', 'symbol-road-line-'],
    ['takasu-line', 'symbol-road-line'],
    ["'10-minato-minami'", "'11-urayasu-hinode'"],
    ["'10-shinurayasu'", "'11-urayasu-sogo-via-hinode-kominkan'"],
    ['chidori-route-map-v72', 'chidori-route-map-v73'],
    ["hokuei-no-uturn-v17.js?v=72", "hokuei-no-uturn-v17.js?v=73"],
    ['nocache=r10', 'nocache=r11'],
    ['messageHasTakasuBanner', 'messageHasSymbolRoadBanner'],
    ['高洲線の走行データを確認できません', 'シンボルロード線の走行データを確認できません'],
    ...Object.entries(extra),
  ];
  for (const [a, b] of pairs) s = s.split(a).join(b);
  return s;
}

// --- continuous drive ---
{
  let s = fs.readFileSync(path.join(R10, '_continuous_drive.js'), 'utf8');
  s = adapt(s);
  s = s.replace(
    /const SYSTEMS = \[[\s\S]*?\];/,
    `const SYSTEMS = ${JSON.stringify(SYSTEMS, null, 2)};`,
  );
  s = s.replace('PORT = 8820', 'PORT = 8830');
  s = s.replace(
    /window\.SYMBOL_ROAD_LINE_DRIVE_STATE/g,
    'window.SYMBOL_ROAD_LINE_DRIVE_STATE',
  );
  // drive state in continuous_drive was TAKASU_LINE_DRIVE_STATE → already adapted
  fs.writeFileSync(path.join(OUT, '_continuous_drive.js'), s);
}

// --- pathhash ---
{
  let s = fs.readFileSync(path.join(R10, '_pathhash_integrity_test.js'), 'utf8');
  s = adapt(s);
  s = s.replace(
    /const SYSTEMS = \[[\s\S]*?\];/,
    `const SYSTEMS = [\n  '11-urayasu-hinode',\n  '11-urayasu-sogo-via-hinode-kominkan',\n];`,
  );
  s = s.replace('PORT = 8819', 'PORT = 8829');
  fs.writeFileSync(path.join(OUT, '_pathhash_integrity_test.js'), s);
}

// --- regression ---
{
  let s = fs.readFileSync(path.join(R10, '_regression_report.js'), 'utf8');
  s = s
    .replace('routes 1–9', 'routes 1–10')
    .replace('after route-10 add', 'after route-11 add')
    .replace(
      "note: 'Compare path banks vs git HEAD. Route-10 is new (no HEAD baseline required).'",
      "note: 'Compare path banks vs git HEAD. Route-11 is new (no HEAD baseline required).'",
    );
  // Add takasu to banks list before the imagawa check, and change "new" section
  if (!s.includes('takasu-line-path-v1.js')) {
    s = s.replace(
      /const banks = \[/,
      `const banks = [\n  ['高洲線 route-10', 'takasu-line-path-v1.js', 'TAKASU_LINE_PATH_V1'],`,
    );
  }
  s = s.replace(
    /\/\/ Takasu new[\s\S]*?report\.pass = allOk && report\.routes\['高洲線 route-10 \(new\)'\]\.ok;/,
    `// Symbol road new
const symbol = loadWindow('symbol-road-line-path-v1.js', 'SYMBOL_ROAD_LINE_PATH_V1');
const symbolKeys = ${JSON.stringify(SYSTEMS)};
const symbolOk = symbolKeys.every((k) => Boolean(symbol?.[k]));
report.routes['シンボルロード線 route-11 (new)'] = {
  ok: symbolOk,
  systems: hashesOf(symbol),
  note: 'new — not compared to HEAD',
};

report.pass = allOk && report.routes['シンボルロード線 route-11 (new)'].ok;`,
  );
  fs.writeFileSync(path.join(OUT, '_regression_report.js'), s);
}

// --- pwa ---
{
  let s = fs.readFileSync(path.join(R10, '_pwa_offline_report.js'), 'utf8');
  s = adapt(s, {
    'PORT = 8823': 'PORT = 8833',
  });
  s = s.replace(
    /const takasuAssets = \[[\s\S]*?\];/,
    `const symbolAssets = [
    './symbol-road-line-stop-images-v1.css?v=73',
    './symbol-road-line-platforms-v1.js?v=73',
    './symbol-road-line-path-v1.js?v=73',
    './symbol-road-line-path-policy-v1.js?v=73',
    './symbol-road-line-stop-images-v1.js?v=73',
    './symbol-road-line-route-v1.js?v=73',
    './hokuei-no-uturn-v17.js?v=73',
  ];`,
  );
  s = s.replace(/takasuAssets/g, 'symbolAssets');
  s = s.replace(/\.\/takasu-/g, './symbol-road-');
  s = s.replace("u.includes('takasu-')", "u.includes('symbol-road-')");
  s = s.replace("expectCache: 'chidori-route-map-v73'", "expectCache: 'chidori-route-map-v73'");
  // Fix route checks inside evaluate if still referencing route-10 only
  s = s.replace(/route-10/g, 'route-11');
  s = s.replace(/r10/g, 'r11');
  fs.writeFileSync(path.join(OUT, '_pwa_offline_report.js'), s);
}

// --- render shots ---
{
  const shots = [
    ['11-urayasu-hinode-start-z19.png', '11-urayasu-hinode', '浦安駅入口', '神明裏'],
    ['11-urayasu-shinurayasu-entry-z19.png', '11-urayasu-hinode', '美浜東団地', '新浦安駅'],
    ['11-urayasu-hinode-kominkan-z19.png', '11-urayasu-hinode', '海風の街', '日の出公民館'],
    ['11-urayasu-symbol-pc-z19.png', '11-urayasu-hinode', '日の出公民館', 'シンボルロード・パークシティ'],
    ['11-urayasu-baypark-z19.png', '11-urayasu-hinode', 'ベイモール', 'ベイパーク'],
    ['11-urayasu-sogo-z19.png', '11-urayasu-hinode', 'ベイサイドホテルエリア', '総合公園'],
    ['11-urayasu-hinode-end-z19.png', '11-urayasu-hinode', '新浦安温泉', '日の出南'],
    ['11-shinurayasu-hinode-start-z19.png', '11-shinurayasu-hinode', '新浦安駅', '入船中央エステート'],
    ['11-shinurayasu-baypark-end-z19.png', '11-shinurayasu-baypark', 'ベイモール', 'ベイパーク'],
    ['11-shinurayasu-sogo-end-z19.png', '11-shinurayasu-sogo', 'ベイサイドホテルエリア', '総合公園'],
    ['11-hinode-urayasu-start-z19.png', '11-hinode-urayasu', '日の出南', '新浦安温泉'],
    ['11-hinode-sogo-z19.png', '11-hinode-urayasu', '新浦安温泉', '総合公園'],
    ['11-hinode-kominkan-z19.png', '11-hinode-urayasu', 'シンボルロード・パークシティ', '日の出公民館'],
    ['11-hinode-shinurayasu-z19.png', '11-hinode-shinurayasu', '入船中央エステート', '新浦安駅'],
    ['11-sogo-shinurayasu-start-z19.png', '11-sogo-shinurayasu', '総合公園', 'ベイサイドホテルエリア'],
    ['11-sogo-urayasu-end-z19.png', '11-sogo-urayasu', '神明裏', '浦安駅入口'],
    ['11-urayasu-shinurayasu-end-z19.png', '11-urayasu-shinurayasu', '美浜東団地', '新浦安駅'],
    ['11-urayasu-baypark-short-end-z19.png', '11-urayasu-baypark', 'ベイモール', 'ベイパーク'],
    ['11-urayasu-sogo-short-end-z19.png', '11-urayasu-sogo-via-hinode-kominkan', 'ベイサイドホテルエリア', '総合公園'],
  ];

  let s = fs.readFileSync(path.join(R10, '_render_shots.js'), 'utf8');
  s = adapt(s);
  s = s.replace('PORT = 8821', 'PORT = 8831');
  const shotLines = shots
    .map(
      ([file, key, a, b]) =>
        `  { file: '${file}', ...span('${key}', '${a}', '${b}') },`,
    )
    .join('\n');
  s = s.replace(/const SHOTS = \[[\s\S]*?\];/, `const SHOTS = [\n${shotLines}\n];`);
  // notes for skipped shots
  s = s.replace(
    /fs\.mkdirSync\(OUT, \{ recursive: true \}\);/,
    `fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_screenshot_notes.json'), JSON.stringify({
  skipped: [
    { id: '望海の街 night', note: '対象便なし（★シ/シ深夜は系統3）' },
    { id: 'akemi5 / 明海五丁目', note: '対象便なし（系統3、route-11非対象）' },
    { id: 'symbol-road-pc terminus as 11', note: '対象便なし（系統3誤分類を除外）' },
  ],
  lateNightSystems: 0,
}, null, 2));`,
  );
  fs.writeFileSync(path.join(OUT, '_render_shots.js'), s);
}

// --- geometry ---
{
  let s = fs.readFileSync(path.join(R10, '_geometry_intersection_report.js'), 'utf8');
  s = adapt(s);
  s = s.replace(
    /const SYSTEMS = \[[\s\S]*?\];/,
    `const SYSTEMS = ${JSON.stringify(SYSTEMS, null, 2)};`,
  );
  // Visual map — use screenshots that exist for each system
  const visual = {
    '11-urayasu-hinode': [
      '11-urayasu-hinode-start-z19.png',
      '11-urayasu-shinurayasu-entry-z19.png',
      '11-urayasu-hinode-kominkan-z19.png',
      '11-urayasu-symbol-pc-z19.png',
      '11-urayasu-baypark-z19.png',
      '11-urayasu-sogo-z19.png',
      '11-urayasu-hinode-end-z19.png',
    ],
    '11-urayasu-sogo-via-hinode-kominkan': ['11-urayasu-sogo-short-end-z19.png'],
    '11-urayasu-baypark': ['11-urayasu-baypark-short-end-z19.png'],
    '11-urayasu-shinurayasu': ['11-urayasu-shinurayasu-end-z19.png'],
    '11-shinurayasu-hinode': ['11-shinurayasu-hinode-start-z19.png'],
    '11-shinurayasu-sogo': ['11-shinurayasu-sogo-end-z19.png'],
    '11-shinurayasu-baypark': ['11-shinurayasu-baypark-end-z19.png'],
    '11-hinode-urayasu': [
      '11-hinode-urayasu-start-z19.png',
      '11-hinode-sogo-z19.png',
      '11-hinode-kominkan-z19.png',
    ],
    '11-hinode-shinurayasu': ['11-hinode-shinurayasu-z19.png'],
    '11-sogo-shinurayasu': ['11-sogo-shinurayasu-start-z19.png'],
    '11-sogo-urayasu': ['11-sogo-urayasu-end-z19.png'],
  };
  s = s.replace(
    /const VISUAL_Z19_BY_SYSTEM = \{[\s\S]*?\n\};/,
    `const VISUAL_Z19_BY_SYSTEM = ${JSON.stringify(visual, null, 2)};`,
  );
  fs.writeFileSync(path.join(OUT, '_geometry_intersection_report.js'), s);
}

console.log('wrote evidence scripts');
