(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const TURN_NOTICE_METERS = 250;
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
    const segmentStart = metrics.cumulative[index - 1];
    const segmentLength = metrics.cumulative[index] - segmentStart || 1;
    const ratio = (distance - segmentStart) / segmentLength;
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

  function heading(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const delta = rad(b.lng - a.lng);
    const y = Math.sin(delta) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function stripHtml(value = '') {
    const node = document.createElement('div');
    node.innerHTML = value;
    return node.textContent || '';
  }

  function maneuverLabel(name = '', instruction = '') {
    const maneuver = String(name).toLowerCase();
    const text = stripHtml(instruction);
    if (maneuver.includes('uturn')) return { arrow: '↶', label: 'Uターン' };
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
    const turns = [];
    for (let start = 0; start < stops.length - 1; start += MAX_STOPS_PER_REQUEST - 1) {
      const end = Math.min(start + MAX_STOPS_PER_REQUEST - 1, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      statusNode.textContent = `道路ルートを生成中… ${start + 1}〜${end + 1}/${stops.length}`;
      const result = await service.route({
        origin: { lat: segment[0].lat, lng: segment[0].lng },
        destination: { lat: segment.at(-1).lat, lng: segment.at(-1).lng },
        waypoints: segment.slice(1, -1).map((stop) => ({
          location: { lat: stop.lat, lng: stop.lng },
          stopover: true,
        })),
        optimizeWaypoints: false,
        travelMode: googleApi.maps.TravelMode.DRIVING,
        avoidFerries: true,
      });
      const route = result.routes[0];
      const routePath = route?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (!routePath.length) throw new Error('Google Mapsから道路ルートを取得できませんでした。');
      if (path.length) routePath.shift();
      path.push(...routePath);
      (route.legs || []).forEach((leg) => (leg.steps || []).forEach((step) => {
        const guide = maneuverLabel(step.maneuver, step.instructions);
        if (!guide || !step.start_location || !step.end_location) return;
        turns.push({
          ...guide,
          instruction: stripHtml(step.instructions),
          point: { lat: step.start_location.lat(), lng: step.start_location.lng() },
          end: { lat: step.end_location.lat(), lng: step.end_location.lng() },
        });
      }));
    }
    return { path, turns };
  }

  function nearestPathDistance(point, path, metrics, minimumIndex = 0) {
    let bestIndex = minimumIndex;
    let bestDistance = Infinity;
    for (let index = minimumIndex; index < path.length; index += 1) {
      const candidate = distanceMeters(point, path[index]);
      if (candidate < bestDistance) {
        bestDistance = candidate;
        bestIndex = index;
      }
    }
    return { index: bestIndex, routeDistance: metrics.cumulative[bestIndex] || 0 };
  }

  function mapStopsToPath(stops, path, metrics) {
    let minimumIndex = 0;
    return stops.map((stop) => {
      const result = nearestPathDistance(stop, path, metrics, minimumIndex);
      minimumIndex = result.index;
      return result.routeDistance;
    });
  }

  function mapTurnsToPath(turns, path, metrics) {
    let minimumIndex = 0;
    return turns.map((turn) => {
      const result = nearestPathDistance(turn.point, path, metrics, minimumIndex);
      minimumIndex = result.index;
      return { ...turn, routeDistance: result.routeDistance };
    });
  }

  function markerIcon(googleApi, number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${number}</text></svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(36, 36),
      anchor: new googleApi.maps.Point(18, 18),
    };
  }

  function busIcon(googleApi) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="22" fill="white" stroke="#0f5ea8" stroke-width="3"/><text x="24" y="32" text-anchor="middle" font-size="25">🚌</text></svg>';
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(48, 48),
      anchor: new googleApi.maps.Point(24, 24),
    };
  }

  async function drawGuidance(route, system, token) {
    cleanup?.();
    const statusNode = document.getElementById('mapStatus');
    const validStops = system.stops.filter(validPosition);
    const googleApi = await loadMaps();
    if (token !== renderToken || page !== 'routes') return;

    const center = validStops[0]
      ? { lat: validStops[0].lat, lng: validStops[0].lng }
      : { lat: 35.662, lng: 139.901 };
    const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
      center,
      zoom: validStops.length ? 14 : 13,
      mapTypeControl: false,
    });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
      position: center,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      motionTracking: false,
    });
    const bounds = new googleApi.maps.LatLngBounds();
    const markers = [];
    system.stops.forEach((stop, index) => {
      if (!validPosition(stop)) return;
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      const marker = new googleApi.maps.Marker({
        map,
        position,
        icon: markerIcon(googleApi, index + 1),
        title: displayName(stop),
      });
      marker.addListener('click', () => {
        panorama.setPosition(position);
        statusNode.textContent = `${index + 1}. ${displayName(stop)}｜手動設定位置`;
      });
      markers.push(marker);
    });
    if (validStops.length) map.fitBounds(bounds, 50);

    const missing = system.stops.length - validStops.length;
    if (missing) {
      statusNode.textContent = `位置設定 ${validStops.length}/${system.stops.length}件。残り${missing}件を設定してください。`;
      cleanup = () => markers.forEach((marker) => marker.setMap(null));
      return;
    }

    const result = await makeRoute(googleApi, system.stops, statusNode);
    if (token !== renderToken || page !== 'routes') return;
    const metrics = buildMetrics(result.path);
    const stopDistances = mapStopsToPath(system.stops, result.path, metrics);
    stopDistances[0] = 0;
    stopDistances[stopDistances.length - 1] = metrics.total;
    const turns = mapTurnsToPath(result.turns, result.path, metrics);

    const line = new googleApi.maps.Polyline({
      map,
      path: result.path,
      strokeColor: '#0f5ea8',
      strokeOpacity: 0.92,
      strokeWeight: 6,
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
    stationTelop.className = 'station-name-telop station-name-telop-v16';
    street.appendChild(stationTelop);
    const turnGuide = document.createElement('div');
    turnGuide.className = 'driving-turn-guide driving-turn-guide-v16';
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
      <span id="driveProgress" class="bus-progress">始発：${esc(system.stops[0].name)}｜3秒停車後に発車</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);

    const sequence = document.createElement('section');
    sequence.className = 'route-sequence-card';
    sequence.innerHTML = `<div class="route-sequence-title">系統${esc(system.code)}｜全${system.stops.length}停留所</div><div class="route-sequence">${system.stops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-guidance-stop="${index}">${index + 1}. ${esc(displayName(stop))}</button>${index < system.stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
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
    let lastPanoramaUpdate = 0;
    let telopHideAt = 0;

    const currentStopIndex = () => Math.max(0, nextStopIndex - 1);

    const highlightStop = (index) => {
      sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.guidanceStop) === index);
      });
      sequence.querySelector(`[data-guidance-stop="${index}"]`)?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    };

    const showStationTelop = (index, duration = DWELL_MS) => {
      const stop = system.stops[index];
      if (!stop) return;
      stationTelop.innerHTML = `<span class="station-telop-label">停留所</span><strong>${esc(displayName(stop))}</strong><span class="station-telop-countdown">3秒停車</span>`;
      stationTelop.classList.add('show');
      telopHideAt = performance.now() + duration;
    };

    const updateButtons = () => {
      const previousIndex = currentStopIndex() - 1;
      const nextStop = system.stops[nextStopIndex];
      previousButton.disabled = previousIndex < 0;
      previousButton.textContent = previousIndex >= 0 ? `前：${system.stops[previousIndex].name}` : '前の停留所なし';
      nextButton.disabled = !nextStop;
      nextButton.textContent = nextStop ? `次：${nextStop.name}` : '終点に到着';
    };

    const updateTurnGuide = () => {
      if (dwellUntil) {
        turnGuide.hidden = true;
        return;
      }
      const nextTurn = turns.find((turn) => turn.routeDistance >= traveled - 5);
      if (!nextTurn) {
        turnGuide.hidden = true;
        return;
      }
      const remaining = nextTurn.routeDistance - traveled;
      if (remaining > TURN_NOTICE_METERS || remaining < -10) {
        turnGuide.hidden = true;
        return;
      }
      const rounded = Math.max(0, Math.round(remaining / 10) * 10);
      const distanceText = remaining <= 20 ? 'まもなく' : `${rounded}m先`;
      turnGuide.hidden = false;
      turnGuide.innerHTML = `<strong>${nextTurn.arrow} ${distanceText} ${nextTurn.label}</strong><span>${esc(nextTurn.instruction)}</span>`;
    };

    const update = (now, forcePanorama = false) => {
      const current = positionAtDistance(result.path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (forcePanorama || now - lastPanoramaUpdate >= 700) {
        panorama.setPosition(current.position);
        panorama.setPov({ heading: heading(current.position, current.next), pitch: 0 });
        lastPanoramaUpdate = now;
      }

      if (dwellUntil && dwellStopIndex !== null) {
        const remainingSeconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
        const countdown = stationTelop.querySelector('.station-telop-countdown');
        if (countdown) countdown.textContent = `停車中 あと${remainingSeconds}秒`;
      } else if (now >= telopHideAt) {
        stationTelop.classList.remove('show');
      }

      updateTurnGuide();
      const previousStop = system.stops[currentStopIndex() - 1]?.name || 'なし';
      const currentStop = system.stops[currentStopIndex()]?.name || '走行中';
      const nextStop = system.stops[nextStopIndex]?.name || '終点';
      const dwellText = dwellUntil ? '｜停車中' : '';
      progress.textContent = `時速20km${dwellText}｜前：${previousStop}｜現在：${currentStop}｜次：${nextStop}｜${(traveled / 1000).toFixed(2)}km`;
      updateButtons();
    };

    const arriveAtStop = (index, autoContinue) => {
      if (index < 0 || index >= system.stops.length) return;
      traveled = stopDistances[index];
      nextStopIndex = index + 1;
      previousTime = null;
      dwellStopIndex = index;
      highlightStop(index);
      showStationTelop(index, DWELL_MS);
      if (autoContinue) {
        dwellUntil = performance.now() + DWELL_MS;
        finalStopPending = index === system.stops.length - 1;
        statusNode.textContent = `${displayName(system.stops[index])}に到着｜3秒停車`;
      } else {
        dwellUntil = 0;
        finalStopPending = false;
        statusNode.textContent = `${displayName(system.stops[index])}を表示中`;
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
      nextStopIndex = system.stops.length;
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
      const before = traveled;
      traveled = Math.min(metrics.total, traveled + speedMetersPerSecond * Math.min((now - previousTime) / 1000, 1));
      previousTime = now;
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) {
        arriveAtStop(nextStopIndex, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      update(now);
      if (traveled >= metrics.total && nextStopIndex >= system.stops.length) {
        arriveAtStop(system.stops.length - 1, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    document.getElementById('driveStart').onclick = () => {
      if (running) return;
      if (traveled >= metrics.total && nextStopIndex >= system.stops.length) {
        traveled = 0;
        nextStopIndex = 1;
        highlightStop(0);
      }
      running = true;
      cancelAnimationFrame(frame);
      if (traveled === 0 && nextStopIndex === 1) {
        arriveAtStop(0, true);
      } else {
        previousTime = null;
        statusNode.textContent = `系統${system.code}を時速20kmで走行中です。`;
      }
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
      if (nextStopIndex >= system.stops.length) return;
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
      statusNode.textContent = `始発の${system.stops[0].name}へ戻しました。`;
    };

    sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
      button.onclick = () => {
        running = false;
        cancelAnimationFrame(frame);
        arriveAtStop(Number(button.dataset.guidanceStop), false);
      };
    });

    system.path = result.path;
    system.pathSource = '手動設定位置からGoogle Maps道路ルートを生成';
    system.speedKmh = SPEED_KMH;
    system.dwellSeconds = 3;
    system.turnNoticeMeters = TURN_NOTICE_METERS;
    system.turnCount = turns.length;
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    save();

    highlightStop(0);
    showStationTelop(0, DWELL_MS);
    updateButtons();
    statusNode.textContent = `系統${system.code}｜各停留所3秒停車｜停留所名テロップ｜曲がる${TURN_NOTICE_METERS}m手前から案内`;

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

  routes = function routesGuidanceV16() {
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) {
      cleanup?.();
      previousRoutes();
      return;
    }

    const route = selectedRoute;
    const code = selectedCode();
    const system = route.systems?.[code] || route.systems?.['1-1'];
    if (!system) {
      previousRoutes();
      return;
    }
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
      <section class="manual-mode-card">
        <div><strong>ルート案内モード</strong><span>時速20km・全停留所3秒停車・停留所名テロップ・曲がる250m手前から距離案内｜位置設定 ${positioned}/${system.stops.length}件</span></div>
        <button id="manualSettings" class="secondary" type="button">設定画面で位置を修正</button>
      </section>
      <div class="split"><div id="routeMap" class="map"></div><div id="street" class="street"></div></div>
      <p id="mapStatus" class="status">ルートを準備しています…</p>
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

  window.HOKUEI_GUIDANCE_V16 = {
    speedKmh: SPEED_KMH,
    dwellSeconds: DWELL_MS / 1000,
    turnNoticeMeters: TURN_NOTICE_METERS,
  };

  setTimeout(() => {
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }, 0);
})();