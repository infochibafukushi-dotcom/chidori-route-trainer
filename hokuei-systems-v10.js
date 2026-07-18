(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-18-hokuei-systems-v10';
  const SYSTEM_KEY = 'chidori-hokuei-system-v10';
  const SPEED_KMH = 15;
  const DWELL_MS = 5000;
  const S = (name, lat, lng, note = '') => ({ name, lat, lng, note });

  const COMMON_OUT = [
    S('新浦安駅',35.650395,139.912384,'始発'),S('入船東団地',35.652150,139.911364),
    S('入船五丁目',35.653457,139.910398),S('入船六丁目',35.654877,139.909384),
    S('浦安警察署',35.656950,139.907954),S('美浜北小学校',35.658250,139.907038),
    S('美浜中学校',35.659350,139.906232),S('海楽東児童公園',35.660721,139.905220),
    S('浦安高校前',35.662137,139.904221),S('海楽西児童公園',35.663110,139.903490),
    S('消防本部前',35.664426,139.902506),S('砂田橋',35.665301,139.901869),
    S('北栄四丁目',35.666196,139.901004),S('北栄大三角線',35.667232,139.899778),
    S('北栄中央',35.668512,139.898492,'1回目・浦安駅方向'),S('北栄三丁目',35.669865,139.896172),
    S('北栄一丁目',35.670693,139.894371),S('浦安駅東口',35.666358,139.891390),
  ];

  const COMMON_RETURN = [
    S('北栄北',35.669640,139.894562),S('北栄第二街区公園',35.668630,139.896420),
    S('北栄二丁目',35.667923,139.897451),S('北部幼稚園入口',35.667512,139.898425),
    S('北栄中央',35.668388,139.898622,'2回目・新浦安駅方向'),
    S('北栄大三角線',35.667084,139.899933,'2回目・新浦安駅方向'),
    S('北栄四丁目',35.666060,139.901150,'2回目・新浦安駅方向'),
    S('砂田橋',35.665171,139.902010,'2回目・新浦安駅方向'),
    S('消防本部前',35.664278,139.902652,'2回目・新浦安駅方向'),
    S('海楽西児童公園',35.662970,139.903630,'2回目・新浦安駅方向'),
    S('浦安高校前',35.661985,139.904368,'2回目・新浦安駅方向'),
    S('海楽東児童公園',35.660570,139.905370,'2回目・新浦安駅方向'),
    S('美浜中学校',35.659220,139.906380,'2回目・新浦安駅方向'),
    S('美浜北小学校',35.658110,139.907180,'2回目・新浦安駅方向'),
    S('浦安警察署',35.656820,139.908101,'2回目・新浦安駅方向'),
    S('入船六丁目',35.654750,139.909530,'2回目・新浦安駅方向'),
    S('入船五丁目',35.653310,139.910540,'2回目・新浦安駅方向'),
    S('入船東団地',35.652010,139.911510,'2回目・新浦安駅方向'),
    S('新浦安駅',35.650395,139.912384,'終点'),
  ];

  const DEFINITIONS = {
    '1-1': {
      code: '1-1', title: '北栄循環（医療センター非経由）',
      summary: '新浦安駅 → 浦安駅東口 → 北栄二丁目 → 新浦安駅',
      officialSource: '京成バスナビ：新浦安駅・系統1-1',
      stops: [...COMMON_OUT,S('当代島',35.668580,139.892461),...COMMON_RETURN],
    },
    '1-3': {
      code: '1-3', title: '北栄循環（東京ベイ医療センター経由）',
      summary: '新浦安駅 → 浦安駅東口 → 東京ベイ医療センター → 新浦安駅',
      officialSource: '京成バスナビ：東京ベイ医療センター・系統1-3',
      stops: [...COMMON_OUT,S('当代島',35.668580,139.892461),
        S('東京ベイ医療センター入口',35.670643,139.891890),
        S('東京ベイ医療センター',35.671389,139.892528),...COMMON_RETURN],
    },
    '1-5': {
      code: '1-5', title: '浦安駅入口行き（区間運行）',
      summary: '新浦安駅 → 浦安駅東口 → 浦安駅入口',
      officialSource: '京成バスナビ：新浦安駅・浦安駅入口行き',
      stops: [...COMMON_OUT,S('浦安駅入口',35.665225,139.890694,'終点')],
    },
  };

  const displayName = (stop) => `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;
  const currentCode = () => localStorage.getItem(SYSTEM_KEY) || '1-1';
  const setCurrentCode = (code) => localStorage.setItem(SYSTEM_KEY, DEFINITIONS[code] ? code : '1-1');

  function cloneStops(code) {
    return DEFINITIONS[code].stops.map((stop, index) => ({
      id: `hokuei-${code.replace('-','')}-${String(index + 1).padStart(2,'0')}`,
      name: stop.name,
      note: stop.note || '',
      address: `${stop.name} バス停, 浦安市, 千葉県`,
      lat: stop.lat,
      lng: stop.lng,
      order: index + 1,
      manualPosition: true,
      positionSource: `${VERSION}:${code}:${index}`,
    }));
  }

  function ensureSystems() {
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route) return null;
    if (route.hokueiSystemsVersion !== VERSION || !route.systems?.['1-1'] || !route.systems?.['1-3'] || !route.systems?.['1-5']) {
      route.systems = Object.fromEntries(Object.keys(DEFINITIONS).map((code) => [code, {
        code,
        title: DEFINITIONS[code].title,
        summary: DEFINITIONS[code].summary,
        officialSource: DEFINITIONS[code].officialSource,
        stops: cloneStops(code),
      }]));
      route.hokueiSystemsVersion = VERSION;
      route.description = '北栄線：系統1-1・1-3・1-5';
      route.outbound = route.systems['1-1'].stops;
      route.inbound = [];
      save();
    }
    return route;
  }

  function system(route, code = currentCode()) {
    return route?.systems?.[code] || route?.systems?.['1-1'] || null;
  }

  async function roadPath(googleApi, stops) {
    const service = new googleApi.maps.DirectionsService();
    const full = [];
    for (let start = 0; start < stops.length - 1; start += 21) {
      const end = Math.min(start + 21, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      const result = await service.route({
        origin: { lat: segment[0].lat, lng: segment[0].lng },
        destination: { lat: segment.at(-1).lat, lng: segment.at(-1).lng },
        waypoints: segment.slice(1, -1).map((stop) => ({ location: { lat: stop.lat, lng: stop.lng }, stopover: true })),
        optimizeWaypoints: false,
        travelMode: googleApi.maps.TravelMode.DRIVING,
        avoidFerries: true,
      });
      const path = result.routes[0]?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (full.length && path.length) path.shift();
      full.push(...path);
    }
    return full.length > 1 ? full : stops.map(({ lat, lng }) => ({ lat, lng }));
  }

  function markerIcon(googleApi, index) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><circle cx="17" cy="17" r="15" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="17" y="22" text-anchor="middle" font-size="12" font-family="sans-serif" font-weight="700" fill="#0f5ea8">${index + 1}</text></svg>`;
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(34,34), anchor: new googleApi.maps.Point(17,17) };
  }

  function sequenceCard(stops, selected) {
    document.getElementById('routeSequence')?.remove();
    const box = document.createElement('section');
    box.id = 'routeSequence';
    box.className = 'route-sequence-card';
    box.innerHTML = `<div class="route-sequence-title">系統${selected.code}｜${esc(selected.title)}｜全${stops.length}停留所</div><div class="route-sequence">${stops.map((stop,index) => `<span class="route-sequence-stop" data-sequence-index="${index}">${index + 1}. ${esc(displayName(stop))}</span>${index < stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    document.getElementById('hokueiBusControls')?.insertAdjacentElement('afterend', box);
    return box;
  }

  function setupAnimation({ googleApi, map, panorama, path, stops, status, selected, line }) {
    hokueiAnimationCleanup?.();
    document.getElementById('hokueiBusControls')?.remove();
    document.getElementById('routeSequence')?.remove();
    const controls = document.createElement('div');
    controls.id = 'hokueiBusControls';
    controls.className = 'bus-controls';
    controls.innerHTML = `<button id="busStart" class="primary bus-control-button">▶ ${SPEED_KMH}km/hで走行</button><button id="busPause" class="secondary bus-control-button">一時停止</button><button id="busPrevious" class="secondary bus-control-button">前の停留所</button><button id="busNext" class="secondary bus-control-button">次の停留所</button><button id="busReset" class="secondary bus-control-button">始発に戻す</button><span id="busProgress" class="bus-progress">始発：${esc(stops[0].name)}で待機中</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);
    const sequence = sequenceCard(stops, selected);
    const vehicle = new googleApi.maps.Marker({ map, position: path[0], icon: createBusIcon(googleApi), zIndex: 1000, title: `北栄線 系統${selected.code}` });
    const metrics = buildPathMetrics(path);
    const stopDistances = mapStopsToRouteDistances(stops, path, metrics);
    stopDistances[0] = 0;
    stopDistances[stopDistances.length - 1] = metrics.totalDistance;
    const progress = document.getElementById('busProgress');
    const previous = document.getElementById('busPrevious');
    const next = document.getElementById('busNext');
    let traveled = 0, nextIndex = 1, running = false, frame = null, previousTime = null, dwellUntil = 0;
    const speed = SPEED_KMH * 1000 / 3600;
    const currentIndex = () => Math.max(0, nextIndex - 1);
    const highlight = (index) => document.querySelectorAll('[data-sequence-index]').forEach((el) => el.classList.toggle('active', Number(el.dataset.sequenceIndex) === index));
    const updateButtons = () => {
      const p = stops[Math.max(0, currentIndex() - 1)];
      const n = stops[nextIndex];
      previous.disabled = currentIndex() === 0;
      previous.textContent = currentIndex() === 0 ? '前の停留所なし' : `前へ：${p.name}`;
      next.disabled = !n;
      next.textContent = n ? `次へ：${n.name}` : '終点に到着';
    };
    const update = (now, force = false) => {
      const current = getPositionAtDistance(path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (force || !update.last || now - update.last > 900) {
        panorama.setPosition(current.position);
        panorama.setPov({ heading: headingDegrees(current.position, current.nextPosition), pitch: 0 });
        update.last = now;
      }
      progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(metrics.totalDistance / 1000).toFixed(2)}km｜系統${selected.code}${stops[nextIndex] ? `｜次：${stops[nextIndex].name}` : '｜終点'}`;
      updateButtons();
    };
    const moveTo = (index, keepRunning, wording) => {
      if (index < 0 || index >= stops.length) return;
      traveled = stopDistances[index];
      nextIndex = index + 1;
      previousTime = null;
      update(performance.now(), true);
      highlight(index);
      if (keepRunning) {
        dwellUntil = performance.now() + DWELL_MS;
        status.textContent = `${displayName(stops[index])}に到着。5秒間停車します。`;
      } else {
        progress.textContent = `${displayName(stops[index])}${wording}${stops[nextIndex] ? `｜次：${stops[nextIndex].name}` : '｜終点'}`;
      }
    };
    const finish = () => {
      running = false;
      traveled = metrics.totalDistance;
      nextIndex = stops.length;
      update(performance.now(), true);
      highlight(stops.length - 1);
      status.textContent = `北栄線 系統${selected.code}の走行を完了しました。`;
    };
    const tick = (now) => {
      if (!running) return;
      if (dwellUntil && now < dwellUntil) { frame = requestAnimationFrame(tick); return; }
      if (dwellUntil) { dwellUntil = 0; previousTime = now; }
      if (previousTime === null) previousTime = now;
      const before = traveled;
      traveled = Math.min(metrics.totalDistance, traveled + speed * Math.min((now - previousTime) / 1000, 1));
      previousTime = now;
      const target = stopDistances[nextIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) { moveTo(nextIndex, true, 'に到着'); frame = requestAnimationFrame(tick); return; }
      update(now);
      if (traveled >= metrics.totalDistance) { finish(); return; }
      frame = requestAnimationFrame(tick);
    };
    document.getElementById('busStart').onclick = () => { if (traveled >= metrics.totalDistance) moveTo(0, false, ''); running = true; dwellUntil = 0; previousTime = null; cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); };
    document.getElementById('busPause').onclick = () => { running = false; dwellUntil = 0; cancelAnimationFrame(frame); status.textContent = '走行を一時停止しました。'; };
    previous.onclick = () => { const target = Math.max(0, currentIndex() - 1); const keep = running; cancelAnimationFrame(frame); moveTo(target, keep, 'へ戻りました'); if (keep) frame = requestAnimationFrame(tick); };
    next.onclick = () => { if (nextIndex >= stops.length) return; const keep = running; cancelAnimationFrame(frame); moveTo(nextIndex, keep, 'へ移動しました'); if (keep) frame = requestAnimationFrame(tick); };
    document.getElementById('busReset').onclick = () => { running = false; cancelAnimationFrame(frame); traveled = 0; nextIndex = 1; highlight(0); update(performance.now(), true); status.textContent = `始発の${stops[0].name}へ戻しました。`; };
    highlight(0); updateButtons();
    hokueiAnimationCleanup = () => { running = false; cancelAnimationFrame(frame); vehicle.setMap(null); line?.setMap(null); controls.remove(); sequence.remove(); };
  }

  async function drawSystemRoute(route) {
    const status = document.getElementById('mapStatus');
    const selected = system(route);
    if (!selected) return;
    const stops = selected.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    try {
      const googleApi = await loadMaps();
      const map = new googleApi.maps.Map(document.getElementById('routeMap'), { center: { lat: stops[0].lat, lng: stops[0].lng }, zoom: 14, mapTypeControl: false, styles: [{ featureType: 'transit.station.bus', elementType: 'labels', stylers: [{ visibility: 'off' }] }] });
      const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), { position: { lat: stops[0].lat, lng: stops[0].lng }, pov: { heading: 0, pitch: 0 }, zoom: 1, motionTracking: false });
      const bounds = new googleApi.maps.LatLngBounds();
      const info = new googleApi.maps.InfoWindow();
      stops.forEach((stop,index) => {
        const position = { lat: stop.lat, lng: stop.lng };
        bounds.extend(position);
        const marker = new googleApi.maps.Marker({ map, position, title: `${index + 1}. ${displayName(stop)}`, icon: markerIcon(googleApi,index), zIndex: 500 });
        marker.addListener('click', () => { panorama.setPosition(position); info.setContent(`<strong>${index + 1}. ${esc(displayName(stop))}</strong><br>系統${selected.code}`); info.open({ map, anchor: marker }); });
      });
      map.fitBounds(bounds, 50);
      status.textContent = `系統${selected.code}の道路ルートを取得中…`;
      const path = await roadPath(googleApi, stops);
      const line = new googleApi.maps.Polyline({ map, path, strokeColor: '#0f5ea8', strokeOpacity: .9, strokeWeight: 6 });
      setupAnimation({ googleApi, map, panorama, path, stops, status, selected, line });
      status.textContent = `北栄線 系統${selected.code}｜${selected.title}｜${selected.summary}`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '北栄線を表示できませんでした。';
    }
  }

  const previousRoutes = routes;
  const previousDrawRoute = drawRoute;
  drawRoute = function drawHokueiSystem(route, stops) {
    if (route?.id === ROUTE_ID) { drawSystemRoute(ensureSystems()); return; }
    hokueiAnimationCleanup?.();
    previousDrawRoute(route, stops);
  };

  routes = function routesWithSystemSelector() {
    ensureSystems();
    if (routeState.routeId === ROUTE_ID) routeState.direction = 'outbound';
    previousRoutes();
    if (routeState.routeId !== ROUTE_ID) return;
    const controls = document.querySelector('.controls');
    const routeSelect = document.getElementById('routeSelect');
    const directionButtons = controls?.querySelector('.seg');
    if (directionButtons) directionButtons.hidden = true;
    if (controls && routeSelect && !document.getElementById('hokueiSystemSelect')) {
      const label = document.createElement('label');
      label.className = 'hokuei-system-label';
      label.innerHTML = `系統<select id="hokueiSystemSelect">${Object.values(DEFINITIONS).map((item) => `<option value="${item.code}" ${item.code === currentCode() ? 'selected' : ''}>${item.code}｜${esc(item.title)}</option>`).join('')}</select>`;
      routeSelect.closest('label')?.insertAdjacentElement('afterend', label);
      label.querySelector('select').onchange = (event) => { setCurrentCode(event.target.value); routes(); };
    }
  };

  window.HOKUEI_SYSTEMS_API = { ROUTE_ID, VERSION, DEFINITIONS, ensureSystems, system, currentCode, setCurrentCode, displayName };
  ensureSystems();
  setTimeout(ensureSystems, 3500);
})();