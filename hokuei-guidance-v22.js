(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const PANO_READY_TIMEOUT_MS = 2500;
  const TURN_NOTICE_METERS = 250;
  const MAP_ZOOM = 19;
  const MAX_STOPS_PER_REQUEST = 8;
  const previousRoutes = routes;
  let cleanup = null;
  let renderToken = 0;

  const selectedCode = () => {
    const code = localStorage.getItem(SYSTEM_KEY) || '1-1';
    return code === '1-5' ? '1' : code;
  };
  const setSelectedCode = (code) => localStorage.setItem(SYSTEM_KEY, code === '1-5' ? '1' : code);
  const validPosition = (stop) => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng);
  const displayName = (stop) => `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;

  const stopLabelParts = (stop) => {
    const rawName = String(stop?.name || '');
    const matched = rawName.match(/^(.*?)[（(]\s*(.+?)\s*[）)]\s*$/);
    if (matched) {
      return { title: matched[1].trim(), direction: matched[2].trim() };
    }
    return { title: rawName, direction: String(stop?.note || '').trim() };
  };

  function distanceMeters(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function heading(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const delta = rad(b.lng - a.lng);
    const y = Math.sin(delta) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function signedAngle(from, to) {
    return ((to - from + 540) % 360) - 180;
  }

  function buildMetrics(path) {
    const cumulative = [0];
    let total = 0;
    for (let index = 1; index < path.length; index += 1) {
      total += distanceMeters(path[index - 1], path[index]);
      cumulative.push(total);
    }
    return { cumulative, total };
  }

  function positionAtDistance(path, metrics, distance) {
    if (distance <= 0) return { position: path[0], next: path[1] || path[0] };
    if (distance >= metrics.total) return { position: path.at(-1), next: path.at(-1) };
    let index = 1;
    while (index < metrics.cumulative.length && metrics.cumulative[index] < distance) index += 1;
    const startDistance = metrics.cumulative[index - 1];
    const segmentLength = metrics.cumulative[index] - startDistance || 1;
    const ratio = (distance - startDistance) / segmentLength;
    const start = path[index - 1];
    const end = path[index];
    return {
      position: {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      },
      next: end,
    };
  }

  function stripHtml(value = '') {
    const node = document.createElement('div');
    node.innerHTML = value;
    return node.textContent || '';
  }

  function maneuverLabel(name = '', instruction = '') {
    const maneuver = String(name).toLowerCase();
    const text = stripHtml(instruction);
    if (maneuver.includes('uturn')) return null;
    if (maneuver.includes('roundabout')) return { arrow: '↻', label: 'ロータリー' };
    if (maneuver.includes('sharp-left')) return { arrow: '↙', label: '大きく左折' };
    if (maneuver.includes('sharp-right')) return { arrow: '↘', label: '大きく右折' };
    if (maneuver.includes('slight-left')) return { arrow: '↖', label: '斜め左' };
    if (maneuver.includes('slight-right')) return { arrow: '↗', label: '斜め右' };
    if (maneuver.includes('left') || /左折|左方向/.test(text)) return { arrow: '←', label: '左折' };
    if (maneuver.includes('right') || /右折|右方向/.test(text)) return { arrow: '→', label: '右折' };
    if (maneuver.includes('merge')) return { arrow: '⇢', label: '合流' };
    if (maneuver.includes('fork')) return { arrow: 'Y', label: '分岐' };
    return null;
  }

  async function makeRoute(googleApi, stops, statusNode) {
    const service = new googleApi.maps.DirectionsService();
    const path = [];
    const apiTurns = [];
    for (let start = 0; start < stops.length - 1; start += MAX_STOPS_PER_REQUEST - 1) {
      const end = Math.min(start + MAX_STOPS_PER_REQUEST - 1, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      statusNode.textContent = `道路ルートを生成中… ${start + 1}〜${end + 1}/${stops.length}`;
      const result = await service.route({
        origin: { lat: segment[0].lat, lng: segment[0].lng },
        destination: { lat: segment.at(-1).lat, lng: segment.at(-1).lng },
        waypoints: segment.slice(1, -1).map((stop) => ({
          location: { lat: stop.lat, lng: stop.lng },
          stopover: false,
        })),
        optimizeWaypoints: false,
        travelMode: googleApi.maps.TravelMode.DRIVING,
        avoidFerries: true,
      });
      const route = result.routes?.[0];
      const routePath = route?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (routePath.length < 2) throw new Error('Google Mapsから道路ルートを取得できませんでした。');
      if (path.length) routePath.shift();
      path.push(...routePath);
      (route.legs || []).forEach((leg) => (leg.steps || []).forEach((step) => {
        const guide = maneuverLabel(step.maneuver, step.instructions);
        if (!guide || !step.start_location) return;
        apiTurns.push({
          ...guide,
          instruction: stripHtml(step.instructions),
          point: { lat: step.start_location.lat(), lng: step.start_location.lng() },
        });
      }));
    }
    return { path, apiTurns };
  }

  function pointSegmentDistance(point, a, b) {
    const refLat = point.lat * Math.PI / 180;
    const meterLat = 111320;
    const meterLng = 111320 * Math.cos(refLat);
    const ax = (a.lng - point.lng) * meterLng;
    const ay = (a.lat - point.lat) * meterLat;
    const bx = (b.lng - point.lng) * meterLng;
    const by = (b.lat - point.lat) * meterLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy || 1;
    let ratio = -(ax * dx + ay * dy) / lengthSquared;
    ratio = Math.max(0, Math.min(1, ratio));
    return {
      distance: Math.hypot(ax + ratio * dx, ay + ratio * dy),
      ratio,
    };
  }

  function sequentialProjection(point, path, metrics, minimumIndex) {
    let firstNear = null;
    let best = null;
    const baseDistance = metrics.cumulative[minimumIndex] || 0;
    for (let index = minimumIndex; index < path.length - 1; index += 1) {
      const projected = pointSegmentDistance(point, path[index], path[index + 1]);
      const routeDistance = metrics.cumulative[index] + projected.ratio * (metrics.cumulative[index + 1] - metrics.cumulative[index]);
      const candidate = { ...projected, routeDistance, segmentIndex: index };
      if (!firstNear && projected.distance <= 45) firstNear = candidate;
      const forwardPenalty = Math.max(0, routeDistance - baseDistance) * 0.012;
      const score = projected.distance + forwardPenalty;
      if (!best || score < best.score) best = { ...candidate, score };
      if (firstNear && routeDistance - firstNear.routeDistance > 120) break;
    }
    return firstNear || best || { routeDistance: baseDistance, segmentIndex: minimumIndex, distance: Infinity };
  }

  function mapStopsToRoute(stops, path, metrics) {
    const distances = [0];
    let minimumIndex = 0;
    for (let index = 1; index < stops.length - 1; index += 1) {
      const projected = sequentialProjection(stops[index], path, metrics, minimumIndex);
      minimumIndex = Math.max(minimumIndex, projected.segmentIndex);
      const previous = distances[index - 1];
      distances.push(Math.max(previous + 3, projected.routeDistance));
    }
    distances.push(metrics.total);
    return distances;
  }

  function mapTurnsToRoute(turns, path, metrics) {
    let minimumIndex = 0;
    return turns.map((turn) => {
      const projected = sequentialProjection(turn.point, path, metrics, minimumIndex);
      minimumIndex = Math.max(minimumIndex, projected.segmentIndex);
      return { ...turn, routeDistance: projected.routeDistance };
    });
  }

  function geometricTurns(path, metrics, existingTurns) {
    const generated = [];
    for (let index = 2; index < path.length - 2; index += 1) {
      if (distanceMeters(path[index - 2], path[index]) < 8 || distanceMeters(path[index], path[index + 2]) < 8) continue;
      const change = signedAngle(heading(path[index - 2], path[index]), heading(path[index], path[index + 2]));
      const absolute = Math.abs(change);
      if (absolute < 38 || absolute > 145) continue;
      const routeDistance = metrics.cumulative[index];
      if (existingTurns.some((turn) => Math.abs(turn.routeDistance - routeDistance) < 35)) continue;
      if (generated.some((turn) => Math.abs(turn.routeDistance - routeDistance) < 40)) continue;
      generated.push({
        routeDistance,
        arrow: change > 0 ? '→' : '←',
        label: change > 0 ? '右折' : '左折',
        instruction: change > 0 ? '交差点を右折' : '交差点を左折',
      });
    }
    return generated;
  }

  function markerIcon(googleApi, number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"><circle cx="19" cy="19" r="17" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="19" y="24" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${number}</text></svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(38, 38),
      anchor: new googleApi.maps.Point(19, 19),
    };
  }

  function busIcon(googleApi) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><circle cx="26" cy="26" r="24" fill="white" stroke="#0f5ea8" stroke-width="3"/><text x="26" y="35" text-anchor="middle" font-size="28">🚌</text></svg>';
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(52, 52),
      anchor: new googleApi.maps.Point(26, 26),
    };
  }

  async function drawGuidance(route, system, token) {
    cleanup?.();
    const statusNode = document.getElementById('mapStatus');
    const activeStops = system.stops
      .map((stop, originalIndex) => ({ ...stop, originalIndex }))
      .filter(validPosition);
    const googleApi = await loadMaps();
    if (token !== renderToken || page !== 'routes') return;

    const center = activeStops[0]
      ? { lat: activeStops[0].lat, lng: activeStops[0].lng }
      : { lat: 35.662, lng: 139.901 };
    const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
      center,
      zoom: MAP_ZOOM,
      mapTypeControl: false,
      scaleControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
      position: center,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      motionTracking: false,
      addressControl: false,
    });
    const streetViewService = new googleApi.maps.StreetViewService();
    const panoCache = new Map();
    let waitingForStreetView = false;
    let resizeObserver = null;

    const triggerMapsResize = () => {
      try {
        googleApi.maps.event.trigger(map, 'resize');
        googleApi.maps.event.trigger(panorama, 'resize');
      } catch (error) {
        console.warn('Maps resize failed', error);
      }
    };

    const scheduleMapsResize = () => {
      requestAnimationFrame(() => {
        triggerMapsResize();
        setTimeout(triggerMapsResize, 120);
      });
    };

    const markers = activeStops.map((stop) => {
      const position = { lat: stop.lat, lng: stop.lng };
      return new googleApi.maps.Marker({
        map,
        position,
        icon: markerIcon(googleApi, stop.originalIndex + 1),
        title: displayName(stop),
      });
    });

    if (activeStops.length < 2) {
      statusNode.textContent = activeStops.length
        ? `${displayName(activeStops[0])}のみ位置設定済みです。2か所以上でルートを生成します。`
        : '緯度・経度が設定された停留所がありません。';
      cleanup = () => markers.forEach((marker) => marker.setMap(null));
      return;
    }

    const result = await makeRoute(googleApi, activeStops, statusNode);
    if (token !== renderToken || page !== 'routes') return;
    const metrics = buildMetrics(result.path);
    const stopDistances = mapStopsToRoute(activeStops, result.path, metrics);
    const apiTurns = mapTurnsToRoute(result.apiTurns, result.path, metrics);
    const turns = [...apiTurns, ...geometricTurns(result.path, metrics, apiTurns)]
      .filter((turn) => Number.isFinite(turn.routeDistance))
      .sort((a, b) => a.routeDistance - b.routeDistance);

    const line = new googleApi.maps.Polyline({
      map,
      path: result.path,
      strokeColor: '#0f5ea8',
      strokeOpacity: 0.95,
      strokeWeight: 7,
    });
    const vehicle = new googleApi.maps.Marker({
      map,
      position: center,
      icon: busIcon(googleApi),
      zIndex: 1000,
      title: `北栄線 系統${system.code}`,
    });

    const street = document.getElementById('street');
    street.style.position = 'relative';
    const streetCover = document.createElement('div');
    streetCover.className = 'street-cover-v22';
    streetCover.textContent = '停留所付近のStreet Viewを準備しています…';
    street.appendChild(streetCover);
    const stationTelop = document.createElement('div');
    stationTelop.className = 'station-name-telop guidance-station-v22';
    street.appendChild(stationTelop);
    const turnGuide = document.createElement('div');
    turnGuide.className = 'driving-turn-guide guidance-turn-v22';
    turnGuide.hidden = true;
    street.appendChild(turnGuide);

    const controls = document.createElement('div');
    controls.className = 'bus-controls bus-controls-v22';
    controls.innerHTML = `
      <button id="driveStartPause" class="primary bus-control-button" type="button">
        <span class="bus-label-full">スタート</span><span class="bus-label-short">スタート</span>
      </button>
      <button id="drivePrevious" class="secondary bus-control-button" type="button">
        <span class="bus-label-full">前の停留所</span><span class="bus-label-short">前</span>
      </button>
      <button id="driveNext" class="secondary bus-control-button" type="button">
        <span class="bus-label-full">次の停留所</span><span class="bus-label-short">次</span>
      </button>
      <button id="driveReset" class="secondary bus-control-button" type="button">
        <span class="bus-label-full">S地点</span><span class="bus-label-short">S地点</span>
      </button>
      <span id="driveProgress" class="bus-progress">始発：${esc(activeStops[0].name)}</span>`;
    document.querySelector('.guidance-v22-split')?.insertAdjacentElement('afterend', controls);

    const sequence = document.createElement('section');
    sequence.className = 'route-sequence-card';
    sequence.innerHTML = `<div class="route-sequence-title">系統${esc(system.code)}｜位置登録済み ${activeStops.length}/${system.stops.length}停留所</div><div class="route-sequence">${activeStops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-guidance-stop="${index}">${stop.originalIndex + 1}. ${esc(displayName(stop))}</button>${index < activeStops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    controls.insertAdjacentElement('afterend', sequence);

    const progress = document.getElementById('driveProgress');
    const startPauseButton = document.getElementById('driveStartPause');
    const previousButton = document.getElementById('drivePrevious');
    const nextButton = document.getElementById('driveNext');
    const speedMetersPerSecond = SPEED_KMH * 1000 / 3600;
    let traveled = 0;
    // lastPassedStopIndex: 最後に通過（到着）した停留所。停留所間走行中も維持する。
    let lastPassedStopIndex = 0;
    let selectedStopIndex = 0;
    let nextStopIndex = 1;
    let running = false;
    let frame = null;
    let previousTime = null;
    let dwellUntil = 0;
    let pausedDwellRemaining = 0;
    let activeImageKey = '';
    let finalStopPending = false;
    let telopHideAt = 0;
    let lastDrivingVisualUpdate = 0;
    let streetRequestToken = 0;
    let manualHold = true;

    const isAtStopDistance = (index) => {
      const distance = stopDistances[index];
      return Number.isFinite(distance) && Math.abs(traveled - distance) < 1;
    };

    // selectedStopIndex を現在表示中の停留所（登録座標上）として扱う
    const isParkedAtLastPassed = () => (
      selectedStopIndex === lastPassedStopIndex && isAtStopDistance(lastPassedStopIndex)
    );

    // 登録座標上か停留所間か（GPS一致だけでなく明示インデックスで判定）
    const isAtRegisteredStop = () => {
      if (selectedStopIndex !== lastPassedStopIndex) return false;
      if (isAtStopDistance(selectedStopIndex)) return true;
      // 終点完了後：次がなく manualHold で止まっている場合も停留所上
      return manualHold
        && nextStopIndex >= activeStops.length
        && selectedStopIndex === activeStops.length - 1;
    };

    // 停留所上と停留所間で前・次の移動先を分ける
    const getNavTargets = () => {
      if (!activeStops.length) {
        return { previousTargetIndex: -1, nextTargetIndex: -1, atRegisteredStop: false };
      }
      // 登録座標上：前 = 現在-1、次 = 現在+1
      if (isAtRegisteredStop()) {
        const currentStopIndex = selectedStopIndex;
        return {
          previousTargetIndex: currentStopIndex - 1,
          nextTargetIndex: currentStopIndex + 1,
          atRegisteredStop: true,
        };
      }
      // 停留所間：前 = 最後通過、次 = 最後通過+1
      return {
        previousTargetIndex: lastPassedStopIndex,
        nextTargetIndex: lastPassedStopIndex + 1,
        atRegisteredStop: false,
      };
    };

    const highlightStop = (index) => {
      sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.guidanceStop) === index);
      });
      sequence.querySelector(`[data-guidance-stop="${index}"]`)?.scrollIntoView({
        behavior: 'smooth', inline: 'center', block: 'nearest',
      });
    };

    const showStationTelop = (index, duration = DWELL_MS, preparing = false) => {
      const stop = activeStops[index];
      if (!stop) return;
      const seconds = Math.max(1, Math.ceil(duration / 1000));
      const countdown = preparing ? '停車中 表示準備中' : `停車中 あと${seconds}秒`;
      const parts = stopLabelParts(stop);
      const directionHtml = parts.direction
        ? `<small class="station-telop-dir">${esc(parts.direction)}</small>`
        : '';
      stationTelop.innerHTML = `<span>停留所</span><strong>${esc(parts.title)}</strong>${directionHtml}<em>${countdown}</em>`;
      stationTelop.classList.add('show');
      telopHideAt = performance.now() + duration + (preparing ? PANO_READY_TIMEOUT_MS : 0);
    };

    const stopImagesApi = () => window.HOKUEI_STOP_IMAGES_V25 || null;

    const prefetchStopImage = (index) => {
      const api = stopImagesApi();
      const stop = activeStops[index];
      if (!api?.prefetchImage || !stop) return;
      try {
        api.prefetchImage(stop, system, stop.originalIndex ?? index);
      } catch (error) {
        console.warn('停留所画像の事前読込に失敗', error);
      }
    };

    const clearStopImageOverlay = () => {
      const api = stopImagesApi();
      if (activeImageKey) api?.markDismissed?.(activeImageKey);
      else api?.hideOverlay?.();
      activeImageKey = '';
    };

    const requestPanorama = (position, radius) => new Promise((resolve) => {
      const request = { location: position, radius };
      if (googleApi.maps.StreetViewSource?.OUTDOOR) request.source = googleApi.maps.StreetViewSource.OUTDOOR;
      streetViewService.getPanorama(request, (data, status) => {
        resolve(status === googleApi.maps.StreetViewStatus.OK && data?.location?.pano ? data : null);
      });
    });

    const requestPanoramaById = (panoId) => new Promise((resolve) => {
      if (!panoId) {
        resolve(null);
        return;
      }
      streetViewService.getPanorama({ pano: panoId }, (data, status) => {
        resolve(status === googleApi.maps.StreetViewStatus.OK && data?.location?.pano ? data : null);
      });
    });

    const stopHeading = (index) => {
      const current = activeStops[index];
      const next = activeStops[index + 1] || activeStops[index - 1] || current;
      return heading(current, next);
    };

    const resolveStreetViewConfig = (index) => {
      const stop = activeStops[index];
      if (!stop) return null;
      const resolver = window.HOKUEI_STREETVIEW_STOPS?.resolve;
      if (typeof resolver === 'function') {
        return resolver(stop, stop.originalIndex ?? index, system.stops);
      }
      return stop.streetView || {
        lat: stop.lat,
        lng: stop.lng,
        stopDurationMs: stop.stopDurationMs || DWELL_MS,
      };
    };

    const cacheKeyForStop = (index) => {
      const stop = activeStops[index];
      if (!stop) return '';
      return stop.sharedStopKey || `${stop.id || stop.name}:${index}`;
    };

    const findPanoramaNear = async (location) => {
      let data = await requestPanorama(location, 50);
      if (!data) data = await requestPanorama(location, 100);
      if (!data) data = await requestPanorama(location, 180);
      return data;
    };

    const resolvePanoramaForStop = async (index) => {
      const stop = activeStops[index];
      if (!stop) return null;
      const key = cacheKeyForStop(index);
      if (key && panoCache.has(key)) return panoCache.get(key);

      const config = resolveStreetViewConfig(index) || {};
      const fallbackHeading = stopHeading(index);
      const pov = {
        heading: Number.isFinite(config.heading) ? config.heading : fallbackHeading,
        pitch: Number.isFinite(config.pitch) ? config.pitch : 0,
      };
      const zoom = Number.isFinite(config.zoom) ? config.zoom : 1;
      const stopDurationMs = Number.isFinite(config.stopDurationMs) ? config.stopDurationMs : DWELL_MS;

      try {
        if (config.panoId) {
          const byId = await requestPanoramaById(config.panoId);
          if (byId?.location?.pano) {
            const resolved = {
              panoId: byId.location.pano,
              pov,
              zoom,
              stopDurationMs,
              source: 'panoId',
            };
            if (key) panoCache.set(key, resolved);
            return resolved;
          }
        }

        const preferred = Number.isFinite(config.lat) && Number.isFinite(config.lng)
          ? { lat: config.lat, lng: config.lng }
          : null;
        if (preferred) {
          const data = await findPanoramaNear(preferred);
          if (data?.location?.pano) {
            const resolved = {
              panoId: data.location.pano,
              pov,
              zoom,
              stopDurationMs,
              source: 'streetView-latlng',
            };
            if (key) panoCache.set(key, resolved);
            return resolved;
          }
        }

        const exact = { lat: stop.lat, lng: stop.lng };
        const data = await findPanoramaNear(exact);
        if (data?.location?.pano) {
          const resolved = {
            panoId: data.location.pano,
            pov,
            zoom,
            stopDurationMs,
            source: 'stop-latlng',
          };
          if (key) panoCache.set(key, resolved);
          return resolved;
        }
      } catch (error) {
        console.warn('停留所パノラマ解決失敗', displayName(stop), error);
      }
      return { panoId: null, pov, zoom, stopDurationMs, source: 'missing' };
    };

    const waitForPanoramaReady = (timeoutMs = PANO_READY_TIMEOUT_MS) => new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        listeners.forEach((listener) => googleApi.maps.event.removeListener(listener));
        resolve();
      };
      const listeners = [
        panorama.addListener('status_changed', () => {
          const status = panorama.getStatus?.();
          if (!status || status === 'OK' || status === googleApi.maps.StreetViewStatus?.OK) finish();
        }),
        panorama.addListener('pano_changed', finish),
      ];
      setTimeout(finish, timeoutMs);
    });

    const applyPanoramaView = async (resolved) => {
      if (!resolved?.panoId) return false;
      panorama.setPano(resolved.panoId);
      panorama.setPov(resolved.pov);
      if (Number.isFinite(resolved.zoom)) panorama.setZoom(resolved.zoom);
      await waitForPanoramaReady();
      return true;
    };

    const prefetchStop = (index) => {
      if (index < 0 || index >= activeStops.length) return;
      resolvePanoramaForStop(index).catch((error) => {
        console.warn('停留所パノラマ事前取得失敗', error);
      });
    };

    const focusExactStop = async (index) => {
      const stop = activeStops[index];
      if (!stop) return { ok: false, stopDurationMs: DWELL_MS };
      const requestToken = ++streetRequestToken;
      const exact = { lat: stop.lat, lng: stop.lng };
      manualHold = true;
      vehicle.setPosition(exact);
      map.setCenter(exact);
      map.setZoom(MAP_ZOOM);
      streetCover.hidden = false;
      streetCover.textContent = `${displayName(stop)}付近のStreet Viewを準備中…`;
      prefetchStop(index + 1);
      prefetchStopImage(index + 1);
      try {
        const resolved = await resolvePanoramaForStop(index);
        if (requestToken !== streetRequestToken) {
          return { ok: false, stopDurationMs: resolved?.stopDurationMs || DWELL_MS };
        }
        const applied = await applyPanoramaView(resolved);
        if (requestToken !== streetRequestToken) {
          return { ok: false, stopDurationMs: resolved?.stopDurationMs || DWELL_MS };
        }
        if (applied) {
          streetCover.hidden = true;
          return { ok: true, stopDurationMs: resolved.stopDurationMs || DWELL_MS };
        }
        // パノラマなし：カバーで止めず直前表示を維持
        streetCover.hidden = true;
        return { ok: false, stopDurationMs: resolved?.stopDurationMs || DWELL_MS };
      } catch (error) {
        if (requestToken !== streetRequestToken) {
          return { ok: false, stopDurationMs: DWELL_MS };
        }
        streetCover.hidden = true;
        console.warn('停留所Street View取得失敗', error);
        return { ok: false, stopDurationMs: DWELL_MS };
      }
    };

    const updateStartPauseButton = () => {
      const full = startPauseButton.querySelector('.bus-label-full');
      const short = startPauseButton.querySelector('.bus-label-short');
      const label = running ? '一時停止' : 'スタート';
      if (full) full.textContent = label;
      if (short) short.textContent = label;
      startPauseButton.classList.toggle('primary', !running);
      startPauseButton.classList.toggle('secondary', running);
      startPauseButton.setAttribute('aria-pressed', running ? 'true' : 'false');
    };

    const updateButtons = () => {
      updateStartPauseButton();
      const { previousTargetIndex, nextTargetIndex } = getNavTargets();
      // 前：始発／配列先頭／移動先なしのときだけ無効（停留所上・一時停止中では無効にしない）
      previousButton.disabled = previousTargetIndex < 0;
      // 次：終点通過後／配列外のとき無効
      nextButton.disabled = nextTargetIndex < 0 || nextTargetIndex >= activeStops.length;
    };

    const updateTurnGuide = () => {
      if (dwellUntil || manualHold || waitingForStreetView) {
        turnGuide.hidden = true;
        return;
      }
      const nextTurn = turns.find((turn) => turn.routeDistance >= traveled - 3);
      if (!nextTurn) {
        turnGuide.hidden = true;
        return;
      }
      const remaining = nextTurn.routeDistance - traveled;
      if (remaining > TURN_NOTICE_METERS || remaining < -8) {
        turnGuide.hidden = true;
        return;
      }
      const rounded = Math.max(0, Math.round(remaining / 10) * 10);
      const distanceText = remaining <= 20 ? 'まもなく' : `${rounded}m先`;
      turnGuide.hidden = false;
      turnGuide.innerHTML = `<strong><b>${nextTurn.arrow}</b>${distanceText} ${nextTurn.label}</strong><span>${esc(nextTurn.instruction || '')}</span>`;
    };

    const updateText = (now) => {
      if (waitingForStreetView) {
        const countdown = stationTelop.querySelector('em');
        if (countdown) countdown.textContent = '停車中 表示準備中';
      } else if (dwellUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
        const countdown = stationTelop.querySelector('em');
        if (countdown) countdown.textContent = `停車中 あと${remainingSeconds}秒`;
      } else if (now >= telopHideAt) {
        stationTelop.classList.remove('show');
      }
      const lastPassedName = activeStops[lastPassedStopIndex]?.name || 'なし';
      const nextTarget = activeStops[lastPassedStopIndex + 1];
      const nextStop = nextTarget?.name || '終点';
      const betweenStops = !isParkedAtLastPassed() && traveled > (stopDistances[lastPassedStopIndex] || 0);
      const currentLabel = betweenStops
        ? `${lastPassedName}〜${nextStop}`
        : (activeStops[selectedStopIndex]?.name || '走行中');
      progress.textContent = `${running ? '走行中' : '停止中'}${waitingForStreetView ? '｜表示準備中' : ''}${dwellUntil ? '｜停車中' : ''}｜通過：${lastPassedName}｜現在：${currentLabel}｜次：${nextStop}`;
      updateButtons();
      updateTurnGuide();
    };

    const updateDrivingVisual = (now, force = false) => {
      if (manualHold || dwellUntil) return;
      const current = positionAtDistance(result.path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (force || now - lastDrivingVisualUpdate >= 900) {
        map.setCenter(current.position);
        map.setZoom(MAP_ZOOM);
        panorama.setPosition(current.position);
        panorama.setPov({ heading: heading(current.position, current.next), pitch: 0 });
        streetCover.hidden = true;
        lastDrivingVisualUpdate = now;
      }
    };

    const selectStop = (index, autoContinue) => {
      if (index < 0 || index >= activeStops.length) return;
      running = autoContinue;
      // 停留所へ直接移動・到着時は「最後に通過した停留所」を明示更新
      lastPassedStopIndex = index;
      selectedStopIndex = index;
      nextStopIndex = index + 1;
      traveled = stopDistances[index];
      previousTime = null;
      dwellUntil = 0;
      pausedDwellRemaining = 0;
      waitingForStreetView = true;
      manualHold = true;
      clearStopImageOverlay();
      highlightStop(index);
      showStationTelop(index, DWELL_MS, true);
      if (autoContinue) {
        finalStopPending = index === activeStops.length - 1;
        statusNode.textContent = `${displayName(activeStops[index])}に到着｜表示準備後に3秒停車`;
      } else {
        finalStopPending = false;
        statusNode.textContent = `${index + 1}. ${displayName(activeStops[index])}｜登録座標 ${activeStops[index].lat.toFixed(6)}, ${activeStops[index].lng.toFixed(6)}`;
      }
      updateText(performance.now());

      const stop = activeStops[index];
      const imagesApi = stopImagesApi();
      const hasRegisteredImage = Boolean(imagesApi?.resolveImage?.(stop, system, stop.originalIndex ?? index));

      const beginDwell = (duration, usedImage, imageKey = '') => {
        if (selectedStopIndex !== index) return;
        waitingForStreetView = false;
        activeImageKey = usedImage ? imageKey : '';
        if (!usedImage) clearStopImageOverlay();
        showStationTelop(index, duration, false);
        if (autoContinue && running) {
          dwellUntil = performance.now() + duration;
          statusNode.textContent = usedImage
            ? `${displayName(activeStops[index])}に到着｜停車画像を${Math.round(duration / 1000)}秒表示`
            : `${displayName(activeStops[index])}に到着｜${Math.round(duration / 1000)}秒停車`;
        } else {
          dwellUntil = 0;
        }
        updateText(performance.now());
        prefetchStopImage(index + 1);
      };

      // Street View は常に裏側で準備（画像失敗時のフォールバック）
      const svPromise = focusExactStop(index).catch((error) => {
        console.warn('停留所Street View取得失敗', error);
        return { ok: false, stopDurationMs: DWELL_MS };
      });

      if (hasRegisteredImage && imagesApi?.presentAtStop) {
        imagesApi.presentAtStop(stop, system, stop.originalIndex ?? index)
          .then((imageResult) => {
            if (selectedStopIndex !== index) return;
            if (imageResult?.usedImage) {
              beginDwell(imageResult.durationMs || DWELL_MS, true, imageResult.key || '');
              return;
            }
            // 画像失敗 → Street View 準備完了を待ってフォールバック
            svPromise.then((svResult) => {
              beginDwell(svResult?.stopDurationMs || DWELL_MS, false);
            });
          })
          .catch((error) => {
            console.warn('停留所画像表示失敗', error);
            if (selectedStopIndex !== index) return;
            svPromise.then((svResult) => {
              beginDwell(svResult?.stopDurationMs || DWELL_MS, false);
            });
          });
        return;
      }

      svPromise.then((svResult) => {
        beginDwell(svResult?.stopDurationMs || DWELL_MS, false);
      });
    };

    const completeRun = () => {
      running = false;
      dwellUntil = 0;
      pausedDwellRemaining = 0;
      waitingForStreetView = false;
      finalStopPending = false;
      previousTime = null;
      lastPassedStopIndex = activeStops.length - 1;
      selectedStopIndex = activeStops.length - 1;
      nextStopIndex = activeStops.length;
      traveled = metrics.total;
      manualHold = true;
      clearStopImageOverlay();
      updateText(performance.now());
      statusNode.textContent = `系統${system.code}の走行を完了しました。`;
    };

    const tick = (now) => {
      if (!running) return;
      if (waitingForStreetView) {
        updateText(now);
        frame = requestAnimationFrame(tick);
        return;
      }
      if (dwellUntil && now < dwellUntil) {
        updateText(now);
        frame = requestAnimationFrame(tick);
        return;
      }
      if (dwellUntil) {
        dwellUntil = 0;
        streetRequestToken += 1;
        manualHold = false;
        previousTime = now;
        clearStopImageOverlay();
        if (finalStopPending) {
          completeRun();
          return;
        }
      }
      if (previousTime === null) previousTime = now;
      traveled = Math.min(metrics.total, traveled + speedMetersPerSecond * Math.min((now - previousTime) / 1000, 1));
      previousTime = now;
      // 次停留所は「最後に通過した停留所の次」に固定（二重進行防止）
      nextStopIndex = lastPassedStopIndex + 1;
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && traveled >= target - 0.5) {
        selectStop(nextStopIndex, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      // 次停留所の事前取得（約120m手前）
      if (Number.isFinite(target) && target - traveled < 120 && target - traveled > 40) {
        prefetchStop(nextStopIndex);
        prefetchStopImage(nextStopIndex);
      }
      updateDrivingVisual(now);
      updateText(now);
      if (traveled >= metrics.total && nextStopIndex >= activeStops.length) {
        completeRun();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const pauseDriving = () => {
      if (!running && pausedDwellRemaining <= 0 && !dwellUntil) {
        updateText(performance.now());
        return;
      }
      running = false;
      cancelAnimationFrame(frame);
      previousTime = null;
      if (dwellUntil) {
        pausedDwellRemaining = Math.max(0, dwellUntil - performance.now());
        dwellUntil = 0;
        stopImagesApi()?.pauseDwell?.();
      } else {
        pausedDwellRemaining = 0;
      }
      // 表示準備中なら待機を解除し、通過済みインデックスは維持
      waitingForStreetView = false;
      finalStopPending = false;
      manualHold = true;
      updateText(performance.now());
      statusNode.textContent = pausedDwellRemaining > 0
        ? `一時停止｜停車残り約${Math.ceil(pausedDwellRemaining / 1000)}秒`
        : '走行を一時停止しました。';
    };

    const startDriving = () => {
      if (running) return;

      // 一時停止中の停車カウントを再開
      if (pausedDwellRemaining > 0) {
        running = true;
        dwellUntil = performance.now() + pausedDwellRemaining;
        pausedDwellRemaining = 0;
        stopImagesApi()?.resumeDwell?.();
        previousTime = null;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
        statusNode.textContent = '停車カウントを再開しました。';
        updateText(performance.now());
        return;
      }

      // 終点完了後はS地点（始発）から再開
      if (lastPassedStopIndex >= activeStops.length - 1 && isParkedAtLastPassed()) {
        stopImagesApi()?.resetSession?.();
        activeImageKey = '';
        selectStop(0, true);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
        return;
      }

      // 停留所間で一時停止していた場合：通過状態を維持したまま現在位置から再開
      const lastDist = stopDistances[lastPassedStopIndex] || 0;
      if (traveled > lastDist + 1) {
        running = true;
        waitingForStreetView = false;
        manualHold = false;
        previousTime = null;
        nextStopIndex = lastPassedStopIndex + 1;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
        statusNode.textContent = '走行を再開しました。';
        updateText(performance.now());
        return;
      }

      // 停留所に停車中：既存の20km/h走行処理で発車
      running = true;
      cancelAnimationFrame(frame);
      selectStop(lastPassedStopIndex, true);
      frame = requestAnimationFrame(tick);
    };

    startPauseButton.onclick = () => {
      if (running) pauseDriving();
      else startDriving();
    };

    previousButton.onclick = () => {
      // 走行中は誤操作防止のため自動で一時停止してから移動
      if (running) pauseDriving();
      const { previousTargetIndex: target } = getNavTargets();
      if (target < 0 || target >= activeStops.length) return;
      running = false;
      cancelAnimationFrame(frame);
      pausedDwellRemaining = 0;
      dwellUntil = 0;
      selectStop(target, false);
    };

    nextButton.onclick = () => {
      if (running) pauseDriving();
      const { nextTargetIndex: target } = getNavTargets();
      if (target < 0 || target >= activeStops.length) return;
      running = false;
      cancelAnimationFrame(frame);
      pausedDwellRemaining = 0;
      dwellUntil = 0;
      selectStop(target, false);
    };

    document.getElementById('driveReset').onclick = () => {
      running = false;
      cancelAnimationFrame(frame);
      pausedDwellRemaining = 0;
      waitingForStreetView = false;
      finalStopPending = false;
      stopImagesApi()?.resetSession?.();
      activeImageKey = '';
      selectStop(0, false);
      statusNode.textContent = `S地点（${activeStops[0].name}）へ戻しました。`;
    };

    sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
      button.onclick = () => {
        running = false;
        cancelAnimationFrame(frame);
        selectStop(Number(button.dataset.guidanceStop), false);
      };
    });

    markers.forEach((marker, index) => {
      marker.addListener('click', () => {
        running = false;
        cancelAnimationFrame(frame);
        selectStop(index, false);
      });
    });

    system.path = result.path;
    system.pathSource = '登録座標を順番に通る道路ルート';
    system.speedKmh = SPEED_KMH;
    system.dwellSeconds = 3;
    system.turnNoticeMeters = TURN_NOTICE_METERS;
    system.mapZoom = MAP_ZOOM;
    system.positionedStopCount = activeStops.length;
    system.turnCount = turns.length;
    system.guidanceVersion = '22';
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    save();

    highlightStop(0);
    showStationTelop(0, DWELL_MS, true);
    waitingForStreetView = true;
    focusExactStop(0).then(() => {
      waitingForStreetView = false;
      showStationTelop(0, DWELL_MS, false);
      updateText(performance.now());
    });
    prefetchStop(1);
    scheduleMapsResize();
    const splitEl = document.querySelector('.guidance-v22-split');
    if (typeof ResizeObserver !== 'undefined' && splitEl) {
      resizeObserver = new ResizeObserver(() => scheduleMapsResize());
      resizeObserver.observe(splitEl);
    }
    window.addEventListener('resize', scheduleMapsResize);
    updateText(performance.now());
    statusNode.textContent = `案内V22｜「次」は登録座標へ直接移動｜停留所${activeStops.length}件｜右左折案内${turns.length}件`;

    cleanup = () => {
      running = false;
      waitingForStreetView = false;
      cancelAnimationFrame(frame);
      streetRequestToken += 1;
      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener('resize', scheduleMapsResize);
      markers.forEach((marker) => marker.setMap(null));
      line.setMap(null);
      vehicle.setMap(null);
      controls.remove();
      sequence.remove();
      streetCover.remove();
      stationTelop.remove();
      turnGuide.remove();
    };
  }

  routes = function routesGuidanceV22() {
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) {
      cleanup?.();
      previousRoutes();
      return;
    }
    const route = selectedRoute;
    const code = selectedCode();
    const system = route.systems?.[code] || route.systems?.['1-1'];
    if (!system) return previousRoutes();
    route.outbound = system.stops;
    route.inbound = [];
    const positioned = system.stops.filter(validPosition).length;
    renderToken += 1;
    const token = renderToken;

    shell(`<section class="guidance-page-v26">
      <div class="controls manual-route-controls">
        <label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label>
        <label>系統<select id="systemSelect">${Object.values(route.systems).map((item) => `<option value="${item.code}" ${item.code === code ? 'selected' : ''}>${esc(item.code)}｜${esc(item.title)}</option>`).join('')}</select></label>
      </div>
      <section class="manual-mode-card guidance-summary-v22">
        <div><strong>ルート案内 V22</strong><span>「次の停留所」は登録済み緯度・経度へ直接移動｜位置設定 ${positioned}/${system.stops.length}件</span></div>
      </section>
      <div class="split guidance-v22-split">
        <div class="guidance-map-wrap-v22"><div id="routeMap" class="map guidance-map-v22"></div><div class="guidance-version-v22">案内V22・約20m</div></div>
        <div id="street" class="street guidance-street-v22"></div>
      </div>
      <p id="mapStatus" class="status">案内V22を準備しています…</p>
    </section>`);

    document.getElementById('routeSelect').onchange = (event) => {
      routeState.routeId = event.target.value;
      routes();
    };
    document.getElementById('systemSelect').onchange = (event) => {
      setSelectedCode(event.target.value);
      routes();
    };

    drawGuidance(route, system, token).catch((error) => {
      const node = document.getElementById('mapStatus');
      if (node) {
        node.dataset.state = 'error';
        node.textContent = error instanceof Error ? error.message : 'ルート案内を表示できませんでした。';
      }
    });
  };

  window.HOKUEI_GUIDANCE_V22 = {
    speedKmh: SPEED_KMH,
    dwellSeconds: 3,
    turnNoticeMeters: TURN_NOTICE_METERS,
    mapZoom: MAP_ZOOM,
    streetViewStops: () => window.HOKUEI_STREETVIEW_STOPS || null,
    /** 他路線へ切替時に北栄線の animation loop を確実に止める */
    cleanup: () => { cleanup?.(); },
  };

  setTimeout(() => {
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }, 0);
})();