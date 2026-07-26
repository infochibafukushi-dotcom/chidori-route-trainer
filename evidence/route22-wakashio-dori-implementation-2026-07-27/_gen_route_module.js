'use strict';
/**
 * Generate route-22 若潮通り線 modules from takasu-minami-line pattern.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-wakashio-dori-line-22-v1';
const EVIDENCE_DIR = 'evidence/route22-wakashio-dori-implementation-2026-07-27';

const SYSTEMS = [
  { key: '22-shinurayasu-chidori-garage', constName: 'NAMES_22_SHINURAYASU_CHIDORI_GARAGE', resolved: '2026-07-27-wakashio22-shinurayasu-chidori-garage-v1' },
  { key: '22-chidori-garage-shinurayasu', constName: 'NAMES_22_CHIDORI_GARAGE_SHINURAYASU', resolved: '2026-07-27-wakashio22-chidori-garage-shinurayasu-v1' },
];

const DEFAULT_SYSTEM = '22-shinurayasu-chidori-garage';
const INDEX_PLATFORM_SYSTEMS = new Set(['22-shinurayasu-chidori-garage', '22-chidori-garage-shinurayasu']);

const SIBLING_RELATIONS = ['13764790', '18323971', '18323972', '18351939', '18351940'];
const SIBLING_EXCLUSIVE_STOPS = ['舞浜駅', 'オリエンタルランド本社前', 'クリーンセンター', '浦安斎場', '千鳥西', '千鳥中央'];
const SIBLING_GLOBALS = ['CHIDORI_LINE', 'chidoriLine', 'chidori-line-', 'route-20', 'TAKASU_MINAMI'];

const indentJson = (value) => JSON.stringify(value, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

function assertNoSiblingLeak(src, label) {
  const hits = SIBLING_GLOBALS.filter((n) => src.includes(n));
  if (hits.length) throw new Error(`${label}: sibling leak ${hits.join(', ')}`);
}

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'takasu-minami-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 若潮通り線（系統番号22・route-22 / 表示22千鳥東）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表で確認（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載。出発のりば凡例で【２２系統】に解決した便のみ採用。
// ★20系統（千鳥線 / 舞浜方面）relation 13764790/18323971/18323972/18351939/18351940 は使用禁止。
// 2運行パターン：18396547 outbound / 18396546 inbound。app route.name=data.js「若潮通り線」。
// 停留所座標：OSM platform採用。千鳥車庫重複は byIndex platform。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-22';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
${SYSTEMS.map((s) => `    '${s.key}': '${s.resolved}',`).join('\n')}
  };
  const SYSTEM_KEY = 'wakashio-dori-line-22-system-v1';
  const DISPLAY_CODE = '22千鳥東';
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
    [/TAKASU_MINAMI_LINE/g, 'WAKASHIO_DORI_LINE_22'],
    [/takasuMinamiLine/g, 'wakashioDoriLine22'],
    [/TakasuMinami/g, 'WakashioDoriLine22'],
    [/takasu-minami-19-/g, 'wakashio-22-'],
    [/takasu-minami-/g, 'wakashio-22-'],
    [/chidori-takasu-minami-line-system-v1/g, 'wakashio-dori-line-22-system-v1'],
    [/高洲南線/g, '若潮通り線'],
    [/route-19/g, 'route-22'],
    [/19-takasu-seaside/g, '22-shinurayasu-chidori-garage'],
    [/19-shinurayasu/g, '22-chidori-garage-shinurayasu'],
    [/route19StopEditor/g, 'route22StopEditor'],
    [/openRoute19StopEditor/g, 'openRoute22StopEditor'],
    [
      /function platformsForSystem\(systemKey\) \{\n    const bank = window\.WAKASHIO_DORI_LINE_22_PLATFORMS_V1 \|\| \{\};\n    return bank\[systemKey\] \|\| \{\};\n  \}/,
      `function platformsForSystem(systemKey) {
    const bank = window.WAKASHIO_DORI_LINE_22_PLATFORMS_V1 || {};
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
      "route.description = '若潮通り線：2運行パターン（公式表示22千鳥東。20系統・千鳥線は除外）'",
    ],
    [
      /route\.sourcePolicy = '[^']*'/,
      "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表で確認（出発のりば凡例で【２２系統】を判定し20系統を除外）。座標・道路はOSM relation 18396546/18396547 採用。'",
    ],
    [
      /if \(!route\.takasuMinamiLineStopImages\)/,
      'if (!route.wakashioDoriLine22StopImages)',
    ],
    [/route\.takasuMinamiLineStopImages/g, 'route.wakashioDoriLine22StopImages'],
    [/route\.takasuMinamiLineVersion/g, 'route.wakashioDoriLine22Version'],
    [
      /const order = \['19-takasu-seaside', '19-shinurayasu'\];/,
      `const order = [${SYSTEMS.map((s) => `'${s.key}'`).join(', ')}];`,
    ],
    [
      /if \(definition\.directionGroup === 'inbound' \|\| definition\.directionGroup === 'inbound-school' \|\| definition\.directionGroup === 'inbound-short'\)/,
      "if (definition.directionGroup === 'inbound' || definition.directionGroup === 'inbound-school' || definition.directionGroup === 'inbound-short' || definition.directionGroup === 'branch')",
    ],
    [
      /若潮通り線の走行データを確認できません/,
      '若潮通り線の走行データを確認できません',
    ],
    [
      /若潮通り線の系統データがありません/,
      '若潮通り線の系統データがありません',
    ],
    [
      /throw new Error\('若潮通り線の系統データがありません。'\);/,
      "throw new Error('若潮通り線の系統データがありません。');",
    ],
    [
      /function migrateStopId\(definition, stop, index\) \{\n    const newId = `wakashio-22-\$\{definition\.key\}-\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}`;/,
      `function migrateStopId(definition, stop, index) {
    const newId = \`wakashio-22-\${definition.key}-\${String(index + 1).padStart(2, '0')}\`;`,
    ],
    [
      /if \(!stop\.id \|\| \/\^wakashio-22-19-/.test(src) ? null : undefined,
    ].filter(Boolean),
  ].filter(Boolean);

  for (const [pattern, replacement] of replacements) src = src.replace(pattern, replacement);

  src = src.replace(
    /if \(!stop\.id \|\| \/\^takasu-minami-19-/,
    "if (!stop.id || /^wakashio-22-/",
  );

  const leftover = ['NAMES_19_', '19-takasu-seaside', '19-shinurayasu', 'TAKASU_MINAMI', 'takasuMinami', 'route-19', '高洲南線', 'CHIDORI_LINE', 'chidoriLine'].filter((n) => src.includes(n));
  if (leftover.length) throw new Error(`LEFTOVER ${leftover.join(', ')}`);

  assertNoSiblingLeak(src, 'route module');
  fs.writeFileSync(path.join(ROOT, 'wakashio-dori-line-22-route-v1.js'), src, 'utf8');
  console.log('wrote wakashio-dori-line-22-route-v1.js', src.length);
}

function buildPathPolicy() {
  const minPoints = {};
  for (const s of SYSTEMS) {
    const n = BUILD.systems[s.key]?.pathPoints;
    if (!n) throw new Error(`missing pathPoints for ${s.key}`);
    minPoints[s.key] = Math.max(50, Math.floor(n * 0.85));
  }
  const js = `// 若潮通り線（route-22）道路形状ポリシー。
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
        if (identicalRun >= MAX_IDENTICAL_RUN) reasons.push(\`同一点の異常連続（index=\${index}）\`);
      } else identicalRun = 1;
    });
    if (maxGapM > MAX_GAP_M) reasons.push(\`maxGap超過（\${maxGapM.toFixed(1)}m > \${MAX_GAP_M}m）\`);
    return { ok: reasons.length === 0, reasons, maxGapM: Math.round(maxGapM * 10) / 10, pointCount: (path || []).length, policyVersion: POLICY_VERSION };
  }

  window.WAKASHIO_DORI_LINE_22_PATH_POLICY_V1 = { version: POLICY_VERSION, minPathPointsBySystem: MIN_PATH_POINTS_BY_SYSTEM, maxGapM: MAX_GAP_M, validateRuntimePath };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'wakashio-dori-line-22-path-policy-v1.js'), js, 'utf8');
  console.log('wrote wakashio-dori-line-22-path-policy-v1.js');
}

function buildStopImages() {
  const js = `// 若潮通り線（route-22）停留所画像バンク。
(() => {
  window.WAKASHIO_DORI_LINE_22_STOP_IMAGES_V1 = window.WAKASHIO_DORI_LINE_22_STOP_IMAGES_V1 || {
    version: '${VERSION}-stop-images',
    images: {},
  };
})();
`;
  const css = `/* 若潮通り線（route-22）停留所画像 */\n`;
  fs.writeFileSync(path.join(ROOT, 'wakashio-dori-line-22-stop-images-v1.js'), js, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'wakashio-dori-line-22-stop-images-v1.css'), css, 'utf8');
  console.log('wrote stop-images js/css');
}

buildRouteModule();
buildPathPolicy();
buildStopImages();
console.log('done');
