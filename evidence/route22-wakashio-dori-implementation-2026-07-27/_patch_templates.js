'use strict';
/** One-shot patch of copied route-20/route-19 templates → route-22 Wakashio Dori. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

function patch(file, pairs) {
  const p = path.join(OUT, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [from, to] of pairs) {
    if (typeof from === 'string') {
      if (!s.includes(from)) console.warn(`WARN ${file}: missing "${from.slice(0, 60)}"`);
      s = s.split(from).join(to);
    } else {
      s = s.replace(from, to);
    }
  }
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched', file);
}

// --- scrape all ---
patch('_scrape_navi_route22_all.js', [
  ['route-20', 'route-22'],
  ['系統20 千鳥線', '系統22 若潮通り線（22千鳥東）'],
  ["const ROUTE_NUM = '20';", "const ROUTE_NUM = '22';"],
  ["const SIBLING_ROUTES = ['22', '9', '12', '25', '6', '14', '4', '2'];", "const SIBLING_ROUTES = ['20', '9', '12', '25', '6', '14', '4', '2'];"],
  ["lineName: '千鳥線',", "lineName: '若潮通り線',"],
  ["note: 'Route 20 discovery. Separate [20] / 急行 / 直通 / 循環 from [22].',", "note: 'Route 22 discovery (22千鳥東). Gate 【２２系統】. Separate from [20] 千鳥線.'"],
  ['return /\\[20\\]|【\\s*20\\s*系統\\s*】|^20\\s*\\[20\\]|^20千鳥|\\[20\\s/.test(s);',
    'return /\\[22\\]|【\\s*22\\s*系統\\s*】|^22\\s*\\[22\\]|^22千鳥|22千鳥東/.test(s);'],
  ['if (n === \'20\') return false;', 'if (n === \'22\') return false;'],
  ["  maihama: '00020617',", ''],
  ["  undokoen: '00020746',", ''],
  ["  '舞浜駅', '千鳥車庫', '千鳥北', '千鳥中央', '千鳥西', '千鳥東',\n  'クリーンセンター', '浦安斎場', '運動公園', 'オリエンタルランド本社前',\n  '新浦安駅', '順天堂病院前',",
    "  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前',\n  '千鳥車庫', '千鳥北', '千鳥東', '車庫裏', '運動公園', '舞浜三丁目',"],
  ['route20:', 'route22:'],
  ['route20Courses', 'route22Courses'],
  ['.route20?.', '.route22?.'],
  ['t.route20 || []', 't.route22 || []'],
  ['courses.route20', 'courses.route22'],
  ['for (const c of courses.route20)', 'for (const c of courses.route22)'],
  ['=== ROUTE 20 COURSES ===', '=== ROUTE 22 COURSES ==='],
  ['sibling22Cells', 'sibling20Cells'],
  ['if (/22千鳥東|\\[22\\]|【\\s*22\\s*系統/.test(toAsciiDigits(c.text || \'\'))) {',
    'if (/\\[20\\]|【\\s*20\\s*系統|20千鳥/.test(toAsciiDigits(c.text || \'\'))) {'],
  ["gatedRoute: '22',", "gatedRoute: '20',"],
  ['  { key: \'maihama\', label: \'舞浜駅\', id: idByKey.maihama },\n', ''],
  ['  { key: \'cleanCenter\', label: \'クリーンセンター\', id: idByKey.cleanCenter },\n', ''],
  ['  { key: \'undokoen\', label: \'運動公園\', id: idByKey.undokoen },\n', ''],
  ['maihama: KNOWN_IDS.maihama || pick(\'舞浜駅\', /舞浜駅/),', ''],
  ['cleanCenter: pick(\'クリーンセンター\', /クリーンセンター/),', ''],
  ['undokoen: KNOWN_IDS.undokoen || pick(\'運動公園\', /^運動公園/),', ''],
]);

// --- scrape deep ---
patch('_scrape_navi_route22_deep.js', [
  ['route-20', 'route-22'],
  ["const ROUTE_NUM = '20';", "const ROUTE_NUM = '22';"],
  ["const SIBLING_ROUTES = ['22', '9', '12', '25', '6', '14', '4', '2'];", "const SIBLING_ROUTES = ['20', '9', '12', '25', '6', '14', '4', '2'];"],
  ['return /\\[20\\]|【\\s*20\\s*系統\\s*】|^20\\s*\\[20\\]|^20千鳥|\\[20\\s/.test(s);',
    'return /\\[22\\]|【\\s*22\\s*系統\\s*】|^22\\s*\\[22\\]|^22千鳥|22千鳥東/.test(s);'],
  ["  '千鳥北', '千鳥西', '千鳥東', '千鳥中央', 'クリーンセンター', '浦安斎場',\n  '運動公園', '舞浜三丁目', '順天堂病院前', '新浦安駅', '新浦安駅北口',",
    "  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前', '千鳥車庫', '千鳥北', '千鳥東', '車庫裏', '運動公園', '舞浜三丁目',"],
  ['Exhaustive per-course trip enumeration for route-20', 'Exhaustive per-course trip enumeration for route-22'],
  ['Mixed cells with [22] require legend gate', 'Mixed cells with [20] require legend gate'],
  ['route20Cells', 'route22Cells'],
  ['candidateRoute20', 'candidateRoute22'],
]);

// --- verify signatures ---
patch('_verify_signatures.js', [
  ['route-20', 'route-22'],
  ["const ROUTE_NUM = '20';", "const ROUTE_NUM = '22';"],
  ["const SIBLING_ROUTE = '22';", "const SIBLING_ROUTE = '20';"],
  ['Route-22 (22千鳥東 / 若潮通り線) must be REJECTed', 'Route-20 (千鳥線) must be REJECTed'],
  ['千鳥車庫 berth 02', '千鳥車庫 berth 02 (mixed with route-20)'],
]);

// --- build official gate ---
patch('_build_official_gate.js', [
  ['route-20', 'route-22'],
  ["const ROUTE_NUM = '20';", "const ROUTE_NUM = '22';"],
  ["lineName: '千鳥線',", "lineName: '若潮通り線',"],
  ["displayCode: '20',", "displayCode: '22千鳥東',"],
  ['千鳥線（系統20 / route-20）', '若潮通り線（系統22 / route-22 / 22千鳥東）'],
  ['【２０系統】に解決した便のみ採用。22系統（22千鳥東 / 若潮通り線）は REJECT。',
    '【２２系統】に解決した便のみ採用。20系統（千鳥線）は REJECT。'],
  ['siblingSystemNumber: \'22\'', 'siblingSystemNumber: \'20\''],
  ['22系統は若潮通り線（22千鳥東）。千鳥東経由で新浦安駅方面。新浦安駅のりばBに掲載されるが系統20ではない。',
    '20系統は千鳥線（舞浜方面）。千鳥車庫のりば02等で22系統と混載するが別系統。'],
  ['siblingOsmRelations: (OSM.refProbe22 || [])', 'siblingOsmRelations: (OSM.refProbe20 || [])'],
  ['route-20 では22系統の便・停留所順・OSM relationを一切使用しない。',
    'route-22 では20系統の便・停留所順・OSM relationを一切使用しない。'],
  ['20系統と22系統の切り分け', '22系統と20系統の切り分け'],
  ['| 20系統 | 22系統 |', '| 22系統 | 20系統 |'],
  ['| 千鳥線 | 若潮通り線（22千鳥東） |', '| 若潮通り線（22千鳥東） | 千鳥線 |'],
  ['route-22（若潮通り線 / 22千鳥東）の便・OSM relation', 'route-20（千鳥線）の便・OSM relation'],
  ['除外した便（22系統等）', '除外した便（20系統等）'],
]);

// Replace inferSystemKey function body - write custom version
const gatePath = path.join(OUT, '_build_official_gate.js');
let gate = fs.readFileSync(gatePath, 'utf8');
gate = gate.replace(
  /function inferSystemKey\(s\) \{[\s\S]*?\n\}/,
  `function inferSystemKey(s) {
  const dep = s.stopNames[0];
  const dest = s.stopNames[s.stopNames.length - 1];
  if (dep === '新浦安駅' && dest === '千鳥車庫') {
    return { key: '22-shinurayasu-chidori-garage', directionGroup: 'outbound', osmRelationId: 18396547, title: '千鳥車庫行き（新浦安駅発・千鳥東経由）' };
  }
  if (dep === '千鳥車庫' && dest === '新浦安駅') {
    return { key: '22-chidori-garage-shinurayasu', directionGroup: 'inbound', osmRelationId: 18396546, title: '新浦安駅行き（千鳥車庫発・順天堂病院前経由）' };
  }
  return { key: \`22-unmapped-\${dep}-\${dest}\`.replace(/[^a-z0-9-]/gi, '-'), directionGroup: 'unknown', osmRelationId: null, title: \`\${dep} → \${dest}\` };
}`
);
fs.writeFileSync(gatePath, gate, 'utf8');
console.log('patched _build_official_gate.js inferSystemKey');

// --- fetch osm ---
patch('_fetch_osm_relations.js', [
  ['千鳥線 route 20', '若潮通り線 route 22'],
  ['chidori-route-trainer/route20-chidori-research', 'chidori-route-trainer/route22-wakashio-research'],
  ['const IDS = [13764790, 18323971, 18323972, 18351939, 18351940];', 'const IDS = [18396546, 18396547];'],
  [/const LABELS = \{[\s\S]*?\};/,
    `const LABELS = {
  18396546: 'route22 千鳥車庫⇒千鳥東⇒新浦安駅',
  18396547: 'route22 新浦安駅⇒千鳥東⇒千鳥車庫',
};`],
  ['Also probes ref=22 as separation guard (NOT used for route-20 geometry).',
    'Also probes ref=20 as separation guard (NOT used for route-22 geometry).'],
  ['ref=22 (若潮通り線 / 22千鳥東) relations are listed but NEVER used for route-20 geometry.',
    'ref=20 (千鳥線) relations are listed but NEVER used for route-22 geometry.'],
  ['refProbe22', 'refProbe20'],
  ['ref=22', 'ref=20'],
]);

// --- path builder: major rewrite via replacement of SYSTEMS block ---
const pathBuilder = fs.readFileSync(path.join(OUT, '_build_wakashio_dori_line_path.js'), 'utf8');
const pathPatched = pathBuilder
  .replace(/route-19 高洲南線/g, 'route-22 若潮通り線（22千鳥東）')
  .replace(/takasu-minami-line/g, 'wakashio-dori-line-22')
  .replace(/TAKASU_MINAMI/g, 'WAKASHIO_DORI_LINE_22')
  .replace(/2026-07-26-takasu-minami-line-v1/g, '2026-07-27-wakashio-dori-line-22-v1')
  .replace(/FORBIDDEN_SIBLING_RELATIONS = \{[\s\S]*?\};/, `FORBIDDEN_SIBLING_RELATIONS = {
  20: [13764790, 18323971, 18323972, 18351939, 18351940],
};`)
  .replace(/FORBIDDEN_SIBLING_STOPS = \{[\s\S]*?\};/, `FORBIDDEN_SIBLING_STOPS = {
  20: ['舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央'],
};`)
  .replace(/const SYSTEMS = \{[\s\S]*?\};\n\nconst SYSTEM_ORDER = \[[\s\S]*?\];/,
    `const SYSTEMS = {
  '22-shinurayasu-chidori-garage': {
    relationId: 18396547,
    resolvedVersion: '2026-07-27-wakashio22-shinurayasu-chidori-garage-v1',
    pathSource: 'osm-relation-18396547+startHint-shinurayasu',
    platformByIndex: true,
    note: 'outbound 新浦安駅→千鳥車庫（のりばB・◎ち＝【２２系統】）。relation 18396547 exact。',
  },
  '22-chidori-garage-shinurayasu': {
    relationId: 18396546,
    resolvedVersion: '2026-07-27-wakashio22-chidori-garage-shinurayasu-v1',
    pathSource: 'osm-relation-18396546+startHint-chidori-garage',
    platformByIndex: true,
    note: 'inbound 千鳥車庫→新浦安駅（のりば03・し＝【２２系統】）。relation 18396546 exact。',
  },
};

const SYSTEM_ORDER = [
  '22-shinurayasu-chidori-garage',
  '22-chidori-garage-shinurayasu',
];`)
  .replace(/\/\/ ★ route-15[\s\S]*?path・停留所は、新浦安駅のりばE[\s\S]*?流用しない。\n \*/g,
    ' * ★ route-20（千鳥線）relation 13764790/18323971/18323972/18351939/18351940 は使用禁止。\n *')
  .replace(/Writes takasu-minami-line-platforms-v1.js and takasu-minami-line-path-v1.js at repo root,/g,
    'Writes wakashio-dori-line-22-platforms-v1.js and wakashio-dori-line-22-path-v1.js at repo root,');

// Add platformByIndex support in buildDedicatedSystem output
const withByIndex = pathPatched.replace(
  /const platObjs = \{\};\n  for \(const m of matched\) \{\n    if \(!m\.platform\) continue;\n    platObjs\[m\.name\] = \{/,
  `const platObjs = {};
  if (def.platformByIndex) platObjs.byIndex = matched.map((m) => (m.platform ? {
    lat: m.platform.lat, lng: m.platform.lng, platformId: m.platform.platformId,
    role: m.platform.role, osmName: m.platform.osmName, name: m.name,
  } : null));
  for (const m of matched) {
    if (!m.platform) continue;
    platObjs[m.name] = {`
);

// Fix matchPlatforms to support byIndex (duplicate stop names)
const matchFn = `
function matchPlatforms(platforms, names) {
  const used = new Set();
  return names.map((name, index) => {
    const exact = platforms.filter((p) => !used.has(p.platformId) && normalizeKey(p.name) === normalizeKey(name));
    let platform = exact[0] || null;
    if (!platform) {
      const loose = platforms.filter((p) => !used.has(p.platformId) && (normalizeKey(p.name).includes(normalizeKey(name)) || normalizeKey(name).includes(normalizeKey(p.name))));
      platform = loose[0] || null;
    }
    if (platform) used.add(platform.platformId);
    return { name, index, platform: platform ? { ...platform, osmName: platform.name } : null, loose: Boolean(platform && normalizeKey(platform.name) !== normalizeKey(name)) };
  });
}
`;
const withMatch = withByIndex.replace(/function matchPlatforms\(platforms, names\) \{[\s\S]*?\n\}\n\nfunction normalizeKey/, matchFn + '\nfunction normalizeKey');

fs.writeFileSync(path.join(OUT, '_build_wakashio_dori_line_path.js'), withMatch, 'utf8');
console.log('patched _build_wakashio_dori_line_path.js');

// --- gen route module ---
patch('_gen_route_module.js', [
  ['route-20 千鳥線', 'route-22 若潮通り線'],
  ['chidori-line', 'wakashio-dori-line-22'],
  ['CHIDORI_LINE', 'WAKASHIO_DORI_LINE_22'],
  ['chidoriLine', 'wakashioDoriLine22'],
  ['ChidoriLine', 'WakashioDoriLine22'],
  ['chidori-20-', 'wakashio-22-'],
  ['chidori-', 'wakashio-22-'],
  ['千鳥線', '若潮通り線'],
  ['route-20', 'route-22'],
  ['route20StopEditor', 'route22StopEditor'],
  ['openRoute20StopEditor', 'openRoute22StopEditor'],
  ['2026-07-27-chidori-line-v1', '2026-07-27-wakashio-dori-line-22-v1'],
  ['evidence/route20-chidori-implementation-2026-07-27', 'evidence/route22-wakashio-dori-implementation-2026-07-27'],
  ['takasu-minami-line-route-v1.js', 'takasu-minami-line-route-v1.js'],
  ['chidori-line-route-v1.js', 'wakashio-dori-line-22-route-v1.js'],
  ['chidori-line-path-policy-v1.js', 'wakashio-dori-line-22-path-policy-v1.js'],
  ['chidori-line-stop-images-v1.js', 'wakashio-dori-line-22-stop-images-v1.js'],
  ['chidori-line-stop-images-v1.css', 'wakashio-dori-line-22-stop-images-v1.css'],
  ['const DISPLAY_CODE = \'20\';', "const DISPLAY_CODE = '22千鳥東';"],
  ['const SYSTEM_KEY = \'chidori-line-system-v1\';', "const SYSTEM_KEY = 'wakashio-dori-line-22-system-v1';"],
]);

// Replace SYSTEMS array in gen module
let gen = fs.readFileSync(path.join(OUT, '_gen_route_module.js'), 'utf8');
gen = gen.replace(
  /const SYSTEMS = \[[\s\S]*?\];/,
  `const SYSTEMS = [
  { key: '22-shinurayasu-chidori-garage', constName: 'NAMES_22_SHINURAYASU_CHIDORI_GARAGE', resolved: '2026-07-27-wakashio22-shinurayasu-chidori-garage-v1' },
  { key: '22-chidori-garage-shinurayasu', constName: 'NAMES_22_CHIDORI_GARAGE_SHINURAYASU', resolved: '2026-07-27-wakashio22-chidori-garage-shinurayasu-v1' },
];`
);
gen = gen.replace("const DEFAULT_SYSTEM = '20-maihama-clean-center';", "const DEFAULT_SYSTEM = '22-shinurayasu-chidori-garage';");
gen = gen.replace(
  /const INDEX_PLATFORM_SYSTEMS = new Set\(\[[\s\S]*?\]\);/,
  "const INDEX_PLATFORM_SYSTEMS = new Set(['22-shinurayasu-chidori-garage', '22-chidori-garage-shinurayasu']);"
);
gen = gen.replace(
  /const SIBLING_RELATIONS = \[[\s\S]*?\];/,
  "const SIBLING_RELATIONS = ['13764790', '18323971', '18323972', '18351939', '18351940'];"
);
gen = gen.replace(
  /const SIBLING_EXCLUSIVE_STOPS = \[[\s\S]*?\];/,
  "const SIBLING_EXCLUSIVE_STOPS = ['舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央'];"
);
gen = gen.replace(
  /const SIBLING_GLOBALS = \[[\s\S]*?\];/,
  "const SIBLING_GLOBALS = ['CHIDORI_LINE', 'chidoriLine', 'chidori-', 'route-20', 'TAKASU_MINAMI'];"
);
gen = gen.replace(
  /\/\/ ★千鳥車庫[\s\S]*?18396546\/18396547 は使用禁止。\n/,
  `// ★千鳥車庫のりば02等では [20]/[22] 混載。出発のりば凡例で【２２系統】に解決した便のみ採用。
// ★20系統（千鳥線 / 舞浜方面）relation 13764790/18323971/18323972/18351939/18351940 は使用禁止。
// 2運行パターン：18396547 outbound / 18396546 inbound。
// app route.name は data.js の「若潮通り線」。displayCode=22千鳥東。
`
);
gen = gen.replace(
  "route.description = '千鳥線：7運行パターン（公式系統番号はいずれも20。22系統・若潮通り線は除外）'",
  "route.description = '若潮通り線：2運行パターン（公式表示22千鳥東。20系統・千鳥線は除外）'"
);
gen = gen.replace(
  "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりば凡例で【２０系統】を判定し22系統を除外）。座標・道路はOSM relation採用。'",
  "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりば凡例で【２２系統】を判定し20系統を除外）。座標・道路はOSM relation 18396546/18396547 採用。'"
);
gen = gen.replace(/NAMES_19_/g, 'NAMES_22_');
gen = gen.replace(/19-takasu-seaside|19-shinurayasu/g, '22-shinurayasu-chidori-garage');
gen = gen.replace(/\/\^chidori-20-/, '/^wakashio-22-');
gen = gen.replace(/chidori-\$\{definition\.key\}/g, 'wakashio-22-${definition.key}');
gen = gen.replace(/高洲南線/g, '若潮通り線');
gen = gen.replace(/route-19/g, 'route-22');
fs.writeFileSync(path.join(OUT, '_gen_route_module.js'), gen, 'utf8');
console.log('patched _gen_route_module.js SYSTEMS');

// --- qa scripts ---
patch('_pathhash_geometry_qa.js', [
  ['chidori-line-path-v1.js', 'wakashio-dori-line-22-path-v1.js'],
  ['chidori-line-platforms-v1.js', 'wakashio-dori-line-22-platforms-v1.js'],
  ['CHIDORI_LINE_PATH_V1', 'WAKASHIO_DORI_LINE_22_PATH_V1'],
  ['CHIDORI_LINE_PLATFORMS_V1', 'WAKASHIO_DORI_LINE_22_PLATFORMS_V1'],
]);

patch('_continuous_drive.js', [
  ['route-20 千鳥線', 'route-22 若潮通り線'],
  ["routeId: 'route-20'", "routeId: 'route-22'"],
  ["await page.selectOption('#routeSelect', 'route-20');", "await page.selectOption('#routeSelect', 'route-22');"],
  ['chidori-line-route-v1.js', 'wakashio-dori-line-22-route-v1.js'],
  ['CHIDORI_LINE_ROUTE_V1', 'WAKASHIO_DORI_LINE_22_ROUTE_V1'],
  ['CHIDORI_LINE_PATH_V1', 'WAKASHIO_DORI_LINE_22_PATH_V1'],
  ['CHIDORI_LINE_PATH_POLICY_V1', 'WAKASHIO_DORI_LINE_22_PATH_POLICY_V1'],
  ['?nocache=r20', '?nocache=r22'],
  [/const SYSTEMS = \[[\s\S]*?\];/,
    `const SYSTEMS = [
  '22-shinurayasu-chidori-garage',
  '22-chidori-garage-shinurayasu',
];`],
  [/const SIBLING_EXACT = \[[\s\S]*?\];/,
    `const SIBLING_EXACT = ['舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央'];`],
  [/for \(const \[id, g\] of \[\['route-19', 'TAKASU_MINAMI_LINE_ROUTE_V1'\], \['route-22', null\]\]\) \{[\s\S]*?\}/,
    `for (const [id, g] of [['route-20', 'CHIDORI_LINE_ROUTE_V1'], ['route-19', 'TAKASU_MINAMI_LINE_ROUTE_V1']]) {
      await page.selectOption('#routeSelect', id);
      await page.waitForFunction((name) => Boolean(window[name]), g, { timeout: 30000 });
      const ok = await page.evaluate((name) => {
        const route = window[name].ensureRoute();
        return Object.keys(route.systems || {}).length > 0;
      }, g);
      report.regressions = report.regressions || {};
      report.regressions[id] = ok;
      if (!ok) report.failures.push(\`regression \${id}\`);
    }`],
]);

patch('_pwa_offline_check.js', [
  ["routeId: 'route-20'", "routeId: 'route-22'"],
  ["await page.selectOption('#routeSelect', 'route-20');", "await page.selectOption('#routeSelect', 'route-22');"],
  ['chidori-route-map-v112', 'chidori-route-map-v113'],
  ['v112', 'v113'],
  ['?nocache=r20pwa', '?nocache=r22pwa'],
  ['CHIDORI_LINE_ROUTE_V1', 'WAKASHIO_DORI_LINE_22_ROUTE_V1'],
  ['CHIDORI_LINE_PATH_V1', 'WAKASHIO_DORI_LINE_22_PATH_V1'],
  [/const ROUTE20_PACK = \[[\s\S]*?\];/,
    `const ROUTE22_PACK = [
  './wakashio-dori-line-22-stop-images-v1.css?v=113',
  './wakashio-dori-line-22-platforms-v1.js?v=113',
  './wakashio-dori-line-22-path-v1.js?v=113',
  './wakashio-dori-line-22-path-policy-v1.js?v=113',
  './wakashio-dori-line-22-stop-images-v1.js?v=113',
  './wakashio-dori-line-22-route-v1.js?v=113',
];`],
  ['ROUTE20_PACK', 'ROUTE22_PACK'],
  ['route20-pc1280.png', 'route22-pc1280.png'],
  ['route20-mobile390.png', 'route22-mobile390.png'],
]);

console.log('all patches done');
