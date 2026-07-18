(() => {
  const VERSION = '2026-07-18-selected-direction-v5';
  const POSITION_SOURCE = 'google-places-selected-direction-v5';
  const SPEED_KMH = 15;
  const DWELL_MS = 5000;

  const OUTBOUND_NAMES = [
    '新浦安駅', '入船東団地', '入船五丁目', '入船六丁目', '浦安警察署',
    '美浜北小学校', '美浜中学校', '海楽東児童公園', '浦安高校前',
    '海楽西児童公園', '消防本部前', '砂田橋', '北栄四丁目',
    '北栄大三角線', '北栄中央', '北栄三丁目', '北栄一丁目',
    '浦安駅東口', '浦安駅入口',
  ];

  const RETURN_NAMES = [
    '浦安駅東口', '当代島', '北栄北', '北栄第二街区公園', '北栄二丁目',
    '北部幼稚園入口', '北栄中央', '北栄大三角線', '北栄四丁目', '砂田橋',
    '消防本部前', '海楽西児童公園', '浦安高校前', '海楽東児童公園',
    '美浜中学校', '美浜北小学校', '浦安警察署', '入船六丁目',
    '入船五丁目', '入船東団地', '新浦安駅',
  ];

  const cfg = (direction) => direction === 'inbound'
    ? {
        key: 'return-1-1',
        label: '戻り（1-1）',
        destination: '新浦安駅方面',
        names: RETURN_NAMES,
        firstQuery: '浦安駅東口 バス停 02 京成バス千葉ウエスト',
      }
    : {
        key: 'outbound-1',
        label: '行き（1）',
        destination: '浦安駅入口方面',
        names: OUTBOUND_NAMES,
        firstQuery: '新浦安駅 バス停 A 北栄線 京成バス千葉ウエスト',
      };

  function ensureData() {
    const route = data.routes.find((item) => item.id === HOKUEI_ROUTE_ID);
    if (!route) return null;
    if (route.hokueiSelectedDirectionVersion === VERSION) return route;

    ['outbound', 'inbound'].forEach((direction) => {
      const routeCfg = cfg(direction);
      route[direction] = routeCfg.names.map((name, index) => ({
        id: `hokuei-v5-${routeCfg.key}-${String(index + 1).padStart(2, '0')}`,
        name,
        routeMode: routeCfg.key,
        order: index + 1,
        address: `${name} バス停, 浦安市, 千葉県`,
        lat: null,
        lng: null,
        placeId: null,
        googleMapsURI: null,
        iconMaskURI: null,
        iconBackgroundColor: null,
        positionSource: null,
      }));
    });

    route.hokueiSelectedDirectionVersion = VERSION;
    route.description = '行き：新浦安駅→浦安駅入口／戻り：浦安駅東口→新浦安駅';
    save();
    return route;
  }

  const norm = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/[\s　・･()（）「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  function scorePlace(place, stopName) {
    if (!place?.location) return -Infinity;
    const wanted = norm(stopName);
    const found = norm(place.displayName || '');
    const types = place.types || [];
    let score = found === wanted ? 300 : (found.includes(wanted) || wanted.includes(found) ? 180 : 0);
    if (types.includes('bus_station')) score += 160;
    if (types.includes('transit_station')) score += 100;
    if ((place.formattedAddress || '').includes('浦安市')) score += 70;
    return score;
  }

  async function findStop(googleApi, stop, direction, index, status) {
    const routeCfg = cfg(direction);
    const { Place } = await googleApi.maps.importLibrary('places');
    const queries = [];
    if (index === 0) queries.push(routeCfg.firstQuery);
    queries.push(
      `${stop.name} バス停 ${routeCfg.destination} 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 京成バス 浦安市`,
    );

    const candidates = new Map();
    for (const textQuery of queries) {
      status.textContent = `選択中ルートのバス停位置を確認中… ${index + 1}/${routeCfg.names.length} ${stop.name}`;
      try {
        const response = await Place.searchByText({
          textQuery,
          fields: [
            'id', 'displayName', 'formattedAddress', 'location', 'types',
            'googleMapsURI', 'svgIconMaskURI', 'iconBackgroundColor',
          ],
          locationBias: { center: HOKUEI_CENTER, radius: 9000 },
          language: 'ja',
          region: 'jp',
          maxResultCount: 12,
        });
        (response.places || []).forEach((place) => {
          if (!place.location) return;
          candidates.set(place.id || `${place.location.lat()},${place.location.lng()}`, place);
        });
      } catch (error) {
        console.warn(`${stop.name}のPlaces検索に失敗しました。`, error);
      }
      if (candidates.size >= 4) break;
    }

    const selected = [...candidates.values()]
      .sort((a, b) => scorePlace(b, stop.name) - scorePlace(a, stop.name))[0];
    if (selected?.location) return selected;

    const geocoder = new googleApi.maps.Geocoder();
    const response = await geocoder.geocode({
      address: `${stop.name} バス停 ${routeCfg.destination} 浦安市 千葉県`,
      region: 'JP',
      componentRestrictions: { country: 'JP' },
    });
    const result = response.results.find((item) => item.formatted_address.includes('浦安市')) || response.results[0];
    if (!result?.geometry?.location) return null;
    return {
      id: null,
      displayName: stop.name,
      formattedAddress: result.formatted_address,
      location: result.geometry.location,
      googleMapsURI: null,
      svgIconMaskURI: null,
      iconBackgroundColor: null,
      fallback: true,
    };
  }

  async function resolveStops(route, direction, status) {
    const googleApi = await loadMaps();
    const stops = route[direction];
    let changed = false;
    let fallbackCount = 0;

    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      const source = `${POSITION_SOURCE}:${direction}:${index}`;
      if (stop.positionSource === source && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) continue;

      const place = await findStop(googleApi, stop, direction, index, status);
      if (!place?.location) throw new Error(`${stop.name}の位置を取得できませんでした。`);
      stop.lat = place.location.lat();
      stop.lng = place.location.lng();
      stop.address = place.formattedAddress || stop.address;
      stop.placeId = place.id || null;
      stop.googleMapsURI = place.googleMapsURI || null;
      stop.iconMaskURI = place.svgIconMaskURI || null;
      stop.iconBackgroundColor = place.iconBackgroundColor || '#1a73e8';
      stop.positionSource = source;
      if (place.fallback) fallbackCount += 1;
      changed = true;
      await new Promise((resolve) => setTimeout(resolve, 90));
    }

    if (changed) save();
    stops.fallbackCount = fallbackCount;
    return stops;
  }

  function routeStyles() {
    return [
      { featureType: 'transit.station.bus', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    ];
  }

  function createSequence(stops, routeCfg) {
    document.getElementById('routeSequence')?.remove();
    const box = document.createElement('section');
    box.id = 'routeSequence';
    box.className = 'route-sequence-card';
    box.innerHTML = `
      <div class="route-sequence-title">${esc(routeCfg.label)}｜全停留所順（${stops.length}停留所）</div>
      <div class="route-sequence">
        ${stops.map((stop, index) => `
          <span class="route-sequence-stop" data-sequence-index="${index}">${index + 1}. ${esc(stop.name)}</span>
          ${index < stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}
        `).join('')}
      </div>`;
    document.getElementById('hokueiBusControls')?.insertAdjacentElement('afterend', box);
    return box;
  }

  function makeTurnList(path, metrics) {
    const turns = [];
    let lastDistance = -Infinity;
    for (let index = 3; index < path.length - 3; index += 1) {
      const before = path[index - 3];
      const current = path[index];
      const after = path[index + 3];
      const beforeHeading = headingDegrees(before, current);
      const afterHeading = headingDegrees(current, after);
      const delta = ((afterHeading - beforeHeading + 540) % 360) - 180;
      const routeDistance = metrics.cumulative[index] || 0;
      if (Math.abs(delta) >= 38 && routeDistance - lastDistance >= 55) {
        turns.push({ distance: routeDistance, side: delta > 0 ? 'right' : 'left' });
        lastDistance = routeDistance;
      }
    }
    return turns;
  }

  function setupAnimation({ googleApi, map, path, stops, panorama, status, arrowLine, direction }) {
    hokueiAnimationCleanup?.();
    document.getElementById('hokueiBusControls')?.remove();
    document.getElementById('routeSequence')?.remove();

    const routeCfg = cfg(direction);
    const controls = document.createElement('div');
    controls.id = 'hokueiBusControls';
    controls.className = 'bus-controls';
    controls.innerHTML = `
      <button id="busStart" class="primary bus-control-button">▶ ${SPEED_KMH}km/hで走行</button>
      <button id="busPause" class="secondary bus-control-button">一時停止</button>
      <button id="busPrevious" class="secondary bus-control-button">前の停留所</button>
      <button id="busNext" class="secondary bus-control-button">次の停留所</button>
      <button id="busReset" class="secondary bus-control-button">始発に戻す</button>
      <span id="busProgress" class="bus-progress">始発：${esc(stops[0].name)}で待機中</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);
    const sequence = createSequence(stops, routeCfg);

    const vehicle = new googleApi.maps.Marker({
      map,
      position: { lat: stops[0].lat, lng: stops[0].lng },
      icon: createBusIcon(googleApi),
      zIndex: 1000,
      title: `北栄線 ${routeCfg.label}`,
    });

    const metrics = buildPathMetrics(path);
    const stopDistances = mapStopsToRouteDistances(stops, path, metrics);
    stopDistances[0] = 0;
    stopDistances[stopDistances.length - 1] = metrics.totalDistance;
    const turns = makeTurnList(path, metrics);
    const street = document.getElementById('street');
    street.style.position = 'relative';
    const guide = document.createElement('div');
    guide.className = 'turn-guide';
    guide.hidden = true;
    street.appendChild(guide);

    const progress = document.getElementById('busProgress');
    const previousButton = document.getElementById('busPrevious');
    const nextButton = document.getElementById('busNext');
    const speedMps = SPEED_KMH * 1000 / 3600;
    let traveled = 0;
    let running = false;
    let frameId = null;
    let previousTime = null;
    let nextStopIndex = 1;
    let dwellUntil = 0;
    let lastPanoTime = 0;
    let lastPanoDistance = -Infinity;

    const currentStopIndex = () => Math.max(0, nextStopIndex - 1);
    function previousIndex() {
      const current = currentStopIndex();
      const atStop = Math.abs(traveled - (stopDistances[current] || 0)) < 3;
      return atStop ? current - 1 : current;
    }
    function highlight(index) {
      sequence.querySelectorAll('.route-sequence-stop').forEach((element) => {
        element.classList.toggle('active', Number(element.dataset.sequenceIndex) === index);
      });
    }
    function updateButtons() {
      const previousStop = stops[previousIndex()];
      const nextStop = stops[nextStopIndex];
      previousButton.disabled = !previousStop;
      previousButton.textContent = previousStop ? `前へ：${previousStop.name}` : '前の停留所なし';
      nextButton.disabled = !nextStop;
      nextButton.textContent = nextStop ? `次へ：${nextStop.name}` : '終点に到着';
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
        lastPanoTime = now;
        lastPanoDistance = traveled;
      }
      progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(metrics.totalDistance / 1000).toFixed(2)}km｜時速${SPEED_KMH}km${stops[nextStopIndex] ? `｜次：${stops[nextStopIndex].name}` : ''}`;
      updateButtons();
    }
    function moveTo(index, now, keepRunning, wording) {
      if (index < 0 || index >= stops.length) return;
      const stop = stops[index];
      traveled = stopDistances[index];
      nextStopIndex = index + 1;
      previousTime = null;
      update(now, true);
      vehicle.setPosition({ lat: stop.lat, lng: stop.lng });
      panorama.setPosition({ lat: stop.lat, lng: stop.lng });
      highlight(index);
      if (keepRunning) {
        dwellUntil = now + DWELL_MS;
        status.textContent = `${stop.name}に到着。5秒間停車します。`;
      } else {
        dwellUntil = 0;
        progress.textContent = `${stop.name}${wording}${stops[nextStopIndex] ? `｜次：${stops[nextStopIndex].name}` : '｜終点'}`;
        status.textContent = `${stop.name}へ移動しました。`;
      }
    }
    function finish() {
      running = false;
      traveled = metrics.totalDistance;
      nextStopIndex = stops.length;
      update(performance.now(), true);
      vehicle.setPosition({ lat: stops.at(-1).lat, lng: stops.at(-1).lng });
      highlight(stops.length - 1);
      progress.textContent = `${stops.at(-1).name}に到着｜総距離 ${(metrics.totalDistance / 1000).toFixed(2)}km`;
      status.textContent = `北栄線 ${routeCfg.label}の走行を完了しました。`;
    }
    function tick(now) {
      if (!running) return;
      if (dwellUntil) {
        if (now < dwellUntil) {
          const current = stops[currentStopIndex()];
          progress.textContent = `${current.name}で停車中｜あと${Math.max(1, Math.ceil((dwellUntil - now) / 1000))}秒｜次：${stops[nextStopIndex]?.name || '終点'}`;
          frameId = requestAnimationFrame(tick);
          return;
        }
        dwellUntil = 0;
        previousTime = now;
      }
      if (previousTime === null) previousTime = now;
      const elapsed = Math.min((now - previousTime) / 1000, 1);
      previousTime = now;
      const before = traveled;
      traveled = Math.min(metrics.totalDistance, traveled + speedMps * elapsed);
      const target = stopDistances[nextStopIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) {
        moveTo(nextStopIndex, now, true, 'に到着');
        frameId = requestAnimationFrame(tick);
        return;
      }
      update(now);
      if (traveled >= metrics.totalDistance) { finish(); return; }
      frameId = requestAnimationFrame(tick);
    }

    document.getElementById('busStart').onclick = () => {
      if (traveled >= metrics.totalDistance) {
        traveled = 0;
        nextStopIndex = 1;
        highlight(0);
        update(performance.now(), true);
      }
      running = true;
      dwellUntil = 0;
      previousTime = null;
      status.textContent = `${routeCfg.label}を始発の${stops[0].name}から走行中です。`;
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(tick);
    };
    document.getElementById('busPause').onclick = () => {
      running = false;
      dwellUntil = 0;
      previousTime = null;
      cancelAnimationFrame(frameId);
      status.textContent = '走行を一時停止しました。';
    };
    previousButton.onclick = () => {
      const index = previousIndex();
      if (index < 0) return;
      const wasRunning = running;
      cancelAnimationFrame(frameId);
      moveTo(index, performance.now(), wasRunning, 'へ戻りました');
      if (wasRunning) frameId = requestAnimationFrame(tick);
    };
    nextButton.onclick = () => {
      if (nextStopIndex >= stops.length) return;
      const wasRunning = running;
      cancelAnimationFrame(frameId);
      moveTo(nextStopIndex, performance.now(), wasRunning, 'へスキップしました');
      if (wasRunning) frameId = requestAnimationFrame(tick);
    };
    document.getElementById('busReset').onclick = () => {
      running = false;
      dwellUntil = 0;
      previousTime = null;
      traveled = 0;
      nextStopIndex = 1;
      cancelAnimationFrame(frameId);
      vehicle.setPosition({ lat: stops[0].lat, lng: stops[0].lng });
      panorama.setPosition({ lat: stops[0].lat, lng: stops[0].lng });
      highlight(0);
      update(performance.now(), true);
      progress.textContent = `始発：${stops[0].name}で待機中｜次：${stops[1]?.name || '終点'}`;
      status.textContent = `始発の${stops[0].name}へ戻しました。`;
    };

    highlight(0);
    updateButtons();
    hokueiAnimationCleanup = () => {
      running = false;
      cancelAnimationFrame(frameId);
      vehicle.setMap(null);
      arrowLine?.setMap(null);
      controls.remove();
      sequence.remove();
      guide.remove();
    };
  }

  async function drawSelectedRoute(route, direction) {
    const status = document.getElementById('mapStatus');
    const routeCfg = cfg(direction);
    try {
      const googleApi = await loadMaps();
      const stops = await resolveStops(route, direction, status);
      const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
        center: { lat: stops[0].lat, lng: stops[0].lng },
        zoom: 14,
        mapTypeControl: false,
        styles: routeStyles(),
      });
      const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
        position: { lat: stops[0].lat, lng: stops[0].lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        motionTracking: false,
        addressControl: true,
      });

      const bounds = new googleApi.maps.LatLngBounds();
      const info = new googleApi.maps.InfoWindow();
      stops.forEach((stop, index) => {
        const position = { lat: stop.lat, lng: stop.lng };
        bounds.extend(position);
        const marker = new googleApi.maps.Marker({
          map,
          position,
          title: `${index + 1}. ${stop.name}（${routeCfg.label}）`,
          icon: createStopMarkerIcon(googleApi, stop),
          zIndex: 500,
        });
        marker.addListener('click', () => {
          panorama.setPosition(position);
          info.setContent(`<strong>${index + 1}. ${esc(stop.name)}</strong><br>${esc(routeCfg.label)}${stop.googleMapsURI ? `<br><a href="${esc(stop.googleMapsURI)}" target="_blank" rel="noopener noreferrer">Google Mapsで確認</a>` : ''}`);
          info.open({ map, anchor: marker });
          status.textContent = `${index + 1}. ${stop.name}｜${routeCfg.label}`;
        });
      });
      map.fitBounds(bounds, 50);

      const routeResult = await getDrivingRoutePath(googleApi, map, stops);
      setupAnimation({
        googleApi,
        map,
        path: routeResult.path,
        stops,
        panorama,
        status,
        arrowLine: routeResult.arrowLine,
        direction,
      });
      status.textContent = `${routeCfg.label}のみ表示中です。反対方向の停留所アイコンは表示していません。`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '北栄線を表示できませんでした。';
    }
  }

  routes = function routesSelectedDirectionV5() {
    const route = ensureData();
    originalRoutesPage();
    if (routeState.routeId !== HOKUEI_ROUTE_ID) return;
    const outboundButton = document.querySelector('[data-dir="outbound"]');
    const inboundButton = document.querySelector('[data-dir="inbound"]');
    if (outboundButton) outboundButton.textContent = '行き（1）';
    if (inboundButton) inboundButton.textContent = '戻り（1-1）';
    const select = document.getElementById('routeSelect');
    if (select && route) select.title = route.description;
  };

  drawRoute = function drawRouteSelectedDirectionV5(route) {
    if (route?.id === HOKUEI_ROUTE_ID) {
      drawSelectedRoute(route, routeState.direction);
      return;
    }
    hokueiAnimationCleanup?.();
    originalDrawRoute(route, route?.[routeState.direction] || []);
  };

  ensureData();
})();