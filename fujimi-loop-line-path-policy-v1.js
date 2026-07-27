// 富士見循環線（route-24）道路形状ポリシー — generated module companion.
(() => {
  const POLICY_VERSION = '2026-07-27-fujimi-loop-line-v1-path';
  const MIN_PATH_POINTS_BY_SYSTEM = { '24-fujimi-loop': 594 };
  const EXPECTED_PATH_HASHES = { '24-fujimi-loop': '21a4cd16daf0c9b5a4452b15709199b7b34f413ec3d577abb30132a96a9ea4f4' };
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
      '24-fujimi-loop': {
        pathSource: 'osm-r18323926-prefix-composition+dijkstra-highway-middle+r9-fujimi-slice-return',
        relationId: null,
        compositionRelation: 18323926,
        maxGap_m: 24.8,
        maxPlatformDist_m: 11.9,
        loopPolicy: 'one_lap_then_terminal',
      },
    },
  };
})();
