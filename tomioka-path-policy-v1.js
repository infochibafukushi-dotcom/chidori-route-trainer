// 富岡線（route-4）の道路形状ポリシーと本番ブラウザ検証。
// 停留所順：京成バスナビ通過時刻表で確認済み。
// 座標・道路：OSM relation採用（要走行確認）。
// path形状・停留所順・pathHashの確定値は変更しない（検証のみ）。
(() => {
  const POLICY_VERSION = '2026-07-24-tomioka-path-v1';
  const MIN_PATH_POINTS = 100;
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

  /**
   * 本番ブラウザ向け path 検証。
   * @returns {{ ok: boolean, reasons: string[], maxGapM: number|null }}
   */
  function validateRuntimePath({
    systemKey,
    path,
    pathHash,
    expectedPathHash,
    resolvedVersion,
    expectedResolvedVersion,
    directionGroup,
    pathSource,
  }) {
    const reasons = [];
    if (!systemKey) reasons.push('systemKey不在');
    if (!directionGroup) reasons.push('directionGroup不在');
    if (!pathSource) reasons.push('pathSource不在');

    if (!expectedResolvedVersion) {
      reasons.push('expectedResolvedVersion不在');
    } else if (resolvedVersion !== expectedResolvedVersion) {
      reasons.push('resolvedVersion不一致');
    }

    if (!expectedPathHash) {
      reasons.push('期待pathHash不在');
    } else if (!pathHash) {
      reasons.push('pathHash未計算');
    } else if (pathHash !== expectedPathHash) {
      reasons.push('pathHash不一致');
    }

    if (!Array.isArray(path) || path.length < MIN_PATH_POINTS) {
      reasons.push(`path点数不足（最低${MIN_PATH_POINTS}）`);
    }

    let maxGapM = 0;
    let identicalRun = 1;
    (path || []).forEach((point, index) => {
      if (!point || point.lat == null || point.lng == null) {
        reasons.push(`座標null（index=${index}）`);
        return;
      }
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reasons.push(`座標NaN（index=${index}）`);
        return;
      }
      if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
        reasons.push(`緯度経度範囲外（index=${index}）`);
      }
      if (index === 0) return;
      const prev = path[index - 1];
      const gap = distanceMeters(
        { lat: Number(prev.lat), lng: Number(prev.lng) },
        { lat, lng },
      );
      if (Number.isFinite(gap) && gap > maxGapM) maxGapM = gap;
      if (
        Number(prev.lat) === lat
        && Number(prev.lng) === lng
      ) {
        identicalRun += 1;
        if (identicalRun >= MAX_IDENTICAL_RUN) {
          reasons.push(`同一点の異常連続（index=${index}）`);
        }
      } else {
        identicalRun = 1;
      }
    });

    if (maxGapM > MAX_GAP_M) {
      reasons.push(`maxGap超過（${maxGapM.toFixed(1)}m > ${MAX_GAP_M}m）`);
    }

    return {
      ok: reasons.length === 0,
      reasons: [...new Set(reasons)],
      maxGapM: Math.round(maxGapM * 10) / 10,
      minPathPoints: MIN_PATH_POINTS,
      maxGapLimitM: MAX_GAP_M,
    };
  }

  function formatInvalidMessage(systemKey, reasons) {
    const reason = (reasons && reasons[0]) || '検証失敗';
    return [
      '富岡線の走行データを確認できません。',
      `系統：${systemKey || '(不明)'}`,
      `理由：${reason}`,
    ].join('\n');
  }

  window.TOMIOKA_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    routeSource: 'OSM route relation採用（系統キー単位・要走行確認）',
    osmUsage: '停留所座標・道路形状に使用。Google Directionsは使用しない。',
    stopOrderStatus: '京成バスナビ通過時刻表で確認済み',
    streetViewStatus: '未完了（要走行確認）',
    MIN_PATH_POINTS,
    MAX_GAP_M,
    validateRuntimePath,
    formatInvalidMessage,
  };
})();
