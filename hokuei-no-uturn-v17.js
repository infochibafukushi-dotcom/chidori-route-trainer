(() => {
  const PATCH_FLAG = Symbol.for('chidori.noUturn.v18');
  const originalLoadMaps = loadMaps;
  const REVERSAL_ANGLE = 145;
  const PATH_REVERSAL_ANGLE = 165;
  const CONTINUITY_ANGLE = 125;

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
    // 今川線には北栄線用Uターン禁止補正を適用しない
    if (typeof routeState !== 'undefined' && routeState?.routeId === 'route-2') return false;
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

  const bearing = (startValue, endValue) => {
    const start = latLngLiteral(startValue);
    const end = latLngLiteral(endValue);
    if (!start || !end) return null;
    const rad = (value) => value * Math.PI / 180;
    const lat1 = rad(start.lat);
    const lat2 = rad(end.lat);
    const deltaLng = rad(end.lng - start.lng);
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };

  const distanceMeters = (startValue, endValue) => {
    const start = latLngLiteral(startValue);
    const end = latLngLiteral(endValue);
    if (!start || !end) return 0;
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(end.lat - start.lat);
    const dLng = rad(end.lng - start.lng);
    const lat1 = rad(start.lat);
    const lat2 = rad(end.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const angleDifference = (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    const difference = Math.abs(a - b) % 360;
    return difference > 180 ? 360 - difference : difference;
  };

  const stepBearing = (step) => bearing(step?.start_location, step?.end_location);

  const routeSteps = (route) => (route?.legs || []).flatMap((leg) => leg.steps || []);

  const routeInitialBearing = (route) => {
    for (const step of routeSteps(route)) {
      const value = stepBearing(step);
      if (Number.isFinite(value) && Number(step?.distance?.value || 0) >= 4) return value;
    }
    return null;
  };

  const routeFinalBearing = (route) => {
    const steps = routeSteps(route);
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const value = stepBearing(steps[index]);
      if (Number.isFinite(value) && Number(steps[index]?.distance?.value || 0) >= 4) return value;
    }
    return null;
  };

  const legHasGeometricReversal = (leg) => {
    const steps = leg?.steps || [];
    for (let index = 1; index < steps.length; index += 1) {
      const previousBearing = stepBearing(steps[index - 1]);
      const currentBearing = stepBearing(steps[index]);
      if (angleDifference(previousBearing, currentBearing) >= REVERSAL_ANGLE) return true;
    }
    return false;
  };

  const routeHasLegBoundaryReversal = (route) => {
    const legs = route?.legs || [];
    for (let index = 1; index < legs.length; index += 1) {
      const previousSteps = legs[index - 1]?.steps || [];
      const currentSteps = legs[index]?.steps || [];
      const previousBearing = stepBearing(previousSteps.at(-1));
      const currentBearing = stepBearing(currentSteps[0]);
      if (angleDifference(previousBearing, currentBearing) >= REVERSAL_ANGLE) return true;
    }
    return false;
  };

  const routeHasPathReversal = (route) => {
    const points = route?.overview_path || [];
    let previousBearing = null;
    for (let index = 1; index < points.length; index += 1) {
      if (distanceMeters(points[index - 1], points[index]) < 7) continue;
      const currentBearing = bearing(points[index - 1], points[index]);
      if (Number.isFinite(previousBearing) && angleDifference(previousBearing, currentBearing) >= PATH_REVERSAL_ANGLE) {
        return true;
      }
      previousBearing = currentBearing;
    }
    return false;
  };

  const routeHasUTurn = (route) =>
    routeSteps(route).some(isUTurnStep) ||
    (route?.legs || []).some(legHasGeometricReversal) ||
    routeHasLegBoundaryReversal(route) ||
    routeHasPathReversal(route);

  const routeDistance = (route) => (route?.legs || []).reduce((total, leg) =>
    total + Number(leg.distance?.value || 0), 0
  );

  const routeDuration = (route) => (route?.legs || []).reduce((total, leg) =>
    total + Number(leg.duration?.value || 0), 0
  );

  const leftTurnCount = (route) => routeSteps(route).filter((step) => {
    const maneuver = String(step?.maneuver || '').toLowerCase();
    return maneuver.includes('left') || /左折|左方向/.test(stepText(step));
  }).length;

  const chooseNoUTurnRoute = (result, incomingBearing = null) => {
    const candidates = (result?.routes || []).filter((route) => {
      if (routeHasUTurn(route)) return false;
      if (!Number.isFinite(incomingBearing)) return true;
      return angleDifference(incomingBearing, routeInitialBearing(route)) < CONTINUITY_ANGLE;
    });
    const leftLoopCandidates = candidates.filter((route) => leftTurnCount(route) >= 2);
    const pool = leftLoopCandidates.length ? leftLoopCandidates : candidates;
    return pool.sort((a, b) => {
      const durationDifference = routeDuration(a) - routeDuration(b);
      return durationDifference || routeDistance(a) - routeDistance(b);
    })[0] || null;
  };

  const appendPath = (target, source = []) => {
    const path = [...source];
    if (target.length && path.length) path.shift();
    target.push(...path);
  };

  const offsetPoint = (startValue, direction, meters) => {
    const start = latLngLiteral(startValue);
    if (!start) return null;
    const radius = 6378137;
    const angularDistance = meters / radius;
    const bearingRad = direction * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lng1 = start.lng * Math.PI / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
  };

  async function tryShapedLeftLoop(service, originalRoute, request, origin, destination, incomingBearing) {
    if (!Number.isFinite(incomingBearing)) return null;
    const originPoint = latLngLiteral(origin);
    if (!originPoint) return null;

    const distances = [55, 80, 110];
    for (const distance of distances) {
      const ahead = offsetPoint(originPoint, incomingBearing, distance);
      const firstLeft = offsetPoint(ahead, (incomingBearing + 270) % 360, distance);
      const secondLeft = offsetPoint(firstLeft, (incomingBearing + 180) % 360, distance * 0.75);
      const patterns = [
        [ahead],
        [ahead, firstLeft],
        [ahead, firstLeft, secondLeft],
      ];
      for (const pattern of patterns) {
        const shapedRequest = {
          ...request,
          origin,
          destination,
          waypoints: pattern.filter(Boolean).map((point) => ({ location: point, stopover: false })),
          optimizeWaypoints: false,
          provideRouteAlternatives: false,
        };
        try {
          const result = await originalRoute.call(service, shapedRequest);
          const selected = chooseNoUTurnRoute(result, incomingBearing);
          if (selected && leftTurnCount(selected) >= 2) return { result, route: selected };
        } catch (error) {
          console.debug('左折ループ候補を取得できませんでした。', error);
        }
      }
    }
    return null;
  }

  async function routeLegWithoutUTurn(service, originalRoute, request, origin, destination, incomingBearing) {
    const alternativesRequest = {
      ...request,
      origin,
      destination,
      waypoints: [],
      optimizeWaypoints: false,
      provideRouteAlternatives: true,
    };
    const result = await originalRoute.call(service, alternativesRequest);
    const selected = chooseNoUTurnRoute(result, incomingBearing);
    if (selected) return { result, route: selected };

    const shaped = await tryShapedLeftLoop(service, originalRoute, request, origin, destination, incomingBearing);
    if (shaped) return shaped;

    throw new Error('Uターンを含まない道路ルートを取得できませんでした。停留所位置または経由点を確認してください。');
  }

  async function rebuildWithoutUTurn(service, originalRoute, request) {
    const points = [request.origin, ...(request.waypoints || []).map((waypoint) => waypoint.location), request.destination];
    const combinedLegs = [];
    const combinedPath = [];
    let templateResult = null;
    let templateRoute = null;
    let incomingBearing = null;

    for (let index = 0; index < points.length - 1; index += 1) {
      const segment = await routeLegWithoutUTurn(
        service,
        originalRoute,
        request,
        points[index],
        points[index + 1],
        incomingBearing,
      );
      templateResult ||= segment.result;
      templateRoute ||= segment.route;
      combinedLegs.push(...(segment.route.legs || []));
      appendPath(combinedPath, segment.route.overview_path || []);
      incomingBearing = routeFinalBearing(segment.route);
    }

    return {
      ...templateResult,
      routes: [{
        ...templateRoute,
        summary: `${templateRoute?.summary || '道路ルート'}（Uターン禁止・連続進行）`,
        legs: combinedLegs,
        overview_path: combinedPath,
        warnings: [...(templateRoute?.warnings || []), '停留所は通過経由点として扱い、Uターンと急な反転を除外しました。'],
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

      const continuousRequest = {
        ...request,
        waypoints: (request.waypoints || []).map((waypoint) => ({
          ...waypoint,
          stopover: false,
        })),
        optimizeWaypoints: false,
      };

      return originalRoute.call(this, continuousRequest).then(async (result) => {
        const primaryRoute = result?.routes?.[0];
        if (primaryRoute && !routeHasUTurn(primaryRoute)) return result;
        console.info('停留所での折返しを検出したため、進行方向を維持する左折ループへ再検索します。');
        return rebuildWithoutUTurn(this, originalRoute, continuousRequest);
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
    // 北栄線の案内文言は route-1 のときだけ追記する（今川線DOMへ漏れない）
    if (typeof routeState !== 'undefined' && routeState?.routeId !== 'route-1') return;
    const label = document.querySelector('.manual-mode-card span');
    if (label && !label.textContent.includes('停留所で折返し禁止')) {
      label.textContent += '・停留所で折返し禁止・連続進行・左折ループ優先';
    }
  };

  new MutationObserver(updateModeLabel).observe(document.getElementById('app'), {
    childList: true,
    subtree: true,
  });
  updateModeLabel();
})();