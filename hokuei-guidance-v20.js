(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
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
    const segments = [];
    let total = 0;
    for (let index = 1; index < path.length; index += 1) {
      const length = distanceMeters(path[index - 1], path[index]);
      segments.push(length);
      total += length;
      cumulative.push(total);
    }
    return { cumulative, segments, total };
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
      const route = result.routes[0];
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

  function projectPoint(point, path, metrics, minimumDistance = 0) {
    const refLat = point.lat * Math.PI / 180;
    const meterLat = 111320;
    const meterLng = 111320 * Math.cos(refLat);
    let best = null;
    for (let index = 0; index < path.length - 1; index += 1) {
      const startDistance = metrics.cumulative[index];
      const endDistance = metrics.cumulative[index + 1];
      if (endDistance < minimumDistance) continue;
      const a = path[index];
      const b = path[index + 1];
      const ax = (a.lng - point.lng) * meterLng;
      const ay = (a.lat - point.lat) * meterLat;
      const bx = (b.lng - point.lng) * meterLng;
      const by = (b.lat - point.lat) * meterLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy || 1;
      let ratio = -(ax * dx + ay * dy) / lengthSquared;
      ratio = Math.max(0, Math.min(1, ratio));
      const routeDistance = startDistance + ratio * (endDistance - startDistance);
      if (routeDistance < minimumDistance) continue;
      const px = ax + ratio * dx;
      const py = ay + ratio * dy;
      const distance = Math.hypot(px, py);
      if (!best || distance < best.distance) best = { routeDistance, distance, segmentIndex: index };
    }
    return best || { routeDistance: minimumDistance, distance: Infinity, segmentIndex: 0 };
  }

  function mapStopsToRoute(stops, path, metrics) {
    let minimumDistance = 0;
    return stops.map((stop, index) => {
      if (index === 0) return 0;
      if (index === stops.length - 1) return metrics.total;
      const result = projectPoint(stop, path, metrics, minimumDistance + 4);
      minimumDistance = Math.max(minimumDistance + 4, result.routeDistance);
      return minimumDistance;
    });
  }

  function mapApiTurns(apiTurns, path, metrics) {
    let minimumDistance = 0;
    return apiTurns.map((turn) => {
      const result = projectPoint(turn.point, path, metrics, minimumDistance);
      minimumDistance = Math.max(minimumDistance, result.routeDistance);
      return { ...turn, routeDistance: result.routeDistance };
    });
  }

  function geometricTurns(path, metrics, existingTurns) {
    const generated = [];
    for (let index = 2; index < path.length - 2; index += 1) {
      const beforeDistance = distanceMeters(path[index - 2], path[index]);
      const afterDistance = distanceMeters(path[index], path[index + 2]);
      if (beforeDistance < 8 || afterDistance < 8) continue;
      const before = heading(path[index - 2], path[index]);
      const after = heading(path[index], path[index + 2]);
      const change = signedAngle(before, after);
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
    });

    const markers = activeStops.map((stop) => {
      const position = { lat: stop.lat, lng: stop.lng };
      const marker = new googleApi.maps.Marker({
        map,
        position,
        icon: markerIcon(googleApi, stop.originalIndex + 1),
        title: displayName(stop),
      });
      marker.addListener('click', () => {
        map.panTo(position);
        map.setZoom(MAP_ZOOM);
        panorama.setPosition(position);
        statusNode.textContent = `${stop.originalIndex + 1}. ${displayName(stop)}｜位置登録済み`;
      });
      return marker;
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
    const apiTurns = mapApiTurns(result.apiTurns, result.path, metrics);
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
      position: result.path[0],
      icon: busIcon(googleApi),
      zIndex: 1000,
      title: `北栄線 系統${system.code}`,
    });

    const street = document.getElementById('street');
    street.style.position = 'relative';
    const stationTelop = document.createElement('div');
    stationTelop.className = 'station-name-telop guidance-station-v20';
    street.appendChild(stationTelop);
    const turnGuide = document.createElement('div');
    turnGuide.className = 'driving-turn-guide guidance-turn-v20';
    turnGuide.hidden = true;
    street.appendChild(turnGuide);

    const controls = document.createElement('div');
    controls.className = 'bus-controls';
    controls.innerHTML = `
      <button id="driveStart" class="primary bus-control-button">▶ 20km/hで走行</button>
      <button id="drivePause" class="secondary bus-control-button">一時停止</button>
      <button id="drivePrevious" class="secondary bus-control-button">前の停留所</button>
      <button id="driveNext" class="secondary bus-control-button">次の停留所</button>
      <button id="driveReset" class="secondary bus-control-button">始発に戻す</button>
      <span id="driveProgress" class="bus-progress">始発：${esc(activeStops[0].name)}｜3秒停車後に発車</span>`;
    document.querySelector('.guidance-v20-split')?.insertAdjacentElement('afterend', controls);

    const sequence = document.createElement('section');
    sequence.className = 'route-sequence-card';
    sequence.innerHTML = `<div class="route-sequence-title">系統${esc(system.code)}｜位置登録済み ${activeStops.length}/${system.stops.length}停留所</div><div class="route-sequence">${activeStops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-guidance-stop="${index}">${stop.originalIndex + 1}. ${esc(displayName(stop))}</button>${index < activeStops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    controls.insertAdjacentElement('afterend', sequence);

    const progress = document.getElementById('driveProgress');
    const previousButton = document.getElementById('drivePrevious');
    const nextButton = document.getElementById('driveNext');
    const speedMetersPerSecond = SPEED_KMH * 1000 / 3600;
    let traveled = 0;
    let nextStopIndex = 1;
    let running = false;
    let frame = null;
    let previousTime = null;
    let dwellUntil = 0;
    let dwellStopIndex = null;
    let finalStopPending = false;
    let telopHideAt = 0;
    let lastVisualUpdate = 0;

    const currentStopIndex = () => Math.max(0, nextStopIndex - 1);

    const highlightStop = (index) => {
      sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.guidanceStop) === index);
      });
      sequence.querySelector(`[data-guidance-stop="${index}"]`)?.scrollIntoView({
        behavior: 'smooth', inline: 'center', block: 'nearest',
      });
    };

    const showStationTelop = (index, duration = DWELL_MS) => {
      const stop = activeStops[index];
      if (!stop) return;
      stationTelop.innerHTML = `<span>停留所</span><strong>${esc(displayName(stop))}</strong><em>停車中 あと3秒</em>`;
      stationTelop.classList.add('show');
      telopHideAt = performance.now() + duration;
    };

    const updateButtons = () => {
      const previousIndex = currentStopIndex() - 1;
      const nextStop = activeStops[nextStopIndex];
      previousButton.disabled = previousIndex < 0;
      previousButton.textContent = previousIndex >= 0 ? `前：${activeStops[previousIndex].name}` : '前の停留所なし';
      nextButton.disabled = !nextStop;
      nextButton.textContent = nextStop ? `次：${nextStop.name}` : '終点に到着';
    };

    const updateTurnGuide = () => {
      if (dwellUntil) {
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

    const update = (now, forceVisual = false) => {
      const current = positionAtDistance(result.path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (forceVisual || now - lastVisualUpdate >= 550) {
        map.panTo(current.position);
        if (map.getZoom() !== MAP_ZOOM) map.setZoom(MAP_ZOOM);
        panorama.setPosition(current.position);
        panorama.setPov({ heading: heading(current.position, current.next), pitch: 0 });
        lastVisualUpdate = now;
      }

      if (dwellUntil && dwellStopIndex !== null) {
        const remainingSeconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
        const countdown = stationTelop.querySelector('em');
        if (countdown) countdown.textContent = `停車中 あと${remainingSeconds}秒`;
      } else if (now >= telopHideAt) {
        stationTelop.classList.remove('show');
      }

      updateTurnGuide();
      const previousStop = activeStops[currentStopIndex() - 1]?.name || 'なし';
      const currentStop = activeStops[currentStopIndex()]?.name || '走行中';
      const nextStop = activeStops[nextStopIndex]?.name || '終点';
      progress.textContent = `時速20km${dwellUntil ? '｜3秒停車中' : ''}｜前：${previousStop}｜現在：${currentStop}｜次：${nextStop}`;
      updateButtons();
    };

    const arriveAtStop = (index, autoContinue) => {
      if (index < 0 || index >= activeStops.length) return;
      traveled = stopDistances[index];
      nextStopIndex = index + 1;
      previousTime = null;
      dwellStopIndex = index;
      highlightStop(index);
      showStationTelop(index, DWELL_MS);
      if (autoContinue) {
        dwellUntil = performance.now() + DWELL_MS;
        finalStopPending = index === activeStops.length - 1;
        statusNode.textContent = `${displayName(activeStops[index])}に到着｜3秒停車`;
      } else {
        dwellUntil = 0;
        finalStopPending = false;
        statusNode.textContent = `${displayName(activeStops[index])}を表示中`;
      }
      update(performance.now(), true);
    };

    const completeRun = () => {
      running = false;
      dwellUntil = 0;
      dwellStopIndex = null;
      finalStopPending = false;
      previousTime = null;
      traveled = metrics.total;
      nextStopIndex = activeStops.length;
      update(performance.now(), true);
      statusNode.textContent = `系統${system.code}の走行を完了しました。`;
    };

    const tick = (now) => {
      if (!running) return;
      if (dwellUntil && now < dwellUntil) {
        update(now);
        frame = requestAnimationFrame(tick);
        return;
      }
      if (dwellUntil) {
        dwellUntil = 0;
        dwellStopIndex = null;
        previousTime = now;
        if (finalStopPending) {
          completeRun();
          return;
        }
      }
      if (previousTime === null) previousTime = now;
      traveled = Math.min(metrics.total, traveled + speedMetersPerSecond * Math.min((now - previousTime) / 1000, 1));
      previousTime = now;
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && traveled >= target - 0.5) {
        arriveAtStop(nextStopIndex, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      update(now);
      if (traveled >= metrics.total && nextStopIndex >= activeStops.length) {
        completeRun();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    document.getElementById('driveStart').onclick = () => {
      if (running) return;
      if (traveled >= metrics.total && nextStopIndex >= activeStops.length) {
        traveled = 0;
        nextStopIndex = 1;
      }
      running = true;
      cancelAnimationFrame(frame);
      if (traveled === 0 && nextStopIndex === 1) arriveAtStop(0, true);
      else previousTime = null;
      frame = requestAnimationFrame(tick);
    };

    document.getElementById('drivePause').onclick = () => {
      running = false;
      cancelAnimationFrame(frame);
      previousTime = null;
      dwellUntil = 0;
      dwellStopIndex = null;
      finalStopPending = false;
      update(performance.now(), true);
      statusNode.textContent = '走行を一時停止しました。';
    };

    previousButton.onclick = () => {
      const target = currentStopIndex() - 1;
      if (target < 0) return;
      running = false;
      cancelAnimationFrame(frame);
      arriveAtStop(target, false);
    };

    nextButton.onclick = () => {
      if (nextStopIndex >= activeStops.length) return;
      running = false;
      cancelAnimationFrame(frame);
      arriveAtStop(nextStopIndex, false);
    };

    document.getElementById('driveReset').onclick = () => {
      running = false;
      cancelAnimationFrame(frame);
      traveled = 0;
      nextStopIndex = 1;
      previousTime = null;
      dwellUntil = 0;
      dwellStopIndex = null;
      finalStopPending = false;
      highlightStop(0);
      showStationTelop(0, DWELL_MS);
      update(performance.now(), true);
      statusNode.textContent = `始発の${activeStops[0].name}へ戻しました。`;
    };

    sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
      button.onclick = () => {
        running = false;
        cancelAnimationFrame(frame);
        arriveAtStop(Number(button.dataset.guidanceStop), false);
      };
    });

    system.path = result.path;
    system.pathSource = '位置登録済み停留所を通るUターン禁止道路ルート';
    system.speedKmh = SPEED_KMH;
    system.dwellSeconds = 3;
    system.turnNoticeMeters = TURN_NOTICE_METERS;
    system.mapZoom = MAP_ZOOM;
    system.positionedStopCount = activeStops.length;
    system.turnCount = turns.length;
    system.guidanceVersion = '20';
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    save();

    highlightStop(0);
    showStationTelop(0, DWELL_MS);
    update(performance.now(), true);
    statusNode.textContent = `案内V20｜停留所${activeStops.length}件で3秒停車｜右左折案内${turns.length}件｜地図約20m尺度`;

    cleanup = () => {
      running = false;
      cancelAnimationFrame(frame);
      markers.forEach((marker) => marker.setMap(null));
      line.setMap(null);
      vehicle.setMap(null);
      controls.remove();
      sequence.remove();
      stationTelop.remove();
      turnGuide.remove();
    };
  }

  routes = function routesGuidanceV20() {
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

    shell(`<section>
      <div class="controls manual-route-controls">
        <label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label>
        <label>系統<select id="systemSelect">${Object.values(route.systems).map((item) => `<option value="${item.code}" ${item.code === code ? 'selected' : ''}>${esc(item.code)}｜${esc(item.title)}</option>`).join('')}</select></label>
      </div>
      <section class="manual-mode-card guidance-summary-v20">
        <div><strong>ルート案内 V20</strong><span>位置登録済み停留所で3秒停車・停留所名テロップ・右左折の距離案内・地図約20m尺度｜位置設定 ${positioned}/${system.stops.length}件</span></div>
        <button id="manualSettings" class="secondary" type="button">設定画面で位置を修正</button>
      </section>
      <div class="split guidance-v20-split">
        <div class="guidance-map-wrap-v20"><div id="routeMap" class="map guidance-map-v20"></div><div class="guidance-version-v20">案内V20・約20m</div></div>
        <div id="street" class="street guidance-street-v20"></div>
      </div>
      <p id="mapStatus" class="status">案内V20を準備しています…</p>
    </section>`);

    document.getElementById('routeSelect').onchange = (event) => {
      routeState.routeId = event.target.value;
      routes();
    };
    document.getElementById('systemSelect').onchange = (event) => {
      setSelectedCode(event.target.value);
      routes();
    };
    document.getElementById('manualSettings').onclick = () => {
      settingsTab = 'stops';
      go('settings');
    };

    drawGuidance(route, system, token).catch((error) => {
      const node = document.getElementById('mapStatus');
      if (node) {
        node.dataset.state = 'error';
        node.textContent = error instanceof Error ? error.message : 'ルート案内を表示できませんでした。';
      }
    });
  };

  window.HOKUEI_GUIDANCE_V20 = {
    speedKmh: SPEED_KMH,
    dwellSeconds: 3,
    turnNoticeMeters: TURN_NOTICE_METERS,
    mapZoom: MAP_ZOOM,
  };

  setTimeout(() => {
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }, 0);
})();