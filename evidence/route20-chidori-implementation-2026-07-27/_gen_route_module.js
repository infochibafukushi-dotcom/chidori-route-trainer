'use strict';
/**
 * Generate route-20 千鳥線 modules from takasu-minami-line pattern.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-chidori-line-v1';
const EVIDENCE_DIR = 'evidence/route20-chidori-implementation-2026-07-27';

const SYSTEMS = [
  { key: '20-maihama-clean-center', constName: 'NAMES_20_MAIHAMA_CLEAN_CENTER', resolved: '2026-07-27-chidori20-maihama-clean-center-v1' },
  { key: '20-maihama-chidori-nishi', constName: 'NAMES_20_MAIHAMA_CHIDORI_NISHI', resolved: '2026-07-27-chidori20-maihama-chidori-nishi-v1' },
  { key: '20-chidori-loop', constName: 'NAMES_20_CHIDORI_LOOP', resolved: '2026-07-27-chidori20-chidori-loop-v1' },
  { key: '20-maihama-chidori-garage', constName: 'NAMES_20_MAIHAMA_CHIDORI_GARAGE', resolved: '2026-07-27-chidori20-maihama-chidori-garage-v1' },
  { key: '20-chidori-garage-maihama', constName: 'NAMES_20_CHIDORI_GARAGE_MAIHAMA', resolved: '2026-07-27-chidori20-chidori-garage-maihama-v1' },
  { key: '20-clean-center-maihama', constName: 'NAMES_20_CLEAN_CENTER_MAIHAMA', resolved: '2026-07-27-chidori20-clean-center-maihama-v1' },
  { key: '20-clean-center-maihama-via-saijo', constName: 'NAMES_20_CLEAN_CENTER_MAIHAMA_VIA_SAIJO', resolved: '2026-07-27-chidori20-clean-center-maihama-via-saijo-v1' },
];

const DEFAULT_SYSTEM = '20-maihama-clean-center';
const INDEX_PLATFORM_SYSTEMS = new Set(['20-chidori-loop', '20-maihama-chidori-garage', '20-chidori-garage-maihama']);

const SIBLING_RELATIONS = ['18396546', '18396547'];
const SIBLING_EXCLUSIVE_STOPS = [
  '新浦安駅', '新浦安駅北口', '若潮公園', '順天堂病院前',
  'サンコーポ東口', 'サンコーポ西口', '弁天第二',
  '見明川中学校前', '見明川住宅', '舞浜三丁目',
];
const SIBLING_GLOBALS = [
  'TAKASU_MINAMI_LINE', 'takasuMinamiLine', 'takasu-minami-',
  'WAKASHIO', 'wakashio', 'route-22',
];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function assertNoSiblingLeak(src, label) {
  const hits = SIBLING_GLOBALS.filter((n) => src.includes(n));
  if (hits.length) throw new Error(`${label}: sibling leak ${hits.join(', ')}`);
}

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'takasu-minami-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 千鳥線（系統番号20・route-20）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載。出発のりば凡例で【２０系統】に解決した便のみ採用。
// ★22系統（若潮通り線 / 22千鳥東）は新浦安方面。relation 18396546/18396547 は使用禁止。
// 7運行パターン：18351940 / loop18323972 composition / 13764790+stitch / 18323971 / 18351939。
// 停留所座標：OSM platform採用。循環・garage系統は byIndex platform。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-20';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'chidori-line-system-v1';
  const DISPLAY_CODE = '20';
  const INDEX_PLATFORM_SYSTEMS = new Set(${JSON.stringify([...INDEX_PLATFORM_SYSTEMS])});
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

  const namesRe = /const NAMES_19_TAKASU_SEASIDE = [\s\S]*?const DEFAULT_SYSTEM_KEY = '19-takasu-seaside';/;
  if (!namesRe.test(src)) throw new Error('FAILED to locate NAMES block');
  src = src.replace(namesRe, namesAndDefs.trimStart());

  const replacements = [
    [/TAKASU_MINAMI_LINE/g, 'CHIDORI_LINE'],
    [/takasuMinamiLine/g, 'chidoriLine'],
    [/TakasuMinami/g, 'ChidoriLine'],
    [/takasu-minami-19-/g, 'chidori-20-'],
    [/takasu-minami-/g, 'chidori-'],
    [/高洲南線/g, '千鳥線'],
    [/route-19/g, 'route-20'],
    [/route19StopEditor/g, 'route20StopEditor'],
    [/openRoute19StopEditor/g, 'openRoute20StopEditor'],
    [
      /function platformsForSystem\(systemKey\) \{\n    const bank = window\.CHIDORI_LINE_PLATFORMS_V1 \|\| \{\};\n    return bank\[systemKey\] \|\| \{\};\n  \}/,
      `function platformsForSystem(systemKey) {
    const bank = window.CHIDORI_LINE_PLATFORMS_V1 || {};
    return bank[systemKey] || {};
  }

  function platformForStop(definition, index, name) {
    const bank = platformsForSystem(definition.key);
    if (INDEX_PLATFORM_SYSTEMS.has(definition.key) && bank?.byIndex?.[index]) {
      return bank.byIndex[index];
    }
    return bank[name] || null;
  }`,
    ],
    [
      /const platform = platformsForSystem\(definition\.key\)\[name\] \|\| null;/,
      'const platform = platformForStop(definition, index, name);',
    ],
    [
      /const platform = platforms\[name\];/,
      'const platform = INDEX_PLATFORM_SYSTEMS.has(definition.key) ? platformForStop(definition, index, name) : platforms[name];',
    ],
    [
      /route\.description = '[^']*'/,
      "route.description = '千鳥線：7運行パターン（公式系統番号はいずれも20。22系統・若潮通り線は除外）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりば凡例で【２０系統】を判定し22系統を除外）。座標・道路はOSM relation採用。'",
    ],
    [
      /if \(!route\.takasuMinamiLineStopImages\)/,
      'if (!route.chidoriLineStopImages)',
    ],
    [/route\.takasuMinamiLineStopImages/g, 'route.chidoriLineStopImages'],
    [/route\.takasuMinamiLineVersion/g, 'route.chidoriLineVersion'],
    [
      /const order = \['19-takasu-seaside', '19-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
    [
      /if \(definition\.directionGroup === 'inbound' \|\| definition\.directionGroup === 'inbound-school' \|\| definition\.directionGroup === 'inbound-short'\)/,
      "if (definition.directionGroup === 'inbound' || definition.directionGroup === 'inbound-school' || definition.directionGroup === 'inbound-short' || definition.directionGroup === 'branch')",
    ],
    [
      /高洲南線の走行データを確認できません/,
      '千鳥線の走行データを確認できません',
    ],
    [
      /高洲南線の系統データがありません/,
      '千鳥線の系統データがありません',
    ],
    [
      /throw new Error\('高洲南線の系統データがありません。'\);/,
      "throw new Error('千鳥線の系統データがありません。');",
    ],
    [
      /function migrateStopId\(definition, stop, index\) \{\n    const newId = `chidori-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}`;/,
      `function migrateStopId(definition, stop, index) {
    const newId = \`chidori-\${definition.key}-\${String(index + 1).padStart(2, '0')}\`;`,
    ],
    [
      /if \(!stop\.id \|\| \/\^chidori-19-/.test(src) ? null : undefined,
    ].filter(Boolean),
  ].filter(Boolean);

  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  src = src.replace(
    /if \(!stop\.id \|\| \/\^chidori-19-/,
    "if (!stop.id || /^chidori-20-/",
  );

  const leftover = ['NAMES_19_', '19-takasu-seaside', '19-shinurayasu', 'TAKASU_MINAMI', 'takasuMinami', 'route-19', '高洲南線'].filter((n) => src.includes(n));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  assertNoSiblingLeak(src, 'route module');
  fs.writeFileSync(path.join(ROOT, 'chidori-line-route-v1.js'), src, 'utf8');
  console.log('wrote chidori-line-route-v1.js', src.length);
}

function buildPathPolicy() {
  const minPoints = {};
  for (const s of SYSTEMS) {
    const n = BUILD.systems[s.key]?.pathPoints;
    if (!n) throw new Error(`missing pathPoints for ${s.key}`);
    minPoints[s.key] = Math.max(50, Math.floor(n * 0.85));
  }
  const js = `// 千鳥線（route-20）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '${VERSION}-path';
  const MIN_PATH_POINTS_BY_SYSTEM = ${JSON.stringify(minPoints, null, 2).replace(/\n/g, '\n  ')};
  const MAX_GAP_M = 30;
  const MAX_IDENTICAL_RUN = 5;
  const LAT_MIN = 35.60;
  const LAT_MAX = 35.65;
  const LNG_MIN = 139.87;
  const LNG_MAX = 139.91;

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
        if (identicalRun >= MAX_IDENTICAL_RUN) reasons.push(\`同一点の異常連続（index=\${index}）\`);
      } else identicalRun = 1;
    });
    if (maxGapM > MAX_GAP_M) reasons.push(\`maxGap超過（\${maxGapM.toFixed(1)}m > \${MAX_GAP_M}m）\`);
    return { ok: reasons.length === 0, reasons, maxGapM: Math.round(maxGapM * 10) / 10, pointCount: (path || []).length, policyVersion: POLICY_VERSION };
  }

  window.CHIDORI_LINE_PATH_POLICY_V1 = { version: POLICY_VERSION, minPathPointsBySystem: MIN_PATH_POINTS_BY_SYSTEM, maxGapM: MAX_GAP_M, validateRuntimePath };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'chidori-line-path-policy-v1.js'), js, 'utf8');
  console.log('wrote chidori-line-path-policy-v1.js');
}

function buildStopImages() {
  const js = `// 千鳥線（route-20）停留所画像バンク。
(() => {
  window.CHIDORI_LINE_STOP_IMAGES_V1 = window.CHIDORI_LINE_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`;
  const css = `/* 千鳥線（route-20）停留所画像 */\n`;
  fs.writeFileSync(path.join(ROOT, 'chidori-line-stop-images-v1.js'), js, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'chidori-line-stop-images-v1.css'), css, 'utf8');
  console.log('wrote stop-images js/css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
