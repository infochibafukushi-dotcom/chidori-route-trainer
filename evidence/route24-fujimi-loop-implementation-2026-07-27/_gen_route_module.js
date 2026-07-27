'use strict';
/** Generate route-24 富士見循環線 modules from chidori-line-route-v1.js loop template. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const VERSION = '2026-07-27-fujimi-loop-line-v1';
const EVIDENCE_DIR = 'evidence/route24-fujimi-loop-implementation-2026-07-27';
const SYSTEM_KEY = '24-fujimi-loop';
const STOP_NAMES = ORDERS.systems[SYSTEM_KEY].stopNames;

function buildRouteModule() {
  let src = fs.readFileSync(path.join(ROOT, 'chidori-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

  const header = `// 富士見循環線（系統番号24・route-24）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ個別便通過時刻表 course 0008200304 berth 24（${EVIDENCE_DIR}/official-stop-orders.json）。
// ★新浦安駅のりば24 + 凡例「富士見…【２４系統】」。38 trips / 1 signature / reverse なし。
// ★1周で終点（新浦安駅 index23）。無限循環なし。
// 道路：prefix/suffix OSM relation 18323926 + middle Dijkstra highway ways。
// 停留所座標：OSM platform byIndex（同名停留所は訪問ごとに別 node）。
// Google Directionsは使用しない。
(() => {
  const ROUTE_ID = 'route-24';
  const VERSION = '${VERSION}';
  const SYSTEM_RESOLVED_VERSIONS = {
    '24-fujimi-loop': '${BUILD.resolvedVersion}',
  };
  const SYSTEM_KEY = 'fujimi-loop-line-system-v1';
  const DISPLAY_CODE = '24';
  const INDEX_PLATFORM_SYSTEMS = new Set(['24-fujimi-loop']);
`;
  src = src.replace(/^\/\/[\s\S]*?const INDEX_PLATFORM_SYSTEMS = new Set\(\[[^\]]*\]\);/m, header.trimEnd());

  const namesBlock = `  const NAMES_24_FUJIMI_LOOP = ${JSON.stringify(STOP_NAMES, null, 2).split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n')};`;

  const defs = `  const SYSTEM_DEFINITIONS = {
    '${SYSTEM_KEY}': {
      key: '${SYSTEM_KEY}', displayCode: DISPLAY_CODE, directionGroup: 'loop',
      title: '${ORDERS.systems[SYSTEM_KEY].title}',
      summary: '${ORDERS.systems[SYSTEM_KEY].summary}',
      relationId: null,
      timetableSymbol: '${ORDERS.systems[SYSTEM_KEY].timetableSymbol}',
      naviCourse: '${ORDERS.systems[SYSTEM_KEY].course}',
      names: NAMES_24_FUJIMI_LOOP,
    },
  };

  const DEFAULT_SYSTEM_KEY = '${SYSTEM_KEY}';`;

  src = src.replace(
    /const NAMES_20_MAIHAMA_CLEAN_CENTER = [\s\S]*?const DEFAULT_SYSTEM_KEY = '20-maihama-clean-center';/,
    `${namesBlock}\n\n${defs}`,
  );

  const replacements = [
    [/CHIDORI_LINE/g, 'FUJIMI_LOOP_LINE'],
    [/chidoriLine/g, 'fujimiLoopLine'],
    [/ChidoriLine/g, 'FujimiLoopLine'],
    [/chidori-line-system-v1/g, 'fujimi-loop-line-system-v1'],
    [/chidori-20-/g, 'fujimi-24-'],
    [/`chidori-\$\{definition\.key\}/g, '`fujimi-24-${definition.key}'],
    [/千鳥線/g, '富士見循環線'],
    [/route-20/g, 'route-24'],
    [/20-maihama-clean-center/g, SYSTEM_KEY],
    [/20-maihama-chidori-nishi/g, SYSTEM_KEY],
    [/20-chidori-loop/g, SYSTEM_KEY],
    [/20-maihama-chidori-garage/g, SYSTEM_KEY],
    [/20-chidori-garage-maihama/g, SYSTEM_KEY],
    [/20-clean-center-maihama-via-saijo/g, SYSTEM_KEY],
    [/20-clean-center-maihama/g, SYSTEM_KEY],
    [/route20StopEditor/g, 'route24StopEditor'],
    [/openRoute20StopEditor/g, 'openRoute24StopEditor'],
    [/window\.CHIDORI_LINE_PLATFORMS_V1/g, 'window.FUJIMI_LOOP_LINE_PLATFORMS_V1'],
    [/window\.CHIDORI_LINE_PATH_V1/g, 'window.FUJIMI_LOOP_LINE_PATH_V1'],
    [/window\.CHIDORI_LINE_PATH_POLICY_V1/g, 'window.FUJIMI_LOOP_LINE_PATH_POLICY_V1'],
    [/route\.chidoriLineStopImages/g, 'route.fujimiLoopLineStopImages'],
    [/route\.chidoriLineVersion/g, 'route.fujimiLoopLineVersion'],
    [/if \(!route\.chidoriLineStopImages\)/g, 'if (!route.fujimiLoopLineStopImages)'],
    [/const order = \[[^\]]+\];/, `const order = ['${SYSTEM_KEY}'];`],
    [/route\.description = '[^']*'/, "route.description = '富士見循環線：新浦安駅発着1周循環（24系統・course 0008200304）'"],
    [/route\.sourcePolicy = '[^']*'/, "route.sourcePolicy = '停留所順は京成バスナビ個別便通過時刻表（のりば24・凡例【２４系統】）。座標・道路は OSM relation 18323926 + highway Dijkstra。'"],
    [/DISPLAY_CODE = '20'/, "DISPLAY_CODE = '24'"],
  ];
  for (const [from, to] of replacements) src = src.replace(from, to);

  src = src.replace(/if \(!stop\.id \|\| \/\^chidori-20-/, "if (!stop.id || /^fujimi-24-/");

  const leaks = ['CHIDORI', 'chidori-20', 'route-20', '千鳥', '20-maihama', '20-chidori', '20-clean', '18351940', '18323972', '13764790'].filter((n) => src.includes(n));
  if (leaks.length) throw new Error(`template leaks: ${leaks.join(', ')}`);
  if (!src.includes('function getSelectedSystemKey')) throw new Error('getSelectedSystemKey missing');
  if (src.includes("() => '${SYSTEM_KEY}'")) throw new Error('broken getSelectedSystemKey replacement');

  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-route-v1.js'), src, 'utf8');
  console.log('wrote fujimi-loop-line-route-v1.js', src.length);
}

function buildPathPolicy() {
  const minPts = Math.max(100, Math.floor(BUILD.pointCount * 0.85));
  const src = `// 富士見循環線（route-24）道路形状ポリシー — generated module companion.
(() => {
  const POLICY_VERSION = '${VERSION}-path';
  const MIN_PATH_POINTS_BY_SYSTEM = { '${SYSTEM_KEY}': ${minPts} };
  const EXPECTED_PATH_HASHES = { '${SYSTEM_KEY}': '${BUILD.pathHash}' };
  const MAX_GAP_M = 30;
  const MAX_IDENTICAL_RUN = 5;
  const LAT_MIN = 35.60;
  const LAT_MAX = 35.70;
  const LNG_MIN = 139.86;
  const LNG_MAX = 139.95;

  function validateSystemPath(systemKey, pathPoints) {
    const failures = [];
    if (!Array.isArray(pathPoints) || pathPoints.length < (MIN_PATH_POINTS_BY_SYSTEM[systemKey] || 100)) {
      failures.push('pathPoints too short');
    }
    const expected = EXPECTED_PATH_HASHES[systemKey];
    if (expected && window.FUJIMI_LOOP_LINE_PATH_V1?.[systemKey]?.pathHash !== expected) {
      failures.push('pathHash drift');
    }
    let maxGap = 0;
    for (let i = 1; i < pathPoints.length; i++) {
      const a = pathPoints[i - 1];
      const b = pathPoints[i];
      const R = 6371000;
      const toR = (d) => (d * Math.PI) / 180;
      const dLat = toR(b.lat - a.lat);
      const dLng = toR(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
      maxGap = Math.max(maxGap, 2 * R * Math.asin(Math.sqrt(h)));
    }
    if (maxGap > MAX_GAP_M) failures.push('maxGap ' + maxGap.toFixed(1) + 'm');
    return { ok: failures.length === 0, failures, maxGap_m: Math.round(maxGap * 10) / 10 };
  }

  window.FUJIMI_LOOP_LINE_PATH_POLICY_V1 = {
    routeId: 'route-24',
    version: POLICY_VERSION,
    MIN_PATH_POINTS_BY_SYSTEM,
    EXPECTED_PATH_HASHES,
    MAX_GAP_M,
    validateSystemPath,
    systems: {
      '${SYSTEM_KEY}': {
        pathSource: '${BUILD.pathSource}',
        relationId: null,
        compositionRelation: 18323926,
        maxGap_m: ${BUILD.maxGap_m},
        maxPlatformDist_m: ${BUILD.maxPlatformDist_m},
        loopPolicy: 'one_lap_then_terminal',
      },
    },
  };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'fujimi-loop-line-path-policy-v1.js'), src, 'utf8');
  console.log('wrote fujimi-loop-line-path-policy-v1.js');
}

buildRouteModule();
buildPathPolicy();
