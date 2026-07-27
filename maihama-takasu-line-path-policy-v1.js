// 舞浜・高洲線（route-25）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '2026-07-27-maihama-takasu-line-v1-path';
  const MIN_PATH_POINTS_BY_SYSTEM = {
  "25-maihama-takasu-seaside": 213,
  "25-takasu-seaside-maihama": 226,
  "25-maihama-sogo": 305,
  "25-sogo-maihama": 310
};
  const EXPECTED_PATH_HASHES = {
  "25-maihama-takasu-seaside": "44e37b0f298ab9f83fff19ed1c0bf346d006ba47c11cae79896148394dbbdd97",
  "25-takasu-seaside-maihama": "56d25ec149a1c2729bea49abfdfea2482c89260c93f62aab4c3d2b46a3006c04",
  "25-maihama-sogo": "216a9244c58566074e72d6f5c883a43ac554adfb2232327cf5e5a8ba746eeca3",
  "25-sogo-maihama": "f8fa0d50d46d5338f7f89aebfb8e97035d9181888723bbd32cd1110523dbfd00"
};
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

  window.MAIHAMA_TAKASU_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsFor,
    validateRuntimePath,
  };
})();
