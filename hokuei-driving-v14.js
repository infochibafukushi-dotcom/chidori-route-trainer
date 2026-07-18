(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const MAX_STOPS = 8;
  const previousRoutes = routes;
  let cleanup = null;
  let renderToken = 0;

  const selectedCode = () => {
    const code = localStorage.getItem(SYSTEM_KEY) || '1-1';
    return code === '1-5' ? '1' : code;
  };
  const setSelectedCode = (code) => localStorage.setItem(SYSTEM_KEY, code === '1-5' ? '1' : code);
  const displayName = (stop) => `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;
  const validPosition = (stop) => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng);

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
    const startDistance = metrics.cumulative[index - 1];
    const segmentDistance = metrics.cumulative[index] - startDistance || 1;
    const ratio = (distance - startDistance) / segmentDistance;
    const a = path[index - 1];
    const b = path[index];
    return {
      position: { lat: a.lat + (b.lat - a.lat) * ratio, lng: a.lng + (b.lng - a.lng) * ratio },
      next: b,
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
    const div = document.createElement('div');
    div.innerHTML = value;
    return div.textContent || '';
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

  async function makeRoute(googleApi, stops, status) {
    const service = new googleApi.maps.DirectionsService();
    const path = [];
    const turns = [];
    for (let start = 0; start < stops.length - 1; start += MAX_STOPS - 1) {
      const end = Math.min(start + MAX_STOPS - 1, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      status.textContent = `道路ルートを生成中… ${start + 1}〜${end + 1}/${stops.length}`;
      const result = await service.route({
        origin: { lat: segment[0].lat, lng: segment[0].lng },
        destination: { lat: segment.at(-1).lat, lng: segment.at(-1).lng },
        waypoints: segment.slice(1, -1).map((stop) => ({ location: { lat: stop.lat, lng: stop.lng }, stopover: true })),
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
    let best = Infinity;
    for (let index = minimumIndex; index < path.length; index += 1) {
      const distance = distanceMeters(point, path[index]);
      if (distance < best) {
        best = distance;
        bestIndex = index;
      }
    }
    return { index: bestIndex, distance: metrics.cumulative[bestIndex] || 0 };
  }

  function mapStopsToPath(stops, path, metrics) {
    let minimumIndex = 0;
    return stops.map((stop) => {
      const match = nearestPathDistance(stop, path, metrics, minimumIndex);
      minimumIndex = match.index;
      return match.distance;
    });
  }

  function mapTurnsToPath(turns, path, metrics) {
    let minimumIndex = 0;
    return turns.map((turn) => {
      const match = nearestPathDistance(turn.point, path, metrics, minimumIndex);
      minimumIndex = match.index;
      return { ...turn, routeDistance: match.distance };
    });
  }

  function markerIcon(googleApi, number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${number}</text></svg>`;
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(36, 36), anchor: new googleApi.maps.Point(18, 18) };
  }

  function busIcon(googleApi) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="22" fill="white" stroke="#0f5ea8" stroke-width="3"/><text x="24" y="32" text-anchor="middle" font-size="25">🚌</text></svg>';
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(48, 48), anchor: new googleApi.maps.Point(24, 24) };
  }

  async function drawGuidance(route, system, token) {
    cleanup?.();
    const status = document.getElementById('mapStatus');
    const validStops = system.stops.filter(validPosition);
    const googleApi = await loadMaps();
    if (token !== renderToken || page !== 'routes') return;
    const center = validStops[0] ? { lat: validStops[0].lat, lng: validStops[0].lng } : { lat: 35.662, lng: 139.901 };
    const map = new googleApi.maps.Map(document.getElementById('routeMap'), { center, zoom: validStops.length ? 14 : 13, mapTypeControl: false });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), { position: center, pov: { heading: 0, pitch: 0 }, zoom: 1, motionTracking: false });
    const bounds = new googleApi.maps.LatLngBounds();
    const markers = [];
    system.stops.forEach((stop, index) => {
      if (!validPosition(stop)) return;
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      const marker = new googleApi.maps.Marker({ map, position, icon: markerIcon(googleApi, index + 1), title: displayName(stop) });
      markers.push(marker);
    });
    if (validStops.length) map.fitBounds(bounds, 50);
    const missing = system.stops.length - validStops.length;
    if (missing) {
      status.textContent = `位置設定 ${validStops.length}/${system.stops.length}件。残り${missing}件を設定してください。`;
      cleanup = () => markers.forEach((marker) => marker.setMap(null));
      return;
    }

    const result = await makeRoute(googleApi, system.stops, status);
    if (token !== renderToken || page !== 'routes') return;
    const metrics = buildMetrics(result.path);
    const stopDistances = mapStopsToPath(system.stops, result.path, metrics);
    stopDistances[0] = 0;
    stopDistances[stopDistances.length - 1] = metrics.total;
    const turns = mapTurnsToPath(result.turns, result.path, metrics);
    const line = new googleApi.maps.Polyline({ map, path: result.path, strokeColor: '#0f5ea8', strokeOpacity: .92, strokeWeight: 6 });
    const vehicle = new googleApi.maps.Marker({ map, position: result.path[0], icon: busIcon(googleApi), zIndex: 1000, title: `北栄線 系統${system.code}` });

    const street = document.getElementById('street');
    street.style.position = 'relative';
    const stationTelop = document.createElement('div');
    stationTelop.className = 'station-name-telop';
    street.appendChild(stationTelop);
    const turnGuide = document.createElement('div');
    turnGuide.className = 'driving-turn-guide';
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
      <span id="driveProgress" class="bus-progress">始発：${esc(system.stops[0].name)}｜停車3秒</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);

    const sequence = document.createElement('section');
    sequence.className = 'route-sequence-card';
    sequence.innerHTML = `<div class="route-sequence-title">系統${esc(system.code)}｜全${system.stops.length}停留所</div><div class="route-sequence">${system.stops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-guidance-stop="${index}">${index + 1}. ${esc(displayName(stop))}</button>${index < system.stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    controls.insertAdjacentElement('afterend', sequence);

    const progress = document.getElementById('driveProgress');
    const previousButton = document.getElementById('drivePrevious');
    const nextButton = document.getElementById('driveNext');
    const speed = SPEED_KMH * 1000 / 3600;
    let traveled = 0;
    let nextStopIndex = 1;
    let running = false;
    let frame = null;
    let previousTime = null;
    let dwellUntil = 0;
    let telopUntil = 0;
    let lastPanorama = 0;

    const currentStopIndex = () => Math.max(0, nextStopIndex - 1);
    const showStation = (index, duration = DWELL_MS) => {
      const stop = system.stops[index];
      stationTelop.textContent = stop ? displayName(stop) : '';
      stationTelop.classList.add('show');
      telopUntil = performance.now() + duration;
    };
    const highlight = (index) => {
      sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => button.classList.toggle('active', Number(button.dataset.guidanceStop) === index));
      sequence.querySelector(`[data-guidance-stop="${index}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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
      const nextTurn = turns.find((turn) => turn.routeDistance >= traveled - 8);
      if (!nextTurn) { turnGuide.hidden = true; return; }
      const remaining = nextTurn.routeDistance - traveled;
      if (remaining > 160 || remaining < -12) { turnGuide.hidden = true; return; }
      turnGuide.hidden = false;
      turnGuide.innerHTML = `<strong>${nextTurn.arrow} ${nextTurn.label}</strong><span>${remaining <= 20 ? 'まもなく' : `${Math.max(10, Math.round(remaining / 10) * 10)}m先`}｜${esc(nextTurn.instruction)}</span>`;
    };
    const update = (now, forcePanorama = false) => {
      const current = positionAtDistance(result.path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (forcePanorama || now - lastPanorama >= 800) {
        panorama.setPosition(current.position);
        panorama.setPov({ heading: heading(current.position, current.next), pitch: 0 });
        lastPanorama = now;
      }
      if (now > telopUntil) stationTelop.classList.remove('show');
      updateTurnGuide();
      progress.textContent = `時速20km｜前：${system.stops[currentStopIndex() - 1]?.name || 'なし'}｜現在：${system.stops[currentStopIndex()]?.name || '走行中'}｜次：${system.stops[nextStopIndex]?.name || '終点'}｜${(traveled / 1000).toFixed(2)}km`;
      updateButtons();
    };
    const moveToStop = (index, keepRunning) => {
      if (index < 0 || index >= system.stops.length) return;
      traveled = stopDistances[index];
      nextStopIndex = index + 1;
      previousTime = null;
      highlight(index);
      showStation(index);
      update(performance.now(), true);
      if (keepRunning) {
        dwellUntil = performance.now() + DWELL_MS;
        status.textContent = `${displayName(system.stops[index])}に到着｜3秒停車`;
      } else {
        dwellUntil = 0;
        status.textContent = `${displayName(system.stops[index])}を表示中`;
      }
    };
    const finish = () => {
      running = false;
      traveled = metrics.total;
      nextStopIndex = system.stops.length;
      highlight(system.stops.length - 1);
      showStation(system.stops.length - 1, 5000);
      update(performance.now(), true);
      status.textContent = `系統${system.code}の走行を完了しました。`;
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
        previousTime = now;
      }
      if (previousTime === null) previousTime = now;
      const before = traveled;
      traveled = Math.min(metrics.total, traveled + speed * Math.min((now - previousTime) / 1000, 1));
      previousTime = now;
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) {
        moveToStop(nextStopIndex, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      update(now);
      if (traveled >= metrics.total) { finish(); return; }
      frame = requestAnimationFrame(tick);
    };

    document.getElementById('driveStart').onclick = () => {
      if (traveled >= metrics.total) moveToStop(0, false);
      running = true;
      dwellUntil = 0;
      previousTime = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      status.textContent = `系統${system.code}を時速20kmで走行中です。`;
    };
    document.getElementById('drivePause').onclick = () => {
      running = false;
      dwellUntil = 0;
      previousTime = null;
      cancelAnimationFrame(frame);
      status.textContent = '走行を一時停止しました。';
    };
    previousButton.onclick = () => {
      const target = currentStopIndex() - 1;
      if (target < 0) return;
      const keepRunning = running;
      cancelAnimationFrame(frame);
      moveToStop(target, keepRunning);
      if (keepRunning) frame = requestAnimationFrame(tick);
    };
    nextButton.onclick = () => {
      if (nextStopIndex >= system.stops.length) return;
      const keepRunning = running;
      cancelAnimationFrame(frame);
      moveToStop(nextStopIndex, keepRunning);
      if (keepRunning) frame = requestAnimationFrame(tick);
    };
    document.getElementById('driveReset').onclick = () => {
      running = false;
      cancelAnimationFrame(frame);
      traveled = 0;
      nextStopIndex = 1;
      highlight(0);
      showStation(0);
      update(performance.now(), true);
      status.textContent = `始発の${system.stops[0].name}へ戻しました。`;
    };
    sequence.querySelectorAll('[data-guidance-stop]').forEach((button) => {
      button.onclick = () => moveToStop(Number(button.dataset.guidanceStop), false);
    });

    system.path = result.path;
    system.pathSource = '手動設定位置からGoogle Maps道路ルートを生成';
    system.speedKmh = SPEED_KMH;
    system.dwellSeconds = 3;
    system.turnCount = turns.length;
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    save();
    highlight(0);
    showStation(0);
    updateButtons();
    status.textContent = `系統${system.code}｜時速20km｜各停留所3秒停車｜交差点案内${turns.length}件`;

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

  routes = function routesDrivingV14() {
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
    shell(`<section><div class="controls manual-route-controls"><label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label><label>系統<select id="systemSelect">${Object.values(route.systems).map((item) => `<option value="${item.code}" ${item.code === code ? 'selected' : ''}>${esc(item.code)}｜${esc(item.title)}</option>`).join('')}</select></label></div><section class="manual-mode-card"><div><strong>ルート案内モード</strong><span>時速20km・停留所3秒停車・停留所名テロップ｜位置設定 ${positioned}/${system.stops.length}件</span></div><button id="manualSettings" class="secondary" type="button">設定画面で位置を修正</button></section><div class="split"><div id="routeMap" class="map"></div><div id="street" class="street"></div></div><p id="mapStatus" class="status">ルートを準備しています…</p></section>`);
    document.getElementById('routeSelect').onchange = (event) => { routeState.routeId = event.target.value; routes(); };
    document.getElementById('systemSelect').onchange = (event) => { setSelectedCode(event.target.value); routes(); };
    document.getElementById('manualSettings').onclick = () => { settingsTab = 'stops'; go('settings'); };
    drawGuidance(route, system, token).catch((error) => {
      const node = document.getElementById('mapStatus');
      if (node) node.textContent = error instanceof Error ? error.message : 'ルート案内を表示できませんでした。';
    });
  };
})();