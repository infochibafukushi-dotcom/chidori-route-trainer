'use strict';
/**
 * Generate route-19 高洲南線 modules by porting the shione-no-machi-line (route-15) pattern.
 *   takasu-minami-line-route-v1.js
 *   takasu-minami-line-path-policy-v1.js
 *   takasu-minami-line-stop-images-v1.js / .css
 *
 * Globals use the TAKASU_MINAMI_LINE prefix.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-26-takasu-minami-line-v1';
const EVIDENCE_DIR = 'evidence/route19-takasu-minami-implementation-2026-07-26';

const SYSTEMS = [
  { key: '19-takasu-seaside', constName: 'NAMES_19_TAKASU_SEASIDE', resolved: '2026-07-26-takasuminami19-takasu-seaside-v1' },
  { key: '19-shinurayasu', constName: 'NAMES_19_SHINURAYASU', resolved: '2026-07-26-takasuminami19-shinurayasu-v1' },
];

const DEFAULT_SYSTEM = '19-takasu-seaside';

const SIBLING_RELATIONS = [
  '18419865', '18419864', // 15
  '18352908', '18352907', '18417590', // 18
  '18381757', '18381756', // 10
];
const SIBLING_EXCLUSIVE_STOPS = [
  '潮音の街', '高洲中央公園', '高洲', // 15 mid-path
  '夢海の街', '高洲橋', '海風の街', '明海大学前', // 18
  'みなと南', // 10
];
const SIBLING_GLOBALS = [
  'SHIONE_NO_MACHI_LINE_PLATFORMS_V1', 'SHIONE_NO_MACHI_LINE_PATH_V1', 'SHIONE_NO_MACHI_LINE_PATH_POLICY_V1',
  'SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1', 'SHIONE_NO_MACHI_LINE_ROUTE_V1', 'SHIONE_NO_MACHI_LINE_DRIVE_STATE',
  'shioneNoMachiLine', 'ShioneNoMachi', 'shione-no-machi-', '潮音の街線',
  'AKEMI_TAKASU_LINE', 'akemiTakasuLine', 'akemi-takasu-', '明海・高洲線',
  'TAKASU_LINE_PATH_V1', 'takasu-line-',
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

  const header = `// 高洲南線（系統番号19・route-19）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★新浦安駅のりばFは [10] と [19] を同一セルに混載する。
//   系統の切り分けは2段凡例ゲート（掲載時刻表の凡例＋出発のりばの凡例）で判定済み。
//   無印…【１９系統】東京学館前、高洲四丁目、浦安南高校・特養ホーム経由 高洲海浜公園行き
//   み…【１０系統】東京学館前、高洲四丁目経由 みなと南（鉄鋼団地）行き ← 本モジュールでは採用しない
// 19系統固有の経由地は 浦安南高校特養ホーム／高洲二丁目〜八丁目。15系統の潮音の街・高洲中央公園・高洲、
// 18系統の夢海の街・高洲橋、10系統のみなと南は通らない（明海交差点・入船橋は15と共有）。
// 停留所座標：OSM platform採用（系統ごとに別relationのplatform。中央分離帯道路のため往復で座標が異なる）。
// 道路形状：OSM relation 18381771（往路）／18381770（復路）。Google Directionsは使用しない。
// 往路pathの反転による復路生成、および10/15/18/25系統のpath流用は禁止。
(() => {
  const ROUTE_ID = 'route-19';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-takasu-minami-line-system-v1';
  const DISPLAY_CODE = '19';
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
    [/SHIONE_NO_MACHI_LINE/g, 'TAKASU_MINAMI_LINE'],
    [/shioneNoMachiLine/g, 'takasuMinamiLine'],
    [/ShioneNoMachi/g, 'TakasuMinami'],
    [/shione-no-machi-15-/g, 'takasu-minami-19-'],
    [/shione-no-machi-/g, 'takasu-minami-'],
    [/潮音の街線/g, '高洲南線'],
    [/route-15/g, 'route-19'],
    [/route15StopEditor/g, 'route19StopEditor'],
    [/openRoute15StopEditor/g, 'openRoute19StopEditor'],
    [
      /route\.description = '[^']*'/,
      "route.description = '高洲南線：2運行パターン（公式系統番号はいずれも19。新浦安駅のりばFでは符号 無印＝【１９系統】、み＝【１０系統】）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（掲載時刻表と出発のりばの2段凡例で【１９系統】を判定し10/15/18/25系統を除外）。座標・道路はOSM relation 18381771/18381770採用。'",
    ],
    [
      /const order = \['15-takasu-seaside', '15-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
  ];
  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  const leftover = [
    'NAMES_15_', '15-takasu-seaside', '15-shinurayasu', 'SHIONE_NO_MACHI', 'shioneNoMachiLine',
    'ShioneNoMachi', 'shione-no-machi-', '潮音の街線', 'takasu-minami-15-', 'route-15',
    'route15StopEditor', 'openRoute15StopEditor', 'AKEMI_TAKASU', 'akemiTakasu',
  ].filter((needle) => src.includes(needle));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  const dataStart = src.indexOf(`const ${SYSTEMS[0].constName}`);
  const dataEnd = src.indexOf(`const DEFAULT_SYSTEM_KEY = '${DEFAULT_SYSTEM}';`);
  if (dataStart < 0 || dataEnd < 0) throw new Error('FAILED to locate route-19 data region');
  const dataRegion = src.slice(dataStart, dataEnd);
  const stopLeak = SIBLING_EXCLUSIVE_STOPS.filter((n) => dataRegion.includes(`"${n}"`) || dataRegion.includes(`'${n}'`));
  if (stopLeak.length) throw new Error(`SIBLING STOP LEAK ${stopLeak.join(', ')}`);

  const officialNames = new Set(SYSTEMS.flatMap((s) => ORDERS.systems[s.key].stopNames));
  for (const m of dataRegion.matchAll(/"([^"]+)"/g)) {
    if (['key', 'displayCode', 'directionGroup', 'title', 'summary', 'relationId', 'timetableSymbol', 'naviCourse', 'names'].includes(m[1])) continue;
    if (/^\d+$/.test(m[1])) continue;
    if (/^19-/.test(m[1])) continue;
    if (!officialNames.has(m[1]) && !['outbound', 'inbound', '無印', '高洲海浜公園行き', '新浦安駅行き'].includes(m[1]) && !m[1].includes('→')) {
      // allow summary strings containing arrows already in ORDERS
    }
  }

  assertNoSiblingLeak(src, 'route module', { allowRelationMention: true });
  fs.writeFileSync(path.join(ROOT, 'takasu-minami-line-route-v1.js'), src, 'utf8');
  console.log('wrote takasu-minami-line-route-v1.js', src.length);
}

function buildPathPolicy() {
  const minPoints = {};
  for (const s of SYSTEMS) {
    const n = BUILD.systems[s.key]?.pathPoints;
    if (!n) throw new Error(`missing pathPoints for ${s.key}`);
    minPoints[s.key] = Math.max(50, Math.floor(n * 0.85));
  }
  const js = `// 高洲南線（route-19）の道路形状ポリシーと実行時検証。
// 停留所順：京成バスナビ個別便通過時刻表で確認済み（凡例 無印=【１９系統】。み＝10系統は除外）。
// 座標・道路：OSM relation 18381771（往路）/18381770（復路）採用（要走行確認）。
(() => {
  const POLICY_VERSION = '${VERSION}-path';
  const MIN_PATH_POINTS_BY_SYSTEM = ${JSON.stringify(minPoints, null, 2).replace(/\n/g, '\n  ')};
  const MAX_GAP_M = 30;
  const MAX_IDENTICAL_RUN = 5;
  const LAT_MIN = 35.60;
  const LAT_MAX = 35.70;
  const LNG_MIN = 139.86;
  const LNG_MAX = 139.95;

  function distanceMeters(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function minPathPointsFor(systemKey) {
    return MIN_PATH_POINTS_BY_SYSTEM[systemKey] || 100;
  }

  function validateRuntimePath({
    systemKey, path, pathHash, expectedPathHash, resolvedVersion, expectedResolvedVersion, directionGroup, pathSource,
  }) {
    const reasons = [];
    const minPoints = minPathPointsFor(systemKey);
    if (!systemKey) reasons.push('systemKey不在');
    if (!directionGroup) reasons.push('directionGroup不在');
    if (!pathSource) reasons.push('pathSource不在');
    if (!expectedResolvedVersion) reasons.push('expectedResolvedVersion不在');
    else if (resolvedVersion !== expectedResolvedVersion) reasons.push('resolvedVersion不一致');
    if (!expectedPathHash) reasons.push('期待pathHash不在');
    else if (!pathHash) reasons.push('pathHash未計算');
    else if (pathHash !== expectedPathHash) reasons.push('pathHash不一致');
    if (!Array.isArray(path) || path.length < minPoints) reasons.push(\`path点数不足（最低\${minPoints}）\`);
    let maxGapM = 0;
    let identicalRun = 1;
    (path || []).forEach((point, index) => {
      if (!point || point.lat == null || point.lng == null) {
        reasons.push(\`座標null（index=\${index}）\`);
        return;
      }
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reasons.push(\`座標NaN（index=\${index}）\`);
        return;
      }
      if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
        reasons.push(\`緯度経度範囲外（index=\${index}）\`);
      }
      if (index === 0) return;
      const prev = path[index - 1];
      const gap = distanceMeters(
        { lat: Number(prev.lat), lng: Number(prev.lng) },
        { lat, lng },
      );
      if (Number.isFinite(gap) && gap > maxGapM) maxGapM = gap;
      if (Number(prev.lat) === lat && Number(prev.lng) === lng) {
        identicalRun += 1;
        if (identicalRun >= MAX_IDENTICAL_RUN) {
          reasons.push(\`同一点の異常連続（index=\${index}）\`);
        }
      } else {
        identicalRun = 1;
      }
    });
    if (maxGapM > MAX_GAP_M) {
      reasons.push(\`maxGap超過（\${maxGapM.toFixed(1)}m > \${MAX_GAP_M}m）\`);
    }
    return {
      ok: reasons.length === 0,
      reasons,
      maxGapM: Math.round(maxGapM * 10) / 10,
      pointCount: (path || []).length,
      policyVersion: POLICY_VERSION,
    };
  }

  window.TAKASU_MINAMI_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsBySystem: MIN_PATH_POINTS_BY_SYSTEM,
    maxGapM: MAX_GAP_M,
    validateRuntimePath,
  };
})();
`;
  assertNoSiblingLeak(js, 'path-policy');
  fs.writeFileSync(path.join(ROOT, 'takasu-minami-line-path-policy-v1.js'), js, 'utf8');
  console.log('wrote takasu-minami-line-path-policy-v1.js');
}

function buildStopImages() {
  const js = `// 高洲南線（route-19）停留所画像バンク初期化。
// キー形式: \`\${systemKey}|\${normalize(stopName)}\`
// 画像なしでも走行可能。D1共有フィールドは route.takasuMinamiLineStopImages。
(() => {
  window.TAKASU_MINAMI_LINE_STOP_IMAGES_V1 = window.TAKASU_MINAMI_LINE_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`;
  const css = `/* 高洲南線（route-19）停留所画像用スタイル（空。共通UIに委譲） */\n`;
  fs.writeFileSync(path.join(ROOT, 'takasu-minami-line-stop-images-v1.js'), js, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'takasu-minami-line-stop-images-v1.css'), css, 'utf8');
  console.log('wrote stop-images js/css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
