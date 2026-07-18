(() => {
  const PATCH_FLAG = Symbol.for('chidori.noUturn.v17');
  const originalLoadMaps = loadMaps;

  const latLngLiteral = (value) => {
    if (!value) return null;
    if (typeof value.lat === 'function' && typeof value.lng === 'function') {
      return { lat: value.lat(), lng: value.lng() };
    }
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  const requestPoints = (request) => [
    request.origin,
    ...(request.waypoints || []).map((waypoint) => waypoint.location),
    request.destination,
  ].map(latLngLiteral).filter(Boolean);

  const isHokueiRequest = (request) => {
    const points = requestPoints(request);
    return points.length >= 2 && points.every((point) =>
      point.lat >= 35.63 && point.lat <= 35.69 && point.lng >= 139.87 && point.lng <= 139.93
    );
  };

  const stepText = (step) => {
    const node = document.createElement('div');
    node.innerHTML = step?.instructions || '';
    return node.textContent || '';
  };

  const isUTurnStep = (step) => {
    const maneuver = String(step?.maneuver || '').toLowerCase();
    const text = stepText(step);
    return maneuver.includes('uturn') || /uターン|Ｕターン|転回/.test(text);
  };

  const routeHasUTurn = (route) => (route?.legs || []).some((leg) =>
    (leg.steps || []).some(isUTurnStep)
  );

  const routeDistance = (route) => (route?.legs || []).reduce((total, leg) =>
    total + Number(leg.distance?.value || 0), 0
  );

  const routeDuration = (route) => (route?.legs || []).reduce((total, leg) =>
    total + Number(leg.duration?.value || 0), 0
  );

  const chooseNoUTurnRoute = (result) => {
    const candidates = (result?.routes || [])
      .filter((route) => !routeHasUTurn(route))
      .sort((a, b) => {
        const durationDifference = routeDuration(a) - routeDuration(b);
        return durationDifference || routeDistance(a) - routeDistance(b);
      });
    return candidates[0] || null;
  };

  const appendPath = (target, source = []) => {
    const path = [...source];
    if (target.length && path.length) path.shift();
    target.push(...path);
  };

  async function routeLegWithoutUTurn(service, originalRoute, request, origin, destination) {
    const alternativesRequest = {
      ...request,
      origin,
      destination,
      waypoints: [],
      optimizeWaypoints: false,
      provideRouteAlternatives: true,
    };
    const result = await originalRoute.call(service, alternativesRequest);
    const selected = chooseNoUTurnRoute(result);
    if (!selected) {
      throw new Error('Uターンを含まない道路ルートを取得できませんでした。停留所位置または経由点を確認してください。');
    }
    return { result, route: selected };
  }

  async function rebuildWithoutUTurn(service, originalRoute, request) {
    const points = [request.origin, ...(request.waypoints || []).map((waypoint) => waypoint.location), request.destination];
    const combinedLegs = [];
    const combinedPath = [];
    let templateResult = null;
    let templateRoute = null;

    for (let index = 0; index < points.length - 1; index += 1) {
      const segment = await routeLegWithoutUTurn(service, originalRoute, request, points[index], points[index + 1]);
      templateResult ||= segment.result;
      templateRoute ||= segment.route;
      combinedLegs.push(...(segment.route.legs || []));
      appendPath(combinedPath, segment.route.overview_path || []);
    }

    return {
      ...templateResult,
      routes: [{
        ...templateRoute,
        summary: `${templateRoute?.summary || '道路ルート'}（Uターン禁止）`,
        legs: combinedLegs,
        overview_path: combinedPath,
        warnings: [...(templateRoute?.warnings || []), 'Uターンを含む候補は除外しました。'],
      }],
    };
  }

  function patchDirections(googleApi) {
    const prototype = googleApi?.maps?.DirectionsService?.prototype;
    if (!prototype || prototype[PATCH_FLAG]) return;
    const originalRoute = prototype.route;

    prototype.route = function routeWithoutUTurn(request, callback) {
      if (typeof callback === 'function' || !isHokueiRequest(request)) {
        return originalRoute.call(this, request, callback);
      }

      return originalRoute.call(this, request).then(async (result) => {
        const primaryRoute = result?.routes?.[0];
        if (!primaryRoute || !routeHasUTurn(primaryRoute)) return result;
        console.info('Uターンを検出したため、Uターン禁止ルートを再検索します。');
        return rebuildWithoutUTurn(this, originalRoute, request);
      });
    };

    prototype[PATCH_FLAG] = true;
  }

  loadMaps = async function loadMapsWithoutUTurn() {
    const googleApi = await originalLoadMaps();
    patchDirections(googleApi);
    return googleApi;
  };

  const updateModeLabel = () => {
    const label = document.querySelector('.manual-mode-card span');
    if (label && !label.textContent.includes('Uターン禁止')) {
      label.textContent += '・Uターン禁止';
    }
  };

  new MutationObserver(updateModeLabel).observe(document.getElementById('app'), {
    childList: true,
    subtree: true,
  });
  updateModeLabel();
})();