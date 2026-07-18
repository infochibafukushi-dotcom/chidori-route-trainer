const HOKUEI_ROUTE_ID = 'route-1';
const HOKUEI_DATA_VERSION = '2026-07-18-system-1';
const HOKUEI_STOPS = [
  '新浦安駅',
  '入船東団地',
  '入船五丁目',
  '入船六丁目',
  '浦安警察署',
  '美浜北小学校',
  '美浜中学校',
  '海楽東児童公園',
  '浦安高校前',
  '海楽西児童公園',
  '消防本部前',
  '砂田橋',
  '北栄四丁目',
  '北栄大三角線',
  '北栄中央',
  '北栄三丁目',
  '北栄一丁目',
  '浦安駅東口',
  '浦安駅入口',
];

const originalRoutesPage = routes;
const originalDrawRoute = drawRoute;
let hokueiAnimationCleanup = null;

function ensureHokueiRouteData() {
  const route = data.routes.find((item) => item.id === HOKUEI_ROUTE_ID);
  if (!route) return null;

  const existingByName = new Map(
    [...(route.outbound || []), ...(route.inbound || [])].map((stop) => [stop.name, stop]),
  );

  if (
    route.hokueiDataVersion !== HOKUEI_DATA_VERSION ||
    route.outbound?.length !== HOKUEI_STOPS.length
  ) {
    route.outbound = HOKUEI_STOPS.map((name, index) => {
      const existing = existingByName.get(name) || {};
      return {
        id: existing.id || `hokuei-1-${String(index + 1).padStart(2, '0')}`,
        name,
        address: existing.address || `${name} バス停, 浦安市, 千葉県`,
        lat: Number.isFinite(existing.lat) ? existing.lat : null,
        lng: Number.isFinite(existing.lng) ? existing.lng : null,
      };
    });
    route.inbound = [];
    route.hokueiDataVersion = HOKUEI_DATA_VERSION;
    route.description = '系統1 新浦安駅 → 浦安駅入口';
    route.sourceUrl = 'https://mb.jorudan.co.jp/os/bus/1274/line/63299.html';
    save();
  }
  return route;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveHokueiStopLocations(stops, status) {
  const googleApi = await loadMaps();
  const geocoder = new googleApi.maps.Geocoder();
  let changed = false;

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) continue;

    status.textContent = `Googleマップからバス停位置を確認中… ${index + 1}/${stops.length} ${stop.name}`;
    const query = `${stop.name} バス停 浦安市 千葉県`;
    const response = await geocoder.geocode({
      address: query,
      region: 'JP',
      componentRestrictions: { country: 'JP' },
    });

    const result =
      response.results.find((item) => item.formatted_address.includes('浦安市')) ||
      response.results[0];
    const location = result?.geometry?.location;
    if (!location) throw new Error(`${stop.name}の位置を取得できませんでした。`);

    stop.lat = location.lat();
    stop.lng = location.lng();
    stop.address = result.formatted_address || stop.address;
    changed = true;
    await sleep(180);
  }

  if (changed) save();
  return stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

function distanceMeters(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitude1 = toRadians(a.lat);
  const latitude2 = toRadians(b.lat);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function interpolatePosition(a, b, ratio) {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lng: a.lng + (b.lng - a.lng) * ratio,
  };
}

async function getDrivingRoutePath(googleApi, map, stops) {
  try {
    const { DirectionsService, DirectionsRenderer } = await googleApi.maps.importLibrary('routes');
    const directionsService = new DirectionsService();
    const result = await directionsService.route({
      origin: { lat: stops[0].lat, lng: stops[0].lng },
      destination: { lat: stops.at(-1).lat, lng: stops.at(-1).lng },
      waypoints: stops.slice(1, -1).map((stop) => ({
        location: { lat: stop.lat, lng: stop.lng },
        stopover: true,
      })),
      optimizeWaypoints: false,
      travelMode: googleApi.maps.TravelMode.DRIVING,
      avoidFerries: true,
    });

    const renderer = new DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: '#0f5ea8',
        strokeOpacity: 0.9,
        strokeWeight: 6,
      },
    });
    renderer.setDirections(result);

    const path = result.routes[0]?.overview_path?.map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    }));
    if (path?.length > 1) return { path, isRoadRoute: true };
  } catch (error) {
    console.warn('道路ルートの取得に失敗したため停留所間を直線表示します。', error);
  }

  const path = stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  new googleApi.maps.Polyline({
    map,
    path,
    strokeColor: '#0f5ea8',
    strokeOpacity: 0.9,
    strokeWeight: 6,
  });
  return { path, isRoadRoute: false };
}

function createBusIcon(googleApi) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">
      <circle cx="23" cy="23" r="21" fill="white" stroke="#0f5ea8" stroke-width="3"/>
      <text x="23" y="30" text-anchor="middle" font-size="24">🚌</text>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleApi.maps.Size(46, 46),
    anchor: new googleApi.maps.Point(23, 23),
  };
}

function setupBusAnimation(googleApi, map, path, routeStatus) {
  hokueiAnimationCleanup?.();

  const oldControls = document.getElementById('hokueiBusControls');
  oldControls?.remove();

  const controls = document.createElement('div');
  controls.id = 'hokueiBusControls';
  controls.className = 'bus-controls';
  controls.innerHTML = `
    <button type="button" id="busStart" class="primary bus-control-button">▶ 6km/hで走行</button>
    <button type="button" id="busPause" class="secondary bus-control-button">一時停止</button>
    <button type="button" id="busReset" class="secondary bus-control-button">最初に戻す</button>
    <span id="busProgress" class="bus-progress">新浦安駅で待機中</span>`;

  const split = document.querySelector('.split');
  split?.insertAdjacentElement('afterend', controls);

  const marker = new googleApi.maps.Marker({
    map,
    position: path[0],
    title: '北栄線 バス（時速6km）',
    icon: createBusIcon(googleApi),
    zIndex: 1000,
  });

  const segmentDistances = [];
  const cumulative = [0];
  for (let index = 0; index < path.length - 1; index += 1) {
    const distance = distanceMeters(path[index], path[index + 1]);
    segmentDistances.push(distance);
    cumulative.push(cumulative.at(-1) + distance);
  }
  const totalDistance = cumulative.at(-1) || 0;
  const speedMetersPerSecond = 6000 / 3600;
  let traveled = 0;
  let running = false;
  let frameId = null;
  let previousTime = null;

  const progress = document.getElementById('busProgress');

  function updateMarker() {
    if (!totalDistance) return;
    let segmentIndex = cumulative.findIndex((value) => value > traveled) - 1;
    if (segmentIndex < 0) segmentIndex = 0;
    if (segmentIndex >= segmentDistances.length) segmentIndex = segmentDistances.length - 1;
    const segmentStart = cumulative[segmentIndex];
    const segmentLength = segmentDistances[segmentIndex] || 1;
    const ratio = Math.min(1, Math.max(0, (traveled - segmentStart) / segmentLength));
    marker.setPosition(interpolatePosition(path[segmentIndex], path[segmentIndex + 1], ratio));
    progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(totalDistance / 1000).toFixed(2)}km｜時速6km`;
  }

  function tick(now) {
    if (!running) return;
    if (previousTime === null) previousTime = now;
    const elapsedSeconds = Math.min((now - previousTime) / 1000, 1);
    previousTime = now;
    traveled = Math.min(totalDistance, traveled + speedMetersPerSecond * elapsedSeconds);
    updateMarker();
    if (traveled >= totalDistance) {
      running = false;
      progress.textContent = `浦安駅入口に到着｜総距離 ${(totalDistance / 1000).toFixed(2)}km`;
      routeStatus.textContent = '北栄線 系統1の走行を完了しました。';
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  document.getElementById('busStart').onclick = () => {
    if (traveled >= totalDistance) traveled = 0;
    running = true;
    previousTime = null;
    routeStatus.textContent = 'バスを実速度の時速6kmで走行中です。';
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(tick);
  };

  document.getElementById('busPause').onclick = () => {
    running = false;
    previousTime = null;
    cancelAnimationFrame(frameId);
    routeStatus.textContent = '走行を一時停止しました。';
  };

  document.getElementById('busReset').onclick = () => {
    running = false;
    previousTime = null;
    traveled = 0;
    cancelAnimationFrame(frameId);
    marker.setPosition(path[0]);
    progress.textContent = '新浦安駅で待機中';
    routeStatus.textContent = '停留所ピンを押すと下半分にStreet Viewを表示します。';
  };

  hokueiAnimationCleanup = () => {
    running = false;
    cancelAnimationFrame(frameId);
    marker.setMap(null);
    controls.remove();
  };
}

async function drawHokueiRoute(route, stops) {
  const status = document.getElementById('mapStatus');
  try {
    const googleApi = await loadMaps();
    const validStops = await resolveHokueiStopLocations(stops, status);
    if (validStops.length !== HOKUEI_STOPS.length) {
      throw new Error('北栄線の全停留所位置を取得できませんでした。');
    }

    const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
      center: { lat: validStops[0].lat, lng: validStops[0].lng },
      zoom: 14,
      mapTypeControl: false,
    });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
      position: { lat: validStops[0].lat, lng: validStops[0].lng },
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
    });

    const bounds = new googleApi.maps.LatLngBounds();
    validStops.forEach((stop, index) => {
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      const marker = new googleApi.maps.Marker({
        map,
        position,
        label: String(index + 1),
        title: stop.name,
      });
      marker.addListener('click', () => {
        panorama.setPosition(position);
        status.textContent = `${index + 1}. ${stop.name}${stop.address ? `｜${stop.address}` : ''}`;
      });
    });
    map.fitBounds(bounds, 50);

    const routeResult = await getDrivingRoutePath(googleApi, map, validStops);
    setupBusAnimation(googleApi, map, routeResult.path, status);
    status.textContent = routeResult.isRoadRoute
      ? '北栄線 系統1を道路に沿って表示しました。停留所ピンでStreet Viewを確認できます。'
      : '停留所位置は取得済みです。道路ルート取得にはGoogle Directions APIの有効化が必要です。';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '北栄線を表示できませんでした。';
  }
}

routes = function enhancedRoutesPage() {
  const route = ensureHokueiRouteData();
  if (routeState.routeId === HOKUEI_ROUTE_ID && routeState.direction === 'inbound') {
    routeState.direction = 'outbound';
  }
  originalRoutesPage();

  if (routeState.routeId === HOKUEI_ROUTE_ID) {
    const inboundButton = document.querySelector('[data-dir="inbound"]');
    if (inboundButton) {
      inboundButton.disabled = true;
      inboundButton.textContent = '復路は1-1・1-3系統';
      inboundButton.title = '系統1は新浦安駅から浦安駅入口までの片方向です。';
    }
    const routeSelect = document.getElementById('routeSelect');
    if (routeSelect && route) routeSelect.title = route.description;
  }
};

drawRoute = function enhancedDrawRoute(route, stops) {
  if (route?.id === HOKUEI_ROUTE_ID && routeState.direction === 'outbound') {
    drawHokueiRoute(route, stops);
    return;
  }
  hokueiAnimationCleanup?.();
  originalDrawRoute(route, stops);
};

ensureHokueiRouteData();