'use strict';
/**
 * Rewrite _build_takasu_minami_line_path.js for route-19's two dedicated OSM relations.
 * No composition / short-turn — both directions have their own ref=19 relation.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const srcPath = path.join(OUT, '_build_takasu_minami_line_path.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Keep the algorithmic body from route-18; replace the system catalogue and forbidden sets.
const header = `'use strict';
/**
 * Build platforms + pathPoints for route-19 高洲南線 from OSM relations.
 *
 * Rules:
 *  - Stop order comes from official-stop-orders.json (navi). Never reversed/truncated.
 *  - Dedicated-relation systems (18381771 / 18381770) are built independently;
 *    none is derived by reversing or truncating another.
 *  - densify only inside a single OSM way; way joins need a shared node or ≤1m.
 *  - Google Directions is never used.
 *  - ★ route-10（みなと南経由）、route-15（潮音の街・高洲中央公園・高洲経由）、
 *    route-18（夢海の街・高洲橋経由）、route-25 の path・停留所は、
 *    新浦安駅のりばFや高洲海浜公園のりばを共有していても一切流用しない。
 *  - Do NOT truncate route-10 or reverse route-15.
 *
 * Writes takasu-minami-line-platforms-v1.js and takasu-minami-line-path-v1.js at repo root,
 * plus _build_summary.json / _platforms_bank.json / _path_bank.json here.
 */
`;

// Find start of shared helpers (const PLATFORM_DIST...) and keep from loadRelation onward...
// Easier: replace SYSTEMS / FORBIDDEN / GENERATED / output filenames via targeted replacements.

const replacements = [
  ["明海・高洲線", "高洲南線"],
  ["route-18", "route-19"],
  ["route 18", "route 19"],
  ["AKEMI_TAKASU_LINE", "TAKASU_MINAMI_LINE"],
  ["akemi-takasu-line-", "takasu-minami-line-"],
  ["2026-07-26-akemi-takasu-line-v1", "2026-07-26-takasu-minami-line-v1"],
  ["2026-07-26-akemitakasu18-", "2026-07-26-takasuminami19-"],
];

for (const [a, b] of replacements) {
  src = src.split(a).join(b);
}

// Replace forbidden sibling sets for route-19 perspective
src = src.replace(
  /const FORBIDDEN_SIBLING_RELATIONS = \{[\s\S]*?\};/,
  `const FORBIDDEN_SIBLING_RELATIONS = {
  10: [18381757, 18381756],
  15: [18419865, 18419864],
  18: [18352908, 18352907, 18417590],
  25: [18352022, 18352023, 18352044, 18352045],
  11: [18352883, 18352884, 18419852],
  3: [18417570, 18417571, 18417579],
  23: [18419894, 18419895],
};`
);

src = src.replace(
  /const FORBIDDEN_SIBLING_STOPS = \{[\s\S]*?\};/,
  `const FORBIDDEN_SIBLING_STOPS = {
  10: ['みなと南'],
  15: ['潮音の街', '高洲中央公園', '高洲'],
  18: ['夢海の街', '高洲橋', '海風の街', '明海大学前'],
  '3/23': ['総合公園', 'ベイサイドホテルエリア', '望海の街', '明海五丁目'],
  11: ['ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館'],
  25: ['サンコーポ東口', 'サンコーポ西口', '若潮公園', '新浦安駅北口'],
};`
);

// Replace SYSTEMS catalogue with two dedicated systems only
src = src.replace(
  /const SYSTEMS = \{[\s\S]*?\n\};\n\nconst SYSTEM_ORDER = \[[\s\S]*?\];/,
  `const SYSTEMS = {
  '19-takasu-seaside': {
    relationId: 18381771,
    resolvedVersion: '2026-07-26-takasuminami19-takasu-seaside-v1',
    pathSource: 'osm-relation-18381771+startHint-shinurayasu',
    note: 'outbound 新浦安駅→高洲海浜公園（のりばF・符号無印＝【１９系統】）。'
      + '10系統（み＝みなと南）や15系統（潮音の街経由）のpathは流用禁止。',
  },
  '19-shinurayasu': {
    relationId: 18381770,
    resolvedVersion: '2026-07-26-takasuminami19-shinurayasu-v1',
    pathSource: 'osm-relation-18381770+startHint-takasu-kaihin-koen',
    note: 'inbound 高洲海浜公園→新浦安駅（のりば19・符号無印＝【１９系統】）。'
      + '往路18381771の反転は禁止（往復で別車線・別ノードのplatformを持つ）。',
  },
};

const SYSTEM_ORDER = [
  '19-takasu-seaside',
  '19-shinurayasu',
];`
);

src = src.replace(
  /const ALLOWED_CONTIGUOUS_SLICE_PAIRS = \[[\s\S]*?\];/,
  'const ALLOWED_CONTIGUOUS_SLICE_PAIRS = [];'
);

// Remove SHINURAYASU_BERTH_X and composition builders if they cause issues — keep but unused.
// Update otherRouteReuseForbidden text
src = src.replace(
  /otherRouteReuseForbidden: '[^']*'/,
  "otherRouteReuseForbidden: 'route-10（みなと南経由）/ 15（潮音の街・高洲経由）/ 18（夢海の街・高洲橋経由）/ 25 の path・停留所順は流用しない'"
);

src = src.replace(
  /stopOrderSource: '[^']*'/,
  "stopOrderSource: 'official-stop-orders.json（京成バスナビ個別便通過時刻表・2段凡例ゲートで【１９系統】に確定）'"
);

src = src.replace(
  /pathSource: 'OSM route relation way members[^']*'/,
  "pathSource: 'OSM route relation way members（方向補正あり）。18381771／18381770 を独立構築'"
);

// Ensure startHint keys exist in ORDERS matching
// buildDedicatedSystem uses ORDERS.systems[key].stopNames[0] as hint — fine.

fs.writeFileSync(srcPath, src, 'utf8');
console.log('rewrote path builder', src.length);
