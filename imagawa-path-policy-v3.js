(() => {
  const POLICY_VERSION = '2026-07-19-imagawa-path-v3e';
  const ROUTE_ID = 'route-2';
  const OSM_RELATION_PATHS = ['/route/18323695', '/route/9964872'];
  const nativeFetch = window.fetch.bind(window);

  // OSMは停留所座標の照合にだけ使う。
  // GeoJSONのLineStringは分割・順序不整合の可能性があるため、道路線には採用しない。
  window.fetch = async function fetchWithImagawaPathPolicy(input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const isImagawaRelation = OSM_RELATION_PATHS.some((path) => url.includes(path));
    if (!isImagawaRelation) return nativeFetch(input, init);

    const response = await nativeFetch(input, init);
    if (!response.ok) return response;

    try {
      const payload = await response.clone().json();
      if (payload?.geojson?.features && Array.isArray(payload.geojson.features)) {
        payload.geojson.features = payload.geojson.features.filter((feature) => {
          const type = feature?.geometry?.type;
          return type !== 'LineString' && type !== 'MultiLineString';
        });
      }
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    } catch (error) {
      console.warn('今川線のOSM道路形状除外に失敗しました。', error);
      return response;
    }
  };

  function invalidateOldPaths() {
    if (typeof data === 'undefined' || !Array.isArray(data?.routes)) return;
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route?.systems) return;
    let changed = route.imagawaPathPolicyVersion !== POLICY_VERSION;

    // 2-maihama の保存済み誤 path のみ無効化（画像・他系統・北栄線は触らない）
    const maihama = route.systems['2-maihama'];
    if (maihama && route.imagawaPathPolicyVersion !== POLICY_VERSION) {
      maihama.path = [];
      maihama.pathSource = null;
      maihama.resolvedVersion = null;
      maihama.verifiedAt = null;
      maihama.pathInvalid = false;
      maihama.pathIssues = null;
      changed = true;
    }

    Object.values(route.systems).forEach((system) => {
      if (system?.key === '2-maihama' || system?.code === '2-maihama') return;
      const usesOsmPath = String(system?.pathSource || '').includes('OpenStreetMap relation');
      if (!usesOsmPath) return;
      system.path = [];
      system.pathSource = null;
      system.resolvedVersion = null;
      system.verifiedAt = null;
      changed = true;
    });

    route.imagawaPathPolicyVersion = POLICY_VERSION;
    if (changed && typeof save === 'function') save();
  }

  invalidateOldPaths();
  setTimeout(invalidateOldPaths, 200);
  setTimeout(invalidateOldPaths, 1200);

  window.IMAGAWA_PATH_POLICY_V3 = {
    version: POLICY_VERSION,
    routeSource: 'Google Maps（公式停留所順）',
    osmUsage: '停留所座標の照合のみ',
  };
})();
