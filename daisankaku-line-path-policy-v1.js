// 大三角線（route-37）道路形状ポリシー。
(() => {
  const POLICY_VERSION = '2026-07-27-daisankaku-line-v1-path';
  const MIN_PATH_POINTS_BY_SYSTEM = {
  "37-minamigyotoku-tds": 360,
  "37-minamigyotoku-maihama": 309,
  "37-tds-minamigyotoku": 402,
  "37-maihama-minamigyotoku": 304,
  "37-tds-horie6": 256,
  "37-fujimi3-tds": 186,
  "37-horie6-tds": 230
};
  const EXPECTED_PATH_HASHES = {
  "37-minamigyotoku-tds": "592739d8b9f0de243342809f14d27dcd86a3b5817e705f743b8b06468e5632cb",
  "37-minamigyotoku-maihama": "861e8d0c8d8d2c1e1e27604ff2c159a05a6713c44abe364b5ea2f192c8ad78ce",
  "37-tds-minamigyotoku": "41afca484745b91235d0fe30414325ad4b18e3b00192bb1ea341d517a1148620",
  "37-maihama-minamigyotoku": "71ce472cf6c98a3d3ac3789eb0cb4287c2e51eb069897591be85e42d706fc1c4",
  "37-tds-horie6": "cad267be04a92a3dc5cd532abf2d17f28c71e64e7408c83045e1a03a6cd7b0f8",
  "37-fujimi3-tds": "361a0e93677885e94262fac6c7da74445c6eaea025512805543dfa23222174ee",
  "37-horie6-tds": "e4c19cec8f9df94c9d0fc752d99b583e5283d043dc9ca090e606bbedd5523fbb"
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
    return MIN_PATH_POINTS_BY_SYSTEM[systemKey] || 80;
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

  window.DAISANKAKU_LINE_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    minPathPointsFor,
    validateRuntimePath,
  };
})();
