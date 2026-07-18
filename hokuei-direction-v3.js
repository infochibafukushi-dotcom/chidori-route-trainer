(() => {
  const VERSION = '2026-07-18-directional-v3';
  const POSITION_SOURCE = 'google-places-directional-v3';
  const SPEED_KMH = 15;
  const DWELL_MS = 5000;

  const outboundNames = [...HOKUEI_STOPS];
  const inboundNames = [
    '北部幼稚園入口', '北栄中央', '北栄大三角線', '北栄四丁目', '砂田橋',
    '消防本部前', '海楽西児童公園', '浦安高校前', '海楽東児童公園', '美浜中学校',
    '美浜北小学校', '浦安警察署', '入船六丁目', '入船五丁目', '入船東団地', '新浦安駅',
  ];

  const directionConfig = (direction) => direction === 'inbound'
    ? { label: '戻り（1-1）', destination: '新浦安駅方面', names: inboundNames }
    : { label: '行き（1）', destination: '浦安駅入口方面', names: outboundNames };

  function ensureData() {
    const route = data.routes.find((item) => item.id === HOKUEI_ROUTE_ID);
    if (!route) return null;
    const old = new Map();
    ['outbound', 'inbound'].forEach((direction) => {
      (route[direction] || []).forEach((stop) => old.set(`${direction}:${stop.name}`, stop));
    });
    if (route.hokueiV3Version !== VERSION) {
      ['outbound', 'inbound'].forEach((direction) => {
        route[direction] = directionConfig(direction).names.map((name, index) => {
          const prior = old.get(`${direction}:${name}`) || {};
          const valid = prior.positionSource === `${POSITION_SOURCE}:${direction}` &&
            Number.isFinite(prior.lat) && Number.isFinite(prior.lng);
          return {
            id: prior.id || `hokuei-v3-${direction}-${index + 1}`,
            name, direction,
            address: valid ? prior.address : `${name} バス停, 浦安市, 千葉県`,
            lat: valid ? prior.lat : null,
            lng: valid ? prior.lng : null,
            placeId: valid ? prior.placeId : null,
            googleMapsURI: valid ? prior.googleMapsURI : null,
            iconMaskURI: valid ? prior.iconMaskURI : null,
            iconBackgroundColor: valid ? prior.iconBackgroundColor : null,
            positionSource: valid ? prior.positionSource : null,
          };
        });
      });
      route.hokueiV3Version = VERSION;
      route.description = '行き：系統1／戻り：系統1-1の新浦安駅方面区間';
      save();
    }
    return route;
  }

  const norm = (value = '') => String(value).normalize('NFKC')
    .replace(/[\s　・･()（）「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '').toLowerCase();

  function score(place, stopName, oppositeId) {
    if (!place?.location) return -Infinity;
    const wanted = norm(stopName);
    const found = norm(place.displayName || '');
    const types = place.types || [];
    let value = found === wanted ? 260 : (found.includes(wanted) || wanted.includes(found) ? 150 : 0);
    if (types.includes('bus_station')) value += 130;
    if (types.includes('transit_station')) value += 80;
    if ((place.formattedAddress || '').includes('浦安市')) value += 60;
    if (oppositeId && place.id === oppositeId) value -= 400;
    value -= distanceMeters(HOKUEI_CENTER, {
      lat: place.location.lat(), lng: place.location.lng(),
    }) / 300;
    return value;
  }

  async function searchStop(googleApi, name, direction, oppositeId) {
    const { Place } = await googleApi.maps.importLibrary('places');
    const cfg = directionConfig(direction);
    const found = new Map();
    for (const textQuery of [
      `${name} バス停 ${cfg.destination} 京成バス 浦安市`,
      `${name} バス停 京成バス 浦安市`,
    ]) {
      const response = await Place.searchByText({
        textQuery,
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'types',
          'googleMapsURI', 'svgIconMaskURI', 'iconBackgroundColor'],
        locationBias: { center: HOKUEI_CENTER, radius: 9000 },
        language: 'ja', region: 'jp', maxResultCount: 12,
      });
      (response.places || []).forEach((place) => {
        if (place.location) found.set(place.id || `${place.location.lat()},${place.location.lng()}`, place);
      });
      if (found.size >= 4) break;
    }
    return [...found.values()].sort((a, b) => score(b, name, oppositeId) - score(a, name, oppositeId))[0] || null;
  }

  async function resolveStops(route, direction, status) {
    const googleApi = await loadMaps();
    const stops = route[direction];
    const opposite = direction === 'outbound' ? 'inbound' : 'outbound';
    const oppositeByName = new Map((route[opposite] || []).map((s) => [s.name, s.placeId]));
    let fallbackCount = 0;
    let changed = false;

    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      if (stop.positionSource === `${POSITION_SOURCE}:${direction}` &&
        Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) continue;
      status.textContent = `${directionConfig(direction).label}のバス停位置を取得中… ${index + 1}/${stops.length} ${stop.name}`;
      let place = null;
      try { place = await searchStop(googleApi, stop.name, direction, oppositeByName.get(stop.name)); }
      catch (error) { console.warn(stop.name, error); }
      if (!place) {
        place = await fallbackGeocodeBusStop(googleApi, stop.name);
        fallbackCount += 1;
      }
      if (!place?.location) throw new Error(`${stop.name}の位置を取得できませんでした。`);
      stop.lat = place.location.lat();
      stop.lng = place.location.lng();
      stop.address = place.formattedAddress || stop.address;
      stop.placeId = place.id || null;
      stop.googleMapsURI = place.googleMapsURI || null;
      stop.iconMaskURI = place.svgIconMaskURI || null;
      stop.iconBackgroundColor = place.iconBackgroundColor || '#1a73e8';
      stop.positionSource = place.fallback ? `geocoder-fallback:${direction}` : `${POSITION_SOURCE}:${direction}`;
      changed = true;
      await sleep(120);
    }
    if (changed) save();
    const valid = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    valid.fallbackCount = fallbackCount;
    return valid;
  }

  const angleDiff = (after, before) => ((after - before + 540) % 360) - 180;

  function turnList(path, metrics) {
    const raw = [];
    for (let i = 1; i < path.length - 1; i += 1) {
      if (metrics.segmentDistances[i - 1] < 3 || metrics.segmentDistances[i] < 3) continue;
      const delta = angleDiff(headingDegrees(path[i], path[i + 1]), headingDegrees(path[i - 1], path[i]));
      if (Math.abs(delta) < 28 || Math.abs(delta) > 155) continue;
      raw.push({ distance: metrics.cumulative[i], side: delta < 0 ? 'left' : 'right', angle: Math.abs(delta) });
    }
    const result = [];
    raw.forEach((turn) => {
      const previous = result.at(-1);
      if (previous && turn.distance - previous.distance < 35) {
        if (turn.angle > previous.angle) result[result.length - 1] = turn;
      } else result.push(turn);
    });
    return result;
  }

  function createTurnGuide() {
    const street = document.getElementById('street');
    street.style.position = 'relative';
    const guide = document.createElement('div');
    guide.className = 'turn-guide';
    guide.hidden = true;
    street.appendChild(guide);
    return guide;
  }

  function animation({ googleApi, map, path, stops, panorama, routeStatus, arrowLine, direction }) {
    hokueiAnimationCleanup?.();
    document.getElementById('hokueiBusControls')?.remove();
    const controls = document.createElement('div');
    controls.id = 'hokueiBusControls';
    controls.className = 'bus-controls';
    controls.innerHTML = `
      <button id="busStart" class="primary bus-control-button">▶ ${SPEED_KMH}km/hで走行</button>
      <button id="busPause" class="secondary bus-control-button">一時停止</button>
      <button id="busPrevious" class="secondary bus-control-button">前の停留所</button>
      <button id="busNext" class="secondary bus-control-button">次の停留所</button>
      <button id="busReset" class="secondary bus-control-button">最初に戻す</button>
      <span id="busProgress" class="bus-progress">${stops[0].name}で待機中</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);

    const vehicle = new googleApi.maps.Marker({
      map, position: path[0], icon: createBusIcon(googleApi), zIndex: 1000,
      title: `北栄線 ${directionConfig(direction).label}`,
    });
    const metrics = buildPathMetrics(path);
    const stopDistances = mapStopsToRouteDistances(stops, path, metrics);
    const turns = turnList(path, metrics);
    const guide = createTurnGuide();
    const progress = document.getElementById('busProgress');
    const previousButton = document.getElementById('busPrevious');
    const nextButton = document.getElementById('busNext');
    const speedMps = SPEED_KMH * 1000 / 3600;
    let traveled = 0, running = false, frameId = null, previousTime = null;
    let nextStopIndex = 1, dwellUntil = 0, lastPanoTime = 0, lastPanoDistance = -Infinity;

    function previousIndex() {
      const current = Math.max(0, nextStopIndex - 1);
      const atStop = Math.abs(traveled - (stopDistances[current] || 0)) < 3;
      return atStop ? current - 1 : current;
    }

    function updateButtons() {
      const p = stops[previousIndex()];
      const n = stops[nextStopIndex];
      previousButton.disabled = !p;
      previousButton.textContent = p ? `前へ：${p.name}` : '前の停留所なし';
      nextButton.disabled = !n;
      nextButton.textContent = n ? `次へ：${n.name}` : '終点に到着';
    }

    function updateArrow() {
      const icons = arrowLine?.get('icons');
      if (!icons?.length || !metrics.totalDistance) return;
      icons[0].offset = `${Math.min(100, traveled / metrics.totalDistance * 100).toFixed(2)}%`;
      arrowLine.set('icons', icons);
    }

    function updateTurn() {
      const turn = turns.find((item) => item.distance >= traveled - 4);
      if (!turn) { guide.hidden = true; return; }
      const remaining = turn.distance - traveled;
      if (remaining > 110 || remaining < -10) { guide.hidden = true; return; }
      const left = turn.side === 'left';
      const arrow = left ? '←' : '→';
      guide.hidden = false;
      guide.className = `turn-guide ${left ? 'turn-left' : 'turn-right'}`;
      guide.textContent = remaining <= 15
        ? `${arrow} ${left ? '左折' : '右折'}`
        : `${Math.max(10, Math.round(remaining / 10) * 10)}m先 ${arrow} ${left ? '左折' : '右折'}`;
    }

    function update(now, forcePano = false) {
      const current = getPositionAtDistance(path, metrics, traveled);
      vehicle.setPosition(current.position);
      updateArrow();
      updateTurn();
      if (forcePano || (now - lastPanoTime >= 900 && traveled - lastPanoDistance >= 4)) {
        panorama.setPosition(current.position);
        panorama.setPov({ heading: headingDegrees(current.position, current.nextPosition), pitch: 0 });
        lastPanoTime = now; lastPanoDistance = traveled;
      }
      const next = stops[nextStopIndex];
      progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(metrics.totalDistance / 1000).toFixed(2)}km｜時速${SPEED_KMH}km${next ? `｜次：${next.name}` : ''}`;
      updateButtons();
    }

    function moveTo(index, now, keepRunning, wording) {
      if (index < 0 || index >= stops.length) return;
      const stop = stops[index];
      traveled = stopDistances[index];
      nextStopIndex = index + 1;
      previousTime = null;
      update(now, true);
      panorama.setPosition({ lat: stop.lat, lng: stop.lng });
      if (keepRunning) {
        dwellUntil = now + DWELL_MS;
        routeStatus.textContent = `${stop.name}に到着。5秒間停車します。`;
      } else {
        dwellUntil = 0;
        progress.textContent = `${stop.name}${wording}${stops[nextStopIndex] ? `｜次：${stops[nextStopIndex].name}` : '｜終点'}`;
        routeStatus.textContent = `${stop.name}へ移動しました。`;
      }
    }

    function finish() {
      running = false; dwellUntil = 0; traveled = metrics.totalDistance; nextStopIndex = stops.length;
      update(performance.now(), true);
      progress.textContent = `${stops.at(-1).name}に到着｜総距離 ${(metrics.totalDistance / 1000).toFixed(2)}km`;
      routeStatus.textContent = `北栄線 ${directionConfig(direction).label}の走行を完了しました。`;
    }

    function tick(now) {
      if (!running) return;
      if (dwellUntil) {
        if (now < dwellUntil) {
          const current = stops[Math.max(0, nextStopIndex - 1)];
          progress.textContent = `${current.name}で停車中｜あと${Math.max(1, Math.ceil((dwellUntil - now) / 1000))}秒｜次：${stops[nextStopIndex]?.name || '終点'}`;
          frameId = requestAnimationFrame(tick); return;
        }
        dwellUntil = 0; previousTime = now;
        if (traveled >= metrics.totalDistance) { finish(); return; }
      }
      if (previousTime === null) previousTime = now;
      const elapsed = Math.min((now - previousTime) / 1000, 1);
      previousTime = now;
      const before = traveled;
      traveled = Math.min(metrics.totalDistance, traveled + speedMps * elapsed);
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) {
        moveTo(nextStopIndex, now, true, 'に到着');
        frameId = requestAnimationFrame(tick); return;
      }
      update(now);
      if (traveled >= metrics.totalDistance) { finish(); return; }
      frameId = requestAnimationFrame(tick);
    }

    document.getElementById('busStart').onclick = () => {
      if (traveled >= metrics.totalDistance) { traveled = 0; nextStopIndex = 1; update(performance.now(), true); }
      running = true; dwellUntil = 0; previousTime = null;
      routeStatus.textContent = `${directionConfig(direction).label}を時速${SPEED_KMH}kmで走行中です。`;
      cancelAnimationFrame(frameId); frameId = requestAnimationFrame(tick);
    };
    document.getElementById('busPause').onclick = () => {
      running = false; dwellUntil = 0; previousTime = null; cancelAnimationFrame(frameId);
      routeStatus.textContent = '走行を一時停止しました。';
    };
    previousButton.onclick = () => {
      const index = previousIndex(); if (index < 0) return;
      const wasRunning = running; cancelAnimationFrame(frameId);
      moveTo(index, performance.now(), wasRunning, 'へ戻りました');
      if (wasRunning) frameId = requestAnimationFrame(tick);
    };
    nextButton.onclick = () => {
      if (nextStopIndex >= stops.length) return;
      const wasRunning = running; cancelAnimationFrame(frameId);
      moveTo(nextStopIndex, performance.now(), wasRunning, 'へスキップしました');
      if (wasRunning) frameId = requestAnimationFrame(tick);
    };
    document.getElementById('busReset').onclick = () => {
      running = false; dwellUntil = 0; previousTime = null; traveled = 0; nextStopIndex = 1;
      cancelAnimationFrame(frameId); vehicle.setPosition(path[0]); update(performance.now(), true);
      progress.textContent = `${stops[0].name}で待機中｜次：${stops[1]?.name || '終点'}`;
      routeStatus.textContent = '停留所ピンを押すとStreet Viewを確認できます。';
    };
    updateButtons(); updateTurn();
    hokueiAnimationCleanup = () => {
      running = false; cancelAnimationFrame(frameId); vehicle.setMap(null); arrowLine?.setMap(null);
      controls.remove(); guide.remove();
    };
  }

  async function drawV3(route, direction) {
    const status = document.getElementById('mapStatus');
    try {
      const googleApi = await loadMaps();
      const stops = await resolveStops(route, direction, status);
      if (stops.length !== directionConfig(direction).names.length) throw new Error('全停留所位置を取得できませんでした。');
      const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
        center: { lat: stops[0].lat, lng: stops[0].lng }, zoom: 14, mapTypeControl: false,
      });
      const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
        position: { lat: stops[0].lat, lng: stops[0].lng }, pov: { heading: 0, pitch: 0 },
        zoom: 1, motionTracking: false, addressControl: true,
      });
      const bounds = new googleApi.maps.LatLngBounds();
      const info = new googleApi.maps.InfoWindow();
      stops.forEach((stop, index) => {
        const position = { lat: stop.lat, lng: stop.lng }; bounds.extend(position);
        const marker = new googleApi.maps.Marker({
          map, position, title: `${index + 1}. ${stop.name}（${directionConfig(direction).label}）`,
          icon: createStopMarkerIcon(googleApi, stop), zIndex: 500,
        });
        marker.addListener('click', () => {
          panorama.setPosition(position);
          info.setContent(`<strong>${index + 1}. ${esc(stop.name)}</strong><br>${esc(directionConfig(direction).label)}${stop.googleMapsURI ? `<br><a href="${esc(stop.googleMapsURI)}" target="_blank" rel="noopener noreferrer">Google Mapsで確認</a>` : ''}`);
          info.open({ map, anchor: marker });
          status.textContent = `${index + 1}. ${stop.name}｜${directionConfig(direction).label}`;
        });
      });
      map.fitBounds(bounds, 50);
      const routeResult = await getDrivingRoutePath(googleApi, map, stops);
      animation({ googleApi, map, path: routeResult.path, stops, panorama, routeStatus: status,
        arrowLine: routeResult.arrowLine, direction });
      status.textContent = `北栄線 ${directionConfig(direction).label}を表示しました。行き・戻りで別のバス停位置を使用し、交差点では左折・右折を表示します。`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '北栄線を表示できませんでした。';
    }
  }

  routes = function routesV3() {
    const route = ensureData();
    originalRoutesPage();
    if (routeState.routeId !== HOKUEI_ROUTE_ID) return;
    const out = document.querySelector('[data-dir="outbound"]');
    const back = document.querySelector('[data-dir="inbound"]');
    if (out) { out.disabled = false; out.textContent = '行き（1）'; }
    if (back) { back.disabled = false; back.textContent = '戻り（1-1）'; }
    const select = document.getElementById('routeSelect');
    if (select && route) select.title = route.description;
  };

  drawRoute = function drawRouteV3(route) {
    if (route?.id === HOKUEI_ROUTE_ID) { drawV3(route, routeState.direction); return; }
    hokueiAnimationCleanup?.();
    originalDrawRoute(route, route?.[routeState.direction] || []);
  };

  ensureData();
})();