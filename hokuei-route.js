const HOKUEI_ROUTE_ID = 'route-1';
const HOKUEI_DATA_VERSION = '2026-07-18-places-v2';
const HOKUEI_POSITION_SOURCE = 'google-places-bus-stop-v2';
const HOKUEI_CENTER = { lat: 35.6545, lng: 139.9025 };
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
      const hasPlacesPosition =
        existing.positionSource === HOKUEI_POSITION_SOURCE &&
        Number.isFinite(existing.lat) &&
        Number.isFinite(existing.lng);
      return {
        id: existing.id || `hokuei-1-${String(index + 1).padStart(2, '0')}`,
        name,
        address: hasPlacesPosition ? existing.address : `${name} バス停, 浦安市, 千葉県`,
        lat: hasPlacesPosition ? existing.lat : null,
        lng: hasPlacesPosition ? existing.lng : null,
        placeId: hasPlacesPosition ? existing.placeId : null,
        googleMapsURI: hasPlacesPosition ? existing.googleMapsURI : null,
        iconMaskURI: hasPlacesPosition ? existing.iconMaskURI : null,
        iconBackgroundColor: hasPlacesPosition ? existing.iconBackgroundColor : null,
        positionSource: hasPlacesPosition ? existing.positionSource : null,
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

function normalizePlaceName(value = '') {
  return value
    .normalize('NFKC')
    .replace(/[\s　・･()（）「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();
}

function scoreBusStopPlace(place, stopName) {
  if (!place?.location) return -Infinity;
  const wanted = normalizePlaceName(stopName);
  const found = normalizePlaceName(place.displayName || '');
  const types = place.types || [];
  let score = 0;
  if (found === wanted) score += 200;
  else if (found.includes(wanted) || wanted.includes(found)) score += 120;
  if (types.includes('bus_station')) score += 100;
  if (types.includes('transit_station')) score += 70;
  if ((place.formattedAddress || '').includes('浦安市')) score += 50;
  const distance = distanceMeters(HOKUEI_CENTER, {
    lat: place.location.lat(),
    lng: place.location.lng(),
  });
  score -= distance / 250;
  return score;
}

async function searchGoogleBusStop(googleApi, stopName) {
  const { Place } = await googleApi.maps.importLibrary('places');
  const request = {
    textQuery: `${stopName} バス停 浦安市 千葉県`,
    fields: [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'types',
      'primaryType',
      'googleMapsURI',
      'svgIconMaskURI',
      'iconBackgroundColor',
    ],
    locationBias: { center: HOKUEI_CENTER, radius: 9000 },
    language: 'ja',
    region: 'jp',
    maxResultCount: 8,
  };
  const response = await Place.searchByText(request);
  const candidates = (response.places || [])
    .filter((place) => place.location)
    .sort((a, b) => scoreBusStopPlace(b, stopName) - scoreBusStopPlace(a, stopName));
  return candidates[0] || null;
}

async function fallbackGeocodeBusStop(googleApi, stopName) {
  const geocoder = new googleApi.maps.Geocoder();
  const response = await geocoder.geocode({
    address: `${stopName} バス停 浦安市 千葉県`,
    region: 'JP',
    componentRestrictions: { country: 'JP' },
  });
  const result =
    response.results.find((item) => item.formatted_address.includes('浦安市')) ||
    response.results[0];
  if (!result?.geometry?.location) return null;
  return {
    id: null,
    displayName: stopName,
    formattedAddress: result.formatted_address,
    location: result.geometry.location,
    googleMapsURI: null,
    svgIconMaskURI: null,
    iconBackgroundColor: null,
    fallback: true,
  };
}

async function resolveHokueiStopLocations(stops, status) {
  const googleApi = await loadMaps();
  let changed = false;
  let fallbackCount = 0;

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (
      stop.positionSource === HOKUEI_POSITION_SOURCE &&
      Number.isFinite(stop.lat) &&
      Number.isFinite(stop.lng)
    ) continue;

    status.textContent = `Google Mapsのバス停地点を取得中… ${index + 1}/${stops.length} ${stop.name}`;
    let place = null;
    try {
      place = await searchGoogleBusStop(googleApi, stop.name);
    } catch (error) {
      console.warn(`${stop.name}のPlaces検索に失敗しました。`, error);
    }
    if (!place) {
      place = await fallbackGeocodeBusStop(googleApi, stop.name);
      fallbackCount += 1;
    }
    const location = place?.location;
    if (!location) throw new Error(`${stop.name}の位置を取得できませんでした。`);

    stop.lat = location.lat();
    stop.lng = location.lng();
    stop.address = place.formattedAddress || stop.address;
    stop.placeId = place.id || null;
    stop.googleMapsURI = place.googleMapsURI || null;
    stop.iconMaskURI = place.svgIconMaskURI || null;
    stop.iconBackgroundColor = place.iconBackgroundColor || '#1a73e8';
    stop.positionSource = place.fallback ? 'geocoder-fallback' : HOKUEI_POSITION_SOURCE;
    changed = true;
    await sleep(120);
  }

  if (changed) save();
  const validStops = stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  validStops.fallbackCount = fallbackCount;
  return validStops;
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

function headingDegrees(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const toDegrees = (radians) => (radians * 180) / Math.PI;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const y = Math.sin(longitudeDelta) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitudeDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function createMovingArrowLine(googleApi, map, path) {
  return new googleApi.maps.Polyline({
    map,
    path,
    strokeOpacity: 0,
    clickable: false,
    zIndex: 900,
    icons: [
      {
        icon: {
          path: googleApi.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          fillColor: '#e53935',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          scale: 5,
        },
        offset: '0%',
      },
    ],
  });
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
    if (path?.length > 1) {
      return {
        path,
        isRoadRoute: true,
        arrowLine: createMovingArrowLine(googleApi, map, path),
      };
    }
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
  return {
    path,
    isRoadRoute: false,
    arrowLine: createMovingArrowLine(googleApi, map, path),
  };
}

function createBusIcon(googleApi) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22" fill="white" stroke="#0f5ea8" stroke-width="3"/>
      <text x="24" y="32" text-anchor="middle" font-size="25">🚌</text>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleApi.maps.Size(48, 48),
    anchor: new googleApi.maps.Point(24, 24),
  };
}

function createFallbackBusStopIcon(googleApi) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="#1a73e8" stroke="white" stroke-width="2"/>
      <text x="17" y="23" text-anchor="middle" font-size="17">🚏</text>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleApi.maps.Size(34, 34),
    anchor: new googleApi.maps.Point(17, 17),
  };
}

function createStopMarkerIcon(googleApi, stop) {
  if (!stop.iconMaskURI) return createFallbackBusStopIcon(googleApi);
  return {
    url: String(stop.iconMaskURI),
    scaledSize: new googleApi.maps.Size(30, 30),
    anchor: new googleApi.maps.Point(15, 15),
  };
}

function buildPathMetrics(path) {
  const segmentDistances = [];
  const cumulative = [0];
  for (let index = 0; index < path.length - 1; index += 1) {
    const distance = distanceMeters(path[index], path[index + 1]);
    segmentDistances.push(distance);
    cumulative.push(cumulative.at(-1) + distance);
  }
  return { segmentDistances, cumulative, totalDistance: cumulative.at(-1) || 0 };
}

function projectStopToRoute(stop, path, metrics, startSegmentIndex = 0) {
  const referenceLatitude = (stop.lat * Math.PI) / 180;
  const metersPerLatitude = 111320;
  const metersPerLongitude = Math.max(1, Math.cos(referenceLatitude) * 111320);
  let best = { distance: Infinity, routeDistance: 0, segmentIndex: startSegmentIndex };

  for (let index = startSegmentIndex; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const ax = (a.lng - stop.lng) * metersPerLongitude;
    const ay = (a.lat - stop.lat) * metersPerLatitude;
    const bx = (b.lng - stop.lng) * metersPerLongitude;
    const by = (b.lat - stop.lat) * metersPerLatitude;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy || 1;
    const ratio = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
    const px = ax + dx * ratio;
    const py = ay + dy * ratio;
    const distance = Math.hypot(px, py);
    if (distance < best.distance) {
      best = {
        distance,
        routeDistance: metrics.cumulative[index] + metrics.segmentDistances[index] * ratio,
        segmentIndex: index,
      };
    }
  }
  return best;
}

function mapStopsToRouteDistances(stops, path, metrics) {
  let startSegmentIndex = 0;
  return stops.map((stop, index) => {
    if (index === 0) return 0;
    if (index === stops.length - 1) return metrics.totalDistance;
    const projection = projectStopToRoute(stop, path, metrics, startSegmentIndex);
    startSegmentIndex = projection.segmentIndex;
    return projection.routeDistance;
  });
}

function getPositionAtDistance(path, metrics, traveled) {
  let segmentIndex = metrics.cumulative.findIndex((value) => value > traveled) - 1;
  if (segmentIndex < 0) segmentIndex = 0;
  if (segmentIndex >= metrics.segmentDistances.length) {
    segmentIndex = metrics.segmentDistances.length - 1;
  }
  const segmentStart = metrics.cumulative[segmentIndex];
  const segmentLength = metrics.segmentDistances[segmentIndex] || 1;
  const ratio = Math.min(1, Math.max(0, (traveled - segmentStart) / segmentLength));
  return {
    position: interpolatePosition(path[segmentIndex], path[segmentIndex + 1], ratio),
    nextPosition: path[segmentIndex + 1],
    segmentIndex,
  };
}

function setupBusAnimation({
  googleApi,
  map,
  path,
  stops,
  panorama,
  routeStatus,
  arrowLine,
}) {
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

  const vehicleMarker = new googleApi.maps.Marker({
    map,
    position: path[0],
    title: '北栄線 バス（時速6km）',
    icon: createBusIcon(googleApi),
    zIndex: 1000,
  });

  const metrics = buildPathMetrics(path);
  const stopDistances = mapStopsToRouteDistances(stops, path, metrics);
  const speedMetersPerSecond = 6000 / 3600;
  let traveled = 0;
  let running = false;
  let frameId = null;
  let previousTime = null;
  let nextStopIndex = 1;
  let dwellUntil = 0;
  let lastStreetViewUpdate = 0;
  let lastStreetViewDistance = -Infinity;
  let streetViewBusy = false;

  const progress = document.getElementById('busProgress');

  function updateArrow() {
    if (!arrowLine || !metrics.totalDistance) return;
    const icons = arrowLine.get('icons');
    if (!icons?.length) return;
    icons[0].offset = `${Math.min(100, (traveled / metrics.totalDistance) * 100).toFixed(2)}%`;
    arrowLine.set('icons', icons);
  }

  async function updateStreetView(now, force = false) {
    if (streetViewBusy || !panorama || !metrics.totalDistance) return;
    if (!force && now - lastStreetViewUpdate < 1200 && traveled - lastStreetViewDistance < 3) return;
    const current = getPositionAtDistance(path, metrics, traveled);
    streetViewBusy = true;
    try {
      panorama.setPosition(current.position);
      panorama.setPov({
        heading: headingDegrees(current.position, current.nextPosition),
        pitch: 0,
      });
      lastStreetViewUpdate = now;
      lastStreetViewDistance = traveled;
    } finally {
      streetViewBusy = false;
    }
  }

  function updateVehicle(now, forceStreetView = false) {
    if (!metrics.totalDistance) return;
    const current = getPositionAtDistance(path, metrics, traveled);
    vehicleMarker.setPosition(current.position);
    updateArrow();
    updateStreetView(now, forceStreetView);
    const nextStop = stops[nextStopIndex];
    progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(metrics.totalDistance / 1000).toFixed(2)}km｜時速6km${nextStop ? `｜次：${nextStop.name}` : ''}`;
  }

  function completeRoute() {
    running = false;
    traveled = metrics.totalDistance;
    updateVehicle(performance.now(), true);
    progress.textContent = `浦安駅入口に到着｜総距離 ${(metrics.totalDistance / 1000).toFixed(2)}km`;
    routeStatus.textContent = '北栄線 系統1の走行を完了しました。';
  }

  function tick(now) {
    if (!running) return;

    if (dwellUntil) {
      if (now < dwellUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
        const stop = stops[Math.max(0, nextStopIndex - 1)];
        progress.textContent = `${stop?.name || 'バス停'}で停車中｜あと${remainingSeconds}秒`;
        frameId = requestAnimationFrame(tick);
        return;
      }
      dwellUntil = 0;
      previousTime = now;
      if (traveled >= metrics.totalDistance) {
        completeRoute();
        return;
      }
      routeStatus.textContent = 'バス停を出発しました。時速6kmで走行中です。';
    }

    if (previousTime === null) previousTime = now;
    const elapsedSeconds = Math.min((now - previousTime) / 1000, 1);
    previousTime = now;
    const previousDistance = traveled;
    traveled = Math.min(metrics.totalDistance, traveled + speedMetersPerSecond * elapsedSeconds);

    const targetStopDistance = stopDistances[nextStopIndex];
    if (
      Number.isFinite(targetStopDistance) &&
      previousDistance < targetStopDistance &&
      traveled >= targetStopDistance
    ) {
      traveled = targetStopDistance;
      const arrivedStop = stops[nextStopIndex];
      nextStopIndex += 1;
      updateVehicle(now, true);
      panorama.setPosition({ lat: arrivedStop.lat, lng: arrivedStop.lng });
      dwellUntil = now + 5000;
      routeStatus.textContent = `${arrivedStop.name}に到着。5秒間停車します。`;
      frameId = requestAnimationFrame(tick);
      return;
    }

    updateVehicle(now);
    if (traveled >= metrics.totalDistance) {
      completeRoute();
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  document.getElementById('busStart').onclick = () => {
    if (traveled >= metrics.totalDistance) {
      traveled = 0;
      nextStopIndex = 1;
    }
    running = true;
    dwellUntil = 0;
    previousTime = null;
    routeStatus.textContent = 'バス・矢印・Street Viewを時速6kmで連動中です。';
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(tick);
  };

  document.getElementById('busPause').onclick = () => {
    running = false;
    previousTime = null;
    dwellUntil = 0;
    cancelAnimationFrame(frameId);
    routeStatus.textContent = '走行を一時停止しました。';
  };

  document.getElementById('busReset').onclick = () => {
    running = false;
    previousTime = null;
    dwellUntil = 0;
    traveled = 0;
    nextStopIndex = 1;
    cancelAnimationFrame(frameId);
    vehicleMarker.setPosition(path[0]);
    updateArrow();
    panorama.setPosition(path[0]);
    progress.textContent = '新浦安駅で待機中';
    routeStatus.textContent = '停留所ピンを押すと下半分にStreet Viewを表示します。';
  };

  hokueiAnimationCleanup = () => {
    running = false;
    cancelAnimationFrame(frameId);
    vehicleMarker.setMap(null);
    arrowLine?.setMap(null);
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
      motionTracking: false,
      addressControl: true,
    });

    const bounds = new googleApi.maps.LatLngBounds();
    const infoWindow = new googleApi.maps.InfoWindow();
    validStops.forEach((stop, index) => {
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      const marker = new googleApi.maps.Marker({
        map,
        position,
        title: `${index + 1}. ${stop.name}`,
        icon: createStopMarkerIcon(googleApi, stop),
        zIndex: 500,
      });
      marker.addListener('click', () => {
        panorama.setPosition(position);
        const sourceLabel =
          stop.positionSource === HOKUEI_POSITION_SOURCE
            ? 'Google Mapsのバス停地点'
            : '住所検索による暫定地点';
        const mapLink = stop.googleMapsURI
          ? `<br><a href="${esc(stop.googleMapsURI)}" target="_blank" rel="noopener noreferrer">Google Mapsで確認</a>`
          : '';
        infoWindow.setContent(
          `<strong>${index + 1}. ${esc(stop.name)}</strong><br>${esc(sourceLabel)}${mapLink}`,
        );
        infoWindow.open({ map, anchor: marker });
        status.textContent = `${index + 1}. ${stop.name}${stop.address ? `｜${stop.address}` : ''}`;
      });
    });
    map.fitBounds(bounds, 50);

    const routeResult = await getDrivingRoutePath(googleApi, map, validStops);
    setupBusAnimation({
      googleApi,
      map,
      path: routeResult.path,
      stops: validStops,
      panorama,
      routeStatus: status,
      arrowLine: routeResult.arrowLine,
    });
    const fallbackNotice = validStops.fallbackCount
      ? ` ${validStops.fallbackCount}地点はPlacesで見つからず暫定位置です。`
      : '';
    status.textContent = routeResult.isRoadRoute
      ? `北栄線 系統1を道路に沿って表示しました。赤い矢印・車両・Street Viewが連動します。${fallbackNotice}`
      : `停留所位置は取得済みです。道路ルート取得にはDirections APIが必要です。${fallbackNotice}`;
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