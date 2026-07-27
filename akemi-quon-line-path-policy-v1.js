// 明海クオン線（route-38）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '2026-07-27-akemi-quon-line-v1-path';
  const MIN_PATH_POINTS_BY_SYSTEM = { '38-shinurayasu-quon-express': 158 };
  const EXPECTED_PATH_HASHES = { '38-shinurayasu-quon-express': 'd6f46758734663e6e69ca28ccef2efdc70b1ebdaa6a1bad7176c9e86981e20f9' };
  const EXPRESS_PASS_LOCATIONS = ["海風の街"];
  const MAX_GAP_M = 30;
  const MAX_IDENTICAL_RUN = 5;
  const LAT_MIN = 35.60;
  const LAT_MAX = 35.70;
  const LNG_MIN = 139.86;
  const LNG_MAX = 139.96;

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
    const expHash = expectedPathHash || EXPECTED_PATH_HASHES[systemKey];
    if (!expHash) reasons.push('期待pathHash不在');
    else if (!pathHash) reasons.push('pathHash未計算');
    else if (pathHash !== expHash) reasons.push('pathHash不一致');
    if (!Array.isArray(path) || path.length < minPoints) reasons.push(`path点数不足（最低${minPoints}）`);
    let maxGapM = 0;
    (path || []).forEach((point, index) => {
      if (!point || point.lat == null || point.lng == null) reasons.push(`座標null（index=${index}）`);
      if (index === 0) return;
      maxGapM = Math.max(maxGapM, distanceMeters(path[index - 1], point));
    });
    if (maxGapM > MAX_GAP_M) reasons.push(`最大ギャップ ${maxGapM.toFixed(1)}m > ${MAX_GAP_M}m`);
    return { ok: reasons.length === 0, reasons, maxGapM };
  }

  function validateExpressStops(stopNames) {
    const hits = (stopNames || []).filter((n) => EXPRESS_PASS_LOCATIONS.includes(n));
    return { ok: hits.length === 0, hits };
  }

  window.AKEMI_QUON_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    expressPassLocations: EXPRESS_PASS_LOCATIONS,
    minPathPointsFor,
    validateRuntimePath,
    validateExpressStops,
  };
})();
