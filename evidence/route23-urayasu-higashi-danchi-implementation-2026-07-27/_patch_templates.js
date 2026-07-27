'use strict';
/** One-shot patch of copied route-22 templates → route-23 浦安東団地線（23系統・舞浜発着）. */
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
patch('_scrape_navi_route23_all.js', [
  ['route-22', 'route-23'],
  ['系統22 若潮通り線（22千鳥東）', '系統23 浦安東団地線（舞浜⇔総合公園）'],
  ["const ROUTE_NUM = '22';", "const ROUTE_NUM = '23';"],
  ["const SIBLING_ROUTES = ['20', '9', '12', '25', '6', '14', '4', '2'];", "const SIBLING_ROUTES = ['3', '11', '18', '6', '20', '22', '25', '9'];"],
  ["lineName: '若潮通り線',", "lineName: '浦安東団地線',"],
  ["note: 'Route 22 discovery (22千鳥東). Gate 【２２系統】. Separate from [20] 千鳥線.'",
    "note: 'Route 23 discovery. Gate 【２３系統】. Separate from [3] route-3 (浦安駅入口 terminal). 新浦安駅 berth H: 3 [23] co-listed.'"],
  ['return /\\[22\\]|【\\s*22\\s*系統\\s*】|^22\\s*\\[22\\]|^22千鳥|22千鳥東/.test(s);',
    'return /\\[23\\]|【\\s*23\\s*系統\\s*】|^23\\s*\\[23\\]/.test(s);'],
  ['if (n === \'22\') return false;', 'if (n === \'23\') return false;'],
  ['  chidoriGarage: \'00020620\',', '  maihama: \'00020617\',\n  sogo: \'00020618\','],
  ["  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前',\n  '千鳥車庫', '千鳥北', '千鳥東', '車庫裏', '運動公園', '舞浜三丁目',",
    "  '舞浜駅', '総合公園', '新浦安駅', '入船中央エステート', '明海大学前', '海風の街', '夢海の街', '望海の街', '明海六丁目', '明海南小学校', '三井ガーデンホテル', 'ハイアットリージェンシー', '明海五丁目', 'ベイサイドホテルエリア', '消防本部前', '浦安駅入口',"],
  ['route22:', 'route23:'],
  ['route22Courses', 'route23Courses'],
  ['.route22?.', '.route23?.'],
  ['t.route22 || []', 't.route23 || []'],
  ['courses.route22', 'courses.route23'],
  ['for (const c of courses.route22)', 'for (const c of courses.route23)'],
  ['=== ROUTE 22 COURSES ===', '=== ROUTE 23 COURSES ==='],
  ['sibling20Cells', 'sibling3Cells'],
  ['if (/\\[20\\]|【\\s*20\\s*系統|20千鳥/.test(toAsciiDigits(c.text || \'\'))) {',
    'if (/\\[3\\]|【\\s*3\\s*系統\\s*】|^3\\s*\\[3\\]/.test(toAsciiDigits(c.text || \'\'))) {'],
  ["gatedRoute: '20',", "gatedRoute: '3',"],
  ['  { key: \'chidoriGarage\', label: \'千鳥車庫\', id: idByKey.chidoriGarage },\n', ''],
  ['  { key: \'shinurayasu\', label: \'新浦安駅\', id: idByKey.shinurayasu },\n',
    '  { key: \'maihama\', label: \'舞浜駅\', id: idByKey.maihama },\n  { key: \'sogo\', label: \'総合公園\', id: idByKey.sogo },\n  { key: \'shinurayasu\', label: \'新浦安駅\', id: idByKey.shinurayasu },\n'],
  ['chidoriGarage: KNOWN_IDS.chidoriGarage || pick(\'千鳥車庫\', /千鳥車庫/),', ''],
  ['maihama: KNOWN_IDS.maihama || pick(\'舞浜駅\', /舞浜駅/),', 'maihama: KNOWN_IDS.maihama || pick(\'舞浜駅\', /舞浜駅/),'],
  ['shinurayasu: KNOWN_IDS.shinurayasu || pick(\'新浦安駅\', /^新浦安駅/),', 'sogo: KNOWN_IDS.sogo || pick(\'総合公園\', /^総合公園/),'],
]);

// --- scrape deep ---
patch('_scrape_navi_route23_deep.js', [
  ['route-22', 'route-23'],
  ["const ROUTE_NUM = '22';", "const ROUTE_NUM = '23';"],
  ["const SIBLING_ROUTES = ['20', '9', '12', '25', '6', '14', '4', '2'];", "const SIBLING_ROUTES = ['3', '11', '18', '6', '20', '22', '25', '9'];"],
  ['return /\\[22\\]|【\\s*22\\s*系統\\s*】|^22\\s*\\[22\\]|^22千鳥|22千鳥東/.test(s);',
    'return /\\[23\\]|【\\s*23\\s*系統\\s*】|^23\\s*\\[23\\]/.test(s);'],
  ["  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前', '千鳥車庫', '千鳥北', '千鳥東', '車庫裏', '運動公園', '舞浜三丁目',",
    "  '舞浜駅', '総合公園', '新浦安駅', '入船中央エステート', '明海大学前', '海風の街', '夢海の街', '望海の街', '明海六丁目', '明海南小学校', '三井ガーデンホテル', 'ハイアットリージェンシー', '明海五丁目', 'ベイサイドホテルエリア', '消防本部前', '浦安駅入口', '順天堂病院前', '見明川住宅', '見明川中学校前',"],
  ['Exhaustive per-course trip enumeration for route-22', 'Exhaustive per-course trip enumeration for route-23'],
  ['Mixed cells with [20] require legend gate', 'Mixed cells with [3] at 新浦安 berth H require legend gate'],
  ['route22Cells', 'route23Cells'],
  ['candidateRoute22', 'candidateRoute23'],
]);

// --- verify signatures ---
patch('_verify_signatures.js', [
  ['route-22', 'route-23'],
  ["const ROUTE_NUM = '22';", "const ROUTE_NUM = '23';"],
  ["const SIBLING_ROUTE = '20';", "const SIBLING_ROUTE = '3';"],
  ['Route-20 (千鳥線) must be REJECTed', 'Route-3 (浦安駅入口 terminal) must be REJECTed'],
  ['千鳥車庫 berth 02 (mixed with route-20)', '新浦安駅 berth H (3 [23] co-listed with route-3)'],
  ['千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例を決定打とする。',
    '新浦安駅のりばH等では [3]/[23]/[11]/[18] が混載されるため、(B) 出発のりば凡例が【２３系統】に解決した便のみ採用。(A) が【３系統】なら REJECT。'],
]);

// --- build official gate ---
patch('_build_official_gate.js', [
  ['route-22', 'route-23'],
  ["const ROUTE_NUM = '22';", "const ROUTE_NUM = '23';"],
  ["lineName: '若潮通り線',", "lineName: '浦安東団地線',"],
  ['若潮通り線（系統22 / route-22 / 22千鳥東）', '浦安東団地線（系統23 / route-23 / 舞浜⇔総合公園）'],
  ['【２２系統】に解決した便のみ採用。20系統（千鳥線）は REJECT。',
    '【２３系統】に解決した便のみ採用。3系統（route-3 / 浦安駅入口 terminal）は REJECT。'],
  ['siblingSystemNumber: \'20\'', 'siblingSystemNumber: \'3\''],
  ['20系統は千鳥線（舞浜方面）。千鳥車庫のりば02等で22系統と混載するが別系統。',
    '3系統はroute-3（浦安駅入口⇔総合公園）。新浦安駅のりばHで23系統と混載（3 [23] co-listed）するが別系統。'],
  ['siblingOsmRelations: (OSM.refProbe20 || [])', 'siblingOsmRelations: (OSM.refProbe3 || [])'],
  ['route-22 では20系統の便・停留所順・OSM relationを一切使用しない。',
    'route-23 では3系統の便・停留所順・OSM relation 18417570/18417571/18417579 を一切使用しない。'],
  ['22系統と20系統の切り分け', '23系統と3系統の切り分け'],
  ['| 22系統 | 20系統 |', '| 23系統 | 3系統 |'],
  ['| 若潮通り線（22千鳥東） | 千鳥線 |', '| 舞浜⇔総合公園（23系統） | 浦安駅入口⇔総合公園（3系統） |'],
  ['route-20（千鳥線）の便・OSM relation', 'route-3（浦安東団地線・浦安駅入口 terminal）の便・OSM relation'],
  ['除外した便（20系統等）', '除外した便（3系統等）'],
  ['千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例が【２０系統】に解決した便のみ採用。22系統（22千鳥東 / 若潮通り線）は REJECT。',
    '新浦安駅のりばH等では [3]/[23]/[11]/[18] が混載されるため、(B) 出発のりば凡例が【２３系統】に解決した便のみ採用。3系統（浦安駅入口 terminal）は REJECT。'],
]);

const gatePath = path.join(OUT, '_build_official_gate.js');
let gate = fs.readFileSync(gatePath, 'utf8');
gate = gate.replace(
  /function inferSystemKey\(s\) \{[\s\S]*?\n\}/,
  `function inferSystemKey(s) {
  const dep = s.stopNames[0];
  const dest = s.stopNames[s.stopNames.length - 1];
  if (dep === '舞浜駅' && dest === '総合公園') {
    return { key: '23-maihama-sogo', directionGroup: 'outbound', osmRelationId: 18419895, title: '総合公園行き（舞浜駅発）' };
  }
  if (dep === '総合公園' && dest === '舞浜駅') {
    return { key: '23-sogo-maihama', directionGroup: 'inbound', osmRelationId: 18419894, title: '舞浜駅行き（総合公園発）' };
  }
  return { key: \`23-unmapped-\${dep}-\${dest}\`.replace(/[^a-z0-9-]/gi, '-'), directionGroup: 'unknown', osmRelationId: null, title: \`\${dep} → \${dest}\` };
}`
);
fs.writeFileSync(gatePath, gate, 'utf8');
console.log('patched _build_official_gate.js inferSystemKey');

// --- fetch osm ---
patch('_fetch_osm_relations.js', [
  ['若潮通り線 route 22', '浦安東団地線 route 23'],
  ['chidori-route-trainer/route22-wakashio-research', 'chidori-route-trainer/route23-urayasu-research'],
  ['const IDS = [18396546, 18396547];', 'const IDS = [18419894, 18419895];'],
  [/const LABELS = \{[\s\S]*?\};/,
    `const LABELS = {
  18419894: 'route23 総合公園⇒望海の街・新浦安駅⇒舞浜駅',
  18419895: 'route23 舞浜駅⇒新浦安駅・望海の街⇒総合公園',
};`],
  ['Also probes ref=20 as separation guard (NOT used for route-22 geometry).',
    'Also probes ref=3 as separation guard (NOT used for route-23 geometry).'],
  ['ref=20 (千鳥線) relations are listed but NEVER used for route-22 geometry.',
    'ref=3 (route-3) relations 18417570/18417571/18417579 are listed but NEVER used for route-23 geometry.'],
  ['refProbe20', 'refProbe3'],
  ['ref=20', 'ref=3'],
  ["route: 'wakashio-dori-route22'", "route: 'urayasu-higashi-danchi-route23'"],
  ["lineName: '若潮通り線',", "lineName: '浦安東団地線',"],
]);

// --- path builder ---
const pathBuilder = fs.readFileSync(path.join(OUT, '_build_urayasu_higashi_danchi_line_23_path.js'), 'utf8');
const pathPatched = pathBuilder
  .replace(/route-22 若潮通り線（22千鳥東）/g, 'route-23 浦安東団地線（23系統・舞浜⇔総合公園）')
  .replace(/wakashio-dori-line-22/g, 'urayasu-higashi-danchi-line-23')
  .replace(/WAKASHIO_DORI_LINE_22/g, 'URAYASU_HIGASHI_DANCHI_LINE_23')
  .replace(/2026-07-27-wakashio-dori-line-22-v1/g, '2026-07-27-urayasu-higashi-danchi-line-23-v1')
  .replace(/2026-07-27-wakashio22-/g, '2026-07-27-urayasu23-')
  .replace(/FORBIDDEN_SIBLING_RELATIONS = \{[\s\S]*?\};/, `FORBIDDEN_SIBLING_RELATIONS = {
  3: [18417570, 18417571, 18417579],
};`)
  .replace(/FORBIDDEN_SIBLING_STOPS = \{[\s\S]*?\};/, `FORBIDDEN_SIBLING_STOPS = {
  3: ['浦安駅入口', 'シンボルロード・パークシティ', 'ベイパーク', 'ベイモール', '神明裏', '猫実', '海楽', '美浜東団地'],
};`)
  .replace(/const SYSTEMS = \{[\s\S]*?\};\s*\n\s*const SYSTEM_ORDER/m, `const SYSTEMS = {
  '23-maihama-sogo': {
    relationId: 18419895,
    resolvedVersion: '2026-07-27-urayasu23-maihama-sogo-v1',
    pathSource: 'osm-relation-18419895+startHint-maihama',
    platformByIndex: true,
    note: 'outbound 舞浜駅→総合公園。relation 18419895 exact。',
  },
  '23-sogo-maihama': {
    relationId: 18419894,
    resolvedVersion: '2026-07-27-urayasu23-sogo-maihama-v1',
    pathSource: 'osm-relation-18419894+startHint-sogo',
    platformByIndex: true,
    note: 'inbound 総合公園→舞浜駅。relation 18419894 exact。',
  },
};

const SYSTEM_ORDER`)
  .replace(/routeId: 'route-22'/g, "routeId: 'route-23'")
  .replace(/displayCode: '22千鳥東'/g, "displayCode: '23'")
  .replace(/route-20（千鳥線）relation 13764790\/18323971\/18323972\/18351939\/18351940 は使用禁止。/g,
    'route-3 relation 18417570/18417571/18417579 は使用禁止。')
  .replace(/18396547 outbound \/ 18396546 inbound/g, '18419895 outbound / 18419894 inbound')
  .replace(/【２２系統】/g, '【２３系統】');
fs.writeFileSync(path.join(OUT, '_build_urayasu_higashi_danchi_line_23_path.js'), pathPatched, 'utf8');
console.log('patched _build_urayasu_higashi_danchi_line_23_path.js');

// --- gen route module ---
const genPath = path.join(OUT, '_gen_route_module.js');
let gen = fs.readFileSync(genPath, 'utf8');
gen = gen.replace(/route-22/g, 'route-23');
gen = gen.replace(/wakashio-dori-line-22/g, 'urayasu-higashi-danchi-line-23');
gen = gen.replace(/WAKASHIO_DORI_LINE_22/g, 'URAYASU_HIGASHI_DANCHI_LINE_23');
gen = gen.replace(/2026-07-27-wakashio-dori-line-22-v1/g, '2026-07-27-urayasu-higashi-danchi-line-23-v1');
gen = gen.replace(/2026-07-27-wakashio22-/g, '2026-07-27-urayasu23-');
gen = gen.replace(/route22-wakashio-dori-implementation-2026-07-27/g, 'route23-urayasu-higashi-danchi-implementation-2026-07-27');
gen = gen.replace(/若潮通り線/g, '浦安東団地線');
gen = gen.replace(/22千鳥東/g, '23');
gen = gen.replace(/wakashio-dori-line-22-system-v1/g, 'urayasu-higashi-danchi-line-23-system-v1');
gen = gen.replace(/wakashio-22-/g, 'urayasu23-');
gen = gen.replace(/route22StopEditor/g, 'route23StopEditor');
gen = gen.replace(/openRoute22StopEditor/g, 'openRoute23StopEditor');
gen = gen.replace(/takasu-minami-line-route-v1.js/g, 'wakashio-dori-line-22-route-v1.js');
gen = gen.replace(/CHIDORI_LINE/g, 'URAYASU_HIGASHI_DANCHI_LINE_23');
gen = gen.replace(/13764790', '18323971', '18323972', '18351939', '18351940/g, "18417570', '18417571', '18417579");
gen = gen.replace(/舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央/g,
  "浦安駅入口', 'シンボルロード・パークシティ', 'ベイパーク', 'ベイモール', '神明裏', '猫実");
gen = gen.replace(/千鳥車庫のりば02等では \[20\]\/\[22\]/g, '新浦安駅のりばH等では [3]/[23]');
gen = gen.replace(/20系統（千鳥線/g, '3系統（route-3');
gen = gen.replace(/18396547 outbound \/ 18396546 inbound/g, '18419895 outbound / 18419894 inbound');
gen = gen.replace(/const SYSTEMS = \[[\s\S]*?\];/,
  `const SYSTEMS = [
  { key: '23-maihama-sogo', constName: 'NAMES_23_MAIHAMA_SOGO', resolved: '2026-07-27-urayasu23-maihama-sogo-v1' },
  { key: '23-sogo-maihama', constName: 'NAMES_23_SOGO_MAIHAMA', resolved: '2026-07-27-urayasu23-sogo-maihama-v1' },
];`);
gen = gen.replace(/const DEFAULT_SYSTEM = '22-shinurayasu-chidori-garage';/,
  "const DEFAULT_SYSTEM = '23-maihama-sogo';");
gen = gen.replace(/new Set\(\['22-shinurayasu-chidori-garage', '22-chidori-garage-shinurayasu'\]\)/,
  "new Set(['23-maihama-sogo', '23-sogo-maihama'])");
fs.writeFileSync(genPath, gen, 'utf8');
console.log('patched _gen_route_module.js');

// --- pathhash qa ---
patch('_pathhash_geometry_qa.js', [
  ['route-22', 'route-23'],
  ['wakashio-dori-line-22', 'urayasu-higashi-danchi-line-23'],
  ['22-shinurayasu-chidori-garage', '23-maihama-sogo'],
  ['22-chidori-garage-shinurayasu', '23-sogo-maihama'],
]);

// --- continuous drive ---
const cdPath = path.join(OUT, '_continuous_drive.js');
let cd = fs.readFileSync(cdPath, 'utf8');
cd = cd.replace(/route-22/g, 'route-23');
cd = cd.replace(/wakashio-dori-line-22/g, 'urayasu-higashi-danchi-line-23');
cd = cd.replace(/WAKASHIO_DORI_LINE_22/g, 'URAYASU_HIGASHI_DANCHI_LINE_23');
cd = cd.replace(/22-shinurayasu-chidori-garage/g, '23-maihama-sogo');
cd = cd.replace(/22-chidori-garage-shinurayasu/g, '23-sogo-maihama');
cd = cd.replace(/若潮通り線/g, '浦安東団地線');
cd = cd.replace(/舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央/g,
  "浦安駅入口', 'シンボルロード・パークシティ', 'ベイパーク', 'ベイモール'");
cd = cd.replace(
  /\/\/ Regression: route-3 hashes[\s\S]*?route-3 pathHashes unchanged/,
  `// Regression: route-3 pathHashes unchanged vs HEAD
    await page.selectOption('#routeSelect', 'route-3');
    await page.waitForTimeout(400);
    const r3Hashes = await page.evaluate(() => {
      const bank = window.URAYASU_HIGASHI_DANCHI_PATH_V1?.systems || {};
      return Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.pathHash]));
    });
    const EXPECTED_R3 = {
      '3-sogo': '3daf39e59686b2b20d0c5d724cb14003a1e04dee55dd459b58527873ccc4eafa',
      '3-urayasu': 'a9ec5527f136b2ac832aac68f4f5be032d1717af8a708f38636b534f99cee2f7',
      '3-symbol': '1026178ab4987963bddc1c044e91fdaab3f87c63690e74b5f7b5295646c3d70b',
      '3-akeumi': '75b336c39143045eb52ad48cda9b08751674a11341656e02543b6b683d92bf5d',
    };
    for (const [k, h] of Object.entries(EXPECTED_R3)) {
      if (r3Hashes[k] !== h) report.failures.push(\`route-3 \${k} pathHash changed: \${r3Hashes[k]} vs \${h}\`);
    }
    report.route3PathHashesUnchanged = !report.failures.some((f) => f.includes('route-3'));`
);
fs.writeFileSync(cdPath, cd, 'utf8');
console.log('patched _continuous_drive.js');

// --- pwa offline ---
patch('_pwa_offline_check.js', [
  ['route-22', 'route-23'],
  ['wakashio-dori-line-22', 'urayasu-higashi-danchi-line-23'],
  ['chidori-route-map-v113', 'chidori-route-map-v114'],
  ['v113', 'v114'],
  ['v=113', 'v=114'],
]);

console.log('route-23 template patch complete');
