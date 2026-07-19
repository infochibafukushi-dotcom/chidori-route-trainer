(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-18-authoritative-v12';
  const SYSTEM_STORAGE_KEY = 'chidori-hokuei-system-v12';
  const LEGACY_SYSTEM_KEY = 'chidori-hokuei-system-v10';
  const OSM_API_BASE = 'https://openstreetmap.tools/public_transport_geojson/api/route/';
  const OFFICIAL_ROUTE_MAP = 'https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf';
  const OFFICIAL_BUS_NAVI = 'https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619';
  const CHIBA_BUS_ASSOCIATION = 'https://www.chiba-bus-kyokai.or.jp/app/routebusstop/busstop/stopid/12-32107';
  const SPEED_KMH = 15;
  const DWELL_MS = 5000;
  const MAX_SEGMENT_STOPS = 8;

  const COMMON_OUT = [
    '新浦安駅', '入船東団地', '入船五丁目', '入船六丁目', '浦安警察署',
    '美浜北小学校', '美浜中学校', '海楽東児童公園', '浦安高校前',
    '海楽西児童公園', '消防本部前', '砂田橋', '北栄四丁目',
    '北栄大三角線', '北栄中央', '北栄三丁目', '北栄一丁目', '浦安駅東口',
  ];
  const COMMON_RETURN = [
    '北栄北', '北栄第二街区公園', '北栄二丁目', '北部幼稚園入口',
    '北栄中央', '北栄大三角線', '北栄四丁目', '砂田橋', '消防本部前',
    '海楽西児童公園', '浦安高校前', '海楽東児童公園', '美浜中学校',
    '美浜北小学校', '浦安警察署', '入船六丁目', '入船五丁目',
    '入船東団地', '新浦安駅',
  ];

  const SYSTEM_DEFINITIONS = {
    '1': {
      code: '1',
      title: '浦安駅入口行き（夜間区間運行）',
      summary: '新浦安駅 → 浦安駅東口 → 浦安駅入口',
      relationId: 18354842,
      jorudanUrl: 'https://mb.jorudan.co.jp/os/bus/1274/line/63299.html',
      names: [...COMMON_OUT, '浦安駅入口'],
    },
    '1-1': {
      code: '1-1',
      title: '北栄循環（医療センター非経由）',
      summary: '新浦安駅 → 浦安駅東口 → 当代島 → 北栄二丁目 → 新浦安駅',
      relationId: 18354840,
      jorudanUrl: 'https://mb.jorudan.co.jp/os/bus/1274/line/63263.html',
      names: [...COMMON_OUT, '当代島', ...COMMON_RETURN],
    },
    '1-3': {
      code: '1-3',
      title: '北栄循環（東京ベイ医療センター経由）',
      summary: '新浦安駅 → 浦安駅東口 → 東京ベイ医療センター → 北栄二丁目 → 新浦安駅',
      relationId: 18354837,
      jorudanUrl: 'https://mb.jorudan.co.jp/os/bus/1274/line/63311.html',
      names: [
        ...COMMON_OUT, '当代島', '東京ベイ医療センター入口',
        '東京ベイ医療センター', ...COMMON_RETURN,
      ],
    },
  };

  const originalRoutesPage = routes;
  const originalDrawRoute = drawRoute;
  const originalStopEditor = stopEditor;
  let activeDrawToken = 0;
  let animationCleanup = null;
  let editorMapCleanup = null;
  let settingsRouteId = ROUTE_ID;
  let settingsMode = getSelectedSystemCode();
  const resolving = new Map();

  function normalize(value = '') {
    return String(value)
      .normalize('NFKC')
      .replace(/（.*?）|\(.*?\)/g, '')
      .replace(/[\s　・･「」『』]/g, '')
      .replace(/バス停留所|バス停|停留所/g, '')
      .replace(/〈.*?〉|<.*?>/g, '')
      .toLowerCase();
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getSelectedSystemCode() {
    const current = localStorage.getItem(SYSTEM_STORAGE_KEY);
    if (SYSTEM_DEFINITIONS[current]) return current;
    const legacy = localStorage.getItem(LEGACY_SYSTEM_KEY);
    const migrated = legacy === '1-5' ? '1' : legacy;
    return SYSTEM_DEFINITIONS[migrated] ? migrated : '1-1';
  }

  function setSelectedSystemCode(code) {
    const normalized = code === '1-5' ? '1' : code;
    localStorage.setItem(SYSTEM_STORAGE_KEY, SYSTEM_DEFINITIONS[normalized] ? normalized : '1-1');
  }

  function makeStop(definition, name, index) {
    const totalOccurrences = definition.names.filter((item) => item === name).length;
    const occurrence = definition.names.slice(0, index + 1).filter((item) => item === name).length;
    let note = '';
    if (index === 0) note = '始発';
    if (index === definition.names.length - 1) note = '終点';
    if (totalOccurrences > 1 && index !== 0 && index !== definition.names.length - 1) {
      note = occurrence === 1 ? '浦安駅方向' : '新浦安駅方向';
    }
    return {
      id: `hokuei-v12-${definition.code.replace('-', '')}-${String(index + 1).padStart(2, '0')}`,
      name,
      note,
      address: `${name} バス停, 浦安市, 千葉県`,
      lat: null,
      lng: null,
      placeId: null,
      googleMapsURI: null,
      source: null,
      sourceName: null,
      order: index + 1,
      manualOverride: false,
    };
  }

  function validCachedSystem(system, definition) {
    if (!system || system.code !== definition.code) return false;
    if (!Array.isArray(system.stops) || system.stops.length !== definition.names.length) return false;
    return system.stops.every((stop, index) => normalize(stop.name) === normalize(definition.names[index]));
  }

  function ensureAuthoritativeRoute() {
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route) return null;
    let changed = false;
    const previousSystems = route.systems || {};
    const systems = {};

    Object.values(SYSTEM_DEFINITIONS).forEach((definition) => {
      const previous = previousSystems[definition.code];
      if (route.hokueiAuthoritativeVersion === VERSION && validCachedSystem(previous, definition)) {
        systems[definition.code] = previous;
        return;
      }
      systems[definition.code] = {
        code: definition.code,
        title: definition.title,
        summary: definition.summary,
        relationId: definition.relationId,
        jorudanUrl: definition.jorudanUrl,
        stops: definition.names.map((name, index) => makeStop(definition, name, index)),
        path: [],
        positionSource: null,
        pathSource: null,
        verifiedAt: null,
        validation: null,
      };
      changed = true;
    });

    if (route.hokueiAuthoritativeVersion !== VERSION) changed = true;
    route.systems = systems;
    route.hokueiAuthoritativeVersion = VERSION;
    route.description = '北栄線：系統1・1-1・1-3';
    route.sourcePolicy = '停留所順は京成バス公式・千葉県バス協会・ジョルダンで照合。位置と道路形状はOSM relationを取得し、Google Mapsで検証・補完。';
    route.officialRouteMap = OFFICIAL_ROUTE_MAP;
    route.officialBusNavi = OFFICIAL_BUS_NAVI;
    route.chibaBusAssociation = CHIBA_BUS_ASSOCIATION;
    const selected = systems[getSelectedSystemCode()] || systems['1-1'];
    route.outbound = selected.stops;
    route.inbound = [];
    if (changed) save();
    return route;
  }

  function selectedSystem(route, code = getSelectedSystemCode()) {
    return route?.systems?.[code] || route?.systems?.['1-1'] || null;
  }

  function displayStopName(stop) {
    return `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;
  }

  function setStatus(text, state = '') {
    const status = document.getElementById('mapStatus');
    if (status) {
      status.textContent = text;
      status.dataset.state = state;
    }
  }

  function rad(degrees) {
    return degrees * Math.PI / 180;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function pathLength(path) {
    let total = 0;
    for (let index = 1; index < path.length; index += 1) total += distanceMeters(path[index - 1], path[index]);
    return total;
  }

  function nearestVertexDistance(point, path) {
    let best = Infinity;
    const stride = Math.max(1, Math.floor(path.length / 1200));
    for (let index = 0; index < path.length; index += stride) {
      best = Math.min(best, distanceMeters(point, path[index]));
    }
    return best;
  }

  function validateOsmPath(osmPath, googlePath, stops) {
    if (!Array.isArray(osmPath) || osmPath.length < 10) return { accepted: false, reason: 'OSM道路形状なし' };
    const stopDistances = stops.map((stop) => nearestVertexDistance(stop, osmPath));
    const stopCoverage = stopDistances.filter((distance) => distance <= 140).length / Math.max(1, stops.length);
    const sampledGoogle = googlePath.filter((_, index) => index % Math.max(1, Math.floor(googlePath.length / 150)) === 0);
    const similarity = sampledGoogle.filter((point) => nearestVertexDistance(point, osmPath) <= 120).length / Math.max(1, sampledGoogle.length);
    const osmLength = pathLength(osmPath);
    const googleLength = pathLength(googlePath);
    const ratio = googleLength ? osmLength / googleLength : 0;
    const accepted = stopCoverage >= 0.9 && similarity >= 0.7 && ratio >= 0.72 && ratio <= 1.35;
    return {
      accepted,
      stopCoverage: Number(stopCoverage.toFixed(3)),
      similarity: Number(similarity.toFixed(3)),
      lengthRatio: Number(ratio.toFixed(3)),
      reason: accepted ? 'OSM relationとGoogle道路経路が一致' : 'OSM relationと公式停留所順・Google道路経路の一致率不足',
    };
  }

  async function fetchJson(url, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseOsmPath(payload) {
    const feature = payload?.geojson?.features?.find((item) => item?.geometry?.type === 'LineString');
    if (!feature?.geometry?.coordinates) return [];
    return feature.geometry.coordinates
      .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function mapOsmStops(expectedStops, osmStops) {
    const pools = new Map();
    (osmStops || []).forEach((stop) => {
      const key = normalize(stop.name);
      if (!key || !Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lon))) return;
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push(stop);
    });

    const used = new Set();
    return expectedStops.map((expected) => {
      const key = normalize(expected.name);
      const exactPool = pools.get(key) || [];
      let candidate = exactPool.find((item) => !used.has(item));
      if (!candidate) {
        for (const [candidateKey, entries] of pools.entries()) {
          if (!candidateKey.includes(key) && !key.includes(candidateKey)) continue;
          candidate = entries.find((item) => !used.has(item));
          if (candidate) break;
        }
      }
      if (!candidate) return null;
      used.add(candidate);
      return {
        lat: Number(candidate.lat),
        lng: Number(candidate.lon),
        name: candidate.name || expected.name,
        source: 'osm-stop',
      };
    });
  }

  function routePhase(definition, index) {
    if (definition.code === '1') return '浦安駅入口方面';
    const eastIndex = definition.names.indexOf('浦安駅東口');
    return index <= eastIndex ? '浦安駅東口方面' : '北栄二丁目・新浦安駅方面';
  }

  async function searchGoogleStop(googleApi, definition, stop, index, previous, usedPlaceIds) {
    const { Place } = await googleApi.maps.importLibrary('places');
    const phase = routePhase(definition, index);
    const queries = [
      `${stop.name} バス停 北栄線 ${phase} 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 浦安市 千葉県`,
    ];
    const candidates = new Map();

    for (const textQuery of queries) {
      try {
        const response = await Place.searchByText({
          textQuery,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI'],
          locationBias: { center: { lat: 35.662, lng: 139.901 }, radius: 9000 },
          language: 'ja',
          region: 'jp',
          maxResultCount: 15,
        });
        (response.places || []).forEach((place) => {
          if (!place.location) return;
          candidates.set(place.id || `${place.location.lat()},${place.location.lng()}`, place);
        });
      } catch (error) {
        console.warn('Google Places検索失敗', textQuery, error);
      }
      if (candidates.size >= 5) break;
    }

    const wanted = normalize(stop.name);
    const scored = [...candidates.values()].map((place) => {
      const found = normalize(place.displayName || '');
      const types = place.types || [];
      const point = { lat: place.location.lat(), lng: place.location.lng() };
      let score = found === wanted ? 600 : (found.includes(wanted) || wanted.includes(found) ? 320 : 0);
      if (types.includes('bus_station')) score += 260;
      if (types.includes('transit_station')) score += 150;
      if ((place.formattedAddress || '').includes('浦安市')) score += 100;
      if (place.id && usedPlaceIds.has(place.id)) score -= 1400;
      if (previous) {
        const distance = distanceMeters(previous, point);
        if (distance > 2500) score -= 1200;
        score -= Math.min(180, distance / 15);
      }
      return { place, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0]?.place;
    if (best?.location) {
      return {
        lat: best.location.lat(),
        lng: best.location.lng(),
        placeId: best.id || null,
        address: best.formattedAddress || stop.address,
        googleMapsURI: best.googleMapsURI || null,
        source: 'google-places',
      };
    }

    const geocoder = new googleApi.maps.Geocoder();
    const response = await geocoder.geocode({
      address: `${stop.name} バス停 浦安市 千葉県`,
      region: 'JP',
      componentRestrictions: { country: 'JP' },
    });
    const result = response.results.find((item) => item.formatted_address.includes('浦安市')) || response.results[0];
    if (!result?.geometry?.location) throw new Error(`${stop.name}の位置を取得できませんでした。`);
    return {
      lat: result.geometry.location.lat(),
      lng: result.geometry.location.lng(),
      placeId: result.place_id || null,
      address: result.formatted_address || stop.address,
      googleMapsURI: null,
      source: 'google-geocoder-fallback',
    };
  }

  async function resolveStopCoordinates(googleApi, definition, system, osmPayload, force, statusCallback) {
    const osmMapped = mapOsmStops(system.stops, osmPayload?.stops || []);
    const usedPlaceIds = new Set();
    let previous = null;
    let osmCount = 0;
    let googleCount = 0;
    let fallbackCount = 0;

    for (let index = 0; index < system.stops.length; index += 1) {
      const stop = system.stops[index];
      if (!force && stop.manualOverride && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
        previous = { lat: stop.lat, lng: stop.lng };
        continue;
      }
      statusCallback?.(`停留所位置を照合中… ${index + 1}/${system.stops.length} ${stop.name}`);
      const osmPoint = osmMapped[index];
      let resolved = osmPoint;
      if (!resolved) {
        resolved = await searchGoogleStop(googleApi, definition, stop, index, previous, usedPlaceIds);
      }
      stop.lat = resolved.lat;
      stop.lng = resolved.lng;
      stop.source = resolved.source;
      stop.sourceName = resolved.name || null;
      stop.placeId = resolved.placeId || null;
      stop.address = resolved.address || stop.address;
      stop.googleMapsURI = resolved.googleMapsURI || null;
      stop.manualOverride = false;
      stop.verifiedAt = new Date().toISOString();
      if (resolved.source === 'osm-stop') osmCount += 1;
      else if (resolved.source === 'google-places') googleCount += 1;
      else fallbackCount += 1;
      if (stop.placeId) usedPlaceIds.add(stop.placeId);
      previous = { lat: stop.lat, lng: stop.lng };
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    return { osmCount, googleCount, fallbackCount };
  }

  async function directionsPath(googleApi, stops, statusCallback) {
    const service = new googleApi.maps.DirectionsService();
    const fullPath = [];
    let requestCount = 0;
    for (let start = 0; start < stops.length - 1; start += MAX_SEGMENT_STOPS - 1) {
      const end = Math.min(start + MAX_SEGMENT_STOPS - 1, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      statusCallback?.(`道路形状を検証中… ${start + 1}〜${end + 1}/${stops.length}`);
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
      requestCount += 1;
      const path = result.routes[0]?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (!path.length) throw new Error('Google Mapsから道路形状を取得できませんでした。');
      if (fullPath.length) path.shift();
      fullPath.push(...path);
    }
    return { path: fullPath, requestCount };
  }

  async function resolveSystem(code, { force = false, statusCallback = setStatus } = {}) {
    const definition = SYSTEM_DEFINITIONS[code];
    const route = ensureAuthoritativeRoute();
    const system = route?.systems?.[code];
    if (!definition || !route || !system) throw new Error('系統データがありません。');
    if (!force && system.resolvedVersion === VERSION && system.stops.every((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) && system.path?.length > 2) {
      return system;
    }
    if (resolving.has(code)) return resolving.get(code);

    const task = (async () => {
      const googleApi = await loadMaps();
      let osmPayload = null;
      let osmError = null;
      statusCallback?.(`系統${code}のOSM route relationを取得中…`);
      try {
        osmPayload = await fetchJson(`${OSM_API_BASE}${definition.relationId}`);
      } catch (error) {
        osmError = error instanceof Error ? error.message : String(error);
        console.warn(`OSM relation ${definition.relationId}取得失敗`, error);
      }

      const coordinateStats = await resolveStopCoordinates(
        googleApi,
        definition,
        system,
        osmPayload,
        force,
        statusCallback,
      );
      const validStops = system.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
      if (validStops.length !== system.stops.length) throw new Error('位置未確定の停留所があります。');

      const googleResult = await directionsPath(googleApi, validStops, statusCallback);
      const osmPath = parseOsmPath(osmPayload);
      const validation = validateOsmPath(osmPath, googleResult.path, validStops);
      const chosenPath = validation.accepted ? osmPath : googleResult.path;
      system.path = chosenPath;
      system.pathSource = validation.accepted ? `OpenStreetMap relation ${definition.relationId}` : 'Google Maps（公式停留所順を7区間以下に分割）';
      system.positionSource = coordinateStats.fallbackCount
        ? 'OSM停留所＋Google Maps（ジオコード補完あり）'
        : 'OSM停留所＋Google Mapsバス停地点';
      system.coordinateStats = coordinateStats;
      system.validation = { ...validation, osmError, googleDirectionsRequests: googleResult.requestCount };
      system.resolvedVersion = VERSION;
      system.verifiedAt = new Date().toISOString();
      route.outbound = system.stops;
      route.inbound = [];
      route.lastVerifiedSystem = code;
      route.lastVerifiedAt = system.verifiedAt;
      save();
      statusCallback?.(`系統${code}の検証完了｜${system.pathSource}`);
      return system;
    })().finally(() => resolving.delete(code));

    resolving.set(code, task);
    return task;
  }

  async function resolveAllSystems(force = false) {
    for (const code of Object.keys(SYSTEM_DEFINITIONS)) {
      await resolveSystem(code, { force, statusCallback: (text) => setStatus(text) });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const current = getSelectedSystemCode();
    setStatus(`3系統の検証完了｜現在：系統${current}`, 'ok');
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }

  function createNumberIcon(googleApi, index, source) {
    const fill = source === 'google-geocoder-fallback' ? '#fff3cd' : '#ffffff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="${fill}" stroke="#0f5ea8" stroke-width="3"/><text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${index + 1}</text></svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(36, 36),
      anchor: new googleApi.maps.Point(18, 18),
    };
  }

  function createBusIcon(googleApi) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="22" fill="white" stroke="#0f5ea8" stroke-width="3"/><text x="24" y="32" text-anchor="middle" font-size="25">🚌</text></svg>';
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new googleApi.maps.Size(48, 48),
      anchor: new googleApi.maps.Point(24, 24),
    };
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
    if (!path.length) return { position: { lat: 35.662, lng: 139.901 }, nextPosition: { lat: 35.662, lng: 139.901 } };
    if (distance <= 0) return { position: path[0], nextPosition: path[1] || path[0] };
    if (distance >= metrics.total) return { position: path.at(-1), nextPosition: path.at(-1) };
    let index = 1;
    while (index < metrics.cumulative.length && metrics.cumulative[index] < distance) index += 1;
    const beforeDistance = metrics.cumulative[index - 1];
    const segmentDistance = metrics.cumulative[index] - beforeDistance || 1;
    const ratio = (distance - beforeDistance) / segmentDistance;
    const a = path[index - 1];
    const b = path[index];
    return {
      position: { lat: a.lat + (b.lat - a.lat) * ratio, lng: a.lng + (b.lng - a.lng) * ratio },
      nextPosition: b,
    };
  }

  function headingDegrees(a, b) {
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const deltaLng = rad(b.lng - a.lng);
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function stopDistancesOnPath(stops, path, metrics) {
    let minimumIndex = 0;
    return stops.map((stop) => {
      let bestIndex = minimumIndex;
      let bestDistance = Infinity;
      for (let index = minimumIndex; index < path.length; index += 1) {
        const distance = distanceMeters(stop, path[index]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      minimumIndex = bestIndex;
      return metrics.cumulative[bestIndex] || 0;
    });
  }

  function createSequence(system) {
    document.getElementById('routeSequence')?.remove();
    const section = document.createElement('section');
    section.id = 'routeSequence';
    section.className = 'route-sequence-card';
    section.innerHTML = `
      <div class="route-sequence-title">系統${esc(system.code)}｜${esc(system.title)}｜全${system.stops.length}停留所</div>
      <div class="route-sequence">${system.stops.map((stop, index) => `
        <button type="button" class="route-sequence-stop" data-sequence-index="${index}">${index + 1}. ${esc(displayStopName(stop))}</button>
        ${index < system.stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    document.getElementById('hokueiBusControls')?.insertAdjacentElement('afterend', section);
    return section;
  }

  function setupAnimation({ googleApi, map, panorama, system, polyline }) {
    animationCleanup?.();
    document.getElementById('hokueiBusControls')?.remove();
    document.getElementById('routeSequence')?.remove();
    const controls = document.createElement('div');
    controls.id = 'hokueiBusControls';
    controls.className = 'bus-controls';
    controls.innerHTML = `
      <button id="busStart" class="primary bus-control-button">▶ ${SPEED_KMH}km/hで走行</button>
      <button id="busPause" class="secondary bus-control-button">一時停止</button>
      <button id="busPrevious" class="secondary bus-control-button">前の停留所</button>
      <button id="busNext" class="secondary bus-control-button">次の停留所</button>
      <button id="busReset" class="secondary bus-control-button">始発に戻す</button>
      <span id="busProgress" class="bus-progress">始発：${esc(system.stops[0].name)}で待機中</span>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);
    const sequence = createSequence(system);
    const path = system.path;
    const metrics = buildMetrics(path);
    const stopDistances = stopDistancesOnPath(system.stops, path, metrics);
    stopDistances[0] = 0;
    stopDistances[stopDistances.length - 1] = metrics.total;
    const vehicle = new googleApi.maps.Marker({ map, position: path[0], icon: createBusIcon(googleApi), zIndex: 1000, title: `北栄線 系統${system.code}` });
    const progress = document.getElementById('busProgress');
    const previousButton = document.getElementById('busPrevious');
    const nextButton = document.getElementById('busNext');
    let traveled = 0;
    let nextIndex = 1;
    let running = false;
    let frame = null;
    let previousTime = null;
    let dwellUntil = 0;
    let lastPanoramaUpdate = 0;
    const speed = SPEED_KMH * 1000 / 3600;

    const currentIndex = () => Math.max(0, nextIndex - 1);
    const highlight = (index) => {
      sequence.querySelectorAll('[data-sequence-index]').forEach((element) => {
        element.classList.toggle('active', Number(element.dataset.sequenceIndex) === index);
      });
      const active = sequence.querySelector(`[data-sequence-index="${index}"]`);
      active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };
    const updateButtons = () => {
      const previousIndex = currentIndex() - 1;
      const nextStop = system.stops[nextIndex];
      previousButton.disabled = previousIndex < 0;
      previousButton.textContent = previousIndex >= 0 ? `前：${system.stops[previousIndex].name}` : '前の停留所なし';
      nextButton.disabled = !nextStop;
      nextButton.textContent = nextStop ? `次：${nextStop.name}` : '終点に到着';
    };
    const update = (now, forcePanorama = false) => {
      const current = positionAtDistance(path, metrics, traveled);
      vehicle.setPosition(current.position);
      if (forcePanorama || now - lastPanoramaUpdate > 900) {
        panorama.setPosition(current.position);
        panorama.setPov({ heading: headingDegrees(current.position, current.nextPosition), pitch: 0 });
        lastPanoramaUpdate = now;
      }
      const currentStop = system.stops[currentIndex()];
      const nextStop = system.stops[nextIndex];
      progress.textContent = `前：${system.stops[currentIndex() - 1]?.name || 'なし'}｜現在：${currentStop?.name || '走行中'}｜次：${nextStop?.name || '終点'}｜${(traveled / 1000).toFixed(2)}km`;
      updateButtons();
    };
    const moveTo = (index, keepRunning) => {
      if (index < 0 || index >= system.stops.length) return;
      traveled = stopDistances[index];
      nextIndex = index + 1;
      previousTime = null;
      update(performance.now(), true);
      highlight(index);
      if (keepRunning) {
        dwellUntil = performance.now() + DWELL_MS;
        setStatus(`${displayStopName(system.stops[index])}に到着。5秒間停車します。`);
      } else {
        dwellUntil = 0;
        setStatus(`${displayStopName(system.stops[index])}へ移動しました。`);
      }
    };
    const finish = () => {
      running = false;
      traveled = metrics.total;
      nextIndex = system.stops.length;
      update(performance.now(), true);
      highlight(system.stops.length - 1);
      setStatus(`北栄線 系統${system.code}の走行を完了しました。`, 'ok');
    };
    const tick = (now) => {
      if (!running) return;
      if (dwellUntil && now < dwellUntil) {
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
      const target = stopDistances[nextIndex];
      if (Number.isFinite(target) && before < target && traveled >= target) {
        moveTo(nextIndex, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      update(now);
      if (traveled >= metrics.total) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    document.getElementById('busStart').onclick = () => {
      if (traveled >= metrics.total) moveTo(0, false);
      running = true;
      dwellUntil = 0;
      previousTime = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      setStatus(`系統${system.code}を走行中です。`);
    };
    document.getElementById('busPause').onclick = () => {
      running = false;
      dwellUntil = 0;
      previousTime = null;
      cancelAnimationFrame(frame);
      setStatus('走行を一時停止しました。');
    };
    previousButton.onclick = () => {
      const target = currentIndex() - 1;
      if (target < 0) return;
      const keepRunning = running;
      cancelAnimationFrame(frame);
      moveTo(target, keepRunning);
      if (keepRunning) frame = requestAnimationFrame(tick);
    };
    nextButton.onclick = () => {
      if (nextIndex >= system.stops.length) return;
      const keepRunning = running;
      cancelAnimationFrame(frame);
      moveTo(nextIndex, keepRunning);
      if (keepRunning) frame = requestAnimationFrame(tick);
    };
    document.getElementById('busReset').onclick = () => {
      running = false;
      cancelAnimationFrame(frame);
      traveled = 0;
      nextIndex = 1;
      highlight(0);
      update(performance.now(), true);
      setStatus(`始発の${system.stops[0].name}へ戻しました。`);
    };
    sequence.querySelectorAll('[data-sequence-index]').forEach((button) => {
      button.onclick = () => moveTo(Number(button.dataset.sequenceIndex), false);
    });

    highlight(0);
    updateButtons();
    animationCleanup = () => {
      running = false;
      cancelAnimationFrame(frame);
      vehicle.setMap(null);
      polyline?.setMap(null);
      controls.remove();
      sequence.remove();
    };
  }

  function sourcePanel(system) {
    return `
      <section class="route-source-card">
        <div><strong>検証情報</strong><span id="routeSourceSummary">${system?.verifiedAt ? `${esc(system.pathSource || '')}｜${new Date(system.verifiedAt).toLocaleString('ja-JP')}` : '未取得。初回表示時に検証します。'}</span></div>
        <div class="route-source-actions">
          <button type="button" id="refreshCurrentSystem" class="secondary">この系統を再検証</button>
          <button type="button" id="refreshAllSystems" class="secondary">3系統を一括再検証</button>
        </div>
        <div class="route-source-links">
          <a href="${OFFICIAL_ROUTE_MAP}" target="_blank" rel="noopener noreferrer">京成バス公式路線図</a>
          <a href="${OFFICIAL_BUS_NAVI}" target="_blank" rel="noopener noreferrer">京成バスナビ</a>
          <a href="${system?.jorudanUrl || '#'}" target="_blank" rel="noopener noreferrer">停留所順の照合先</a>
          <a href="https://www.openstreetmap.org/relation/${system?.relationId || ''}" target="_blank" rel="noopener noreferrer">OSM route relation</a>
        </div>
      </section>`;
  }

  async function drawAuthoritativeRoute(route, code, drawToken) {
    animationCleanup?.();
    const mapContainer = document.getElementById('routeMap');
    const streetContainer = document.getElementById('street');
    if (!mapContainer || !streetContainer) return;
    try {
      const system = await resolveSystem(code, { statusCallback: (text) => setStatus(text) });
      if (drawToken !== activeDrawToken || page !== 'routes' || getSelectedSystemCode() !== code) return;
      route.outbound = system.stops;
      route.inbound = [];
      const googleApi = await loadMaps();
      const map = new googleApi.maps.Map(mapContainer, {
        center: { lat: system.stops[0].lat, lng: system.stops[0].lng },
        zoom: 14,
        mapTypeControl: false,
        styles: [{ featureType: 'transit.station.bus', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      });
      const panorama = new googleApi.maps.StreetViewPanorama(streetContainer, {
        position: { lat: system.stops[0].lat, lng: system.stops[0].lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        motionTracking: false,
      });
      const bounds = new googleApi.maps.LatLngBounds();
      const info = new googleApi.maps.InfoWindow();
      system.stops.forEach((stop, index) => {
        const position = { lat: stop.lat, lng: stop.lng };
        bounds.extend(position);
        const marker = new googleApi.maps.Marker({
          map,
          position,
          title: `${index + 1}. ${displayStopName(stop)}`,
          icon: createNumberIcon(googleApi, index, stop.source),
          zIndex: 500,
        });
        marker.addListener('click', () => {
          panorama.setPosition(position);
          const source = stop.source === 'osm-stop' ? 'OSM停留所地点' : stop.source === 'google-places' ? 'Google Mapsバス停地点' : '要確認（ジオコード補完）';
          info.setContent(`<strong>${index + 1}. ${esc(displayStopName(stop))}</strong><br>系統${esc(system.code)}<br>${esc(source)}${stop.googleMapsURI ? `<br><a href="${esc(stop.googleMapsURI)}" target="_blank" rel="noopener noreferrer">Google Mapsで確認</a>` : ''}`);
          info.open({ map, anchor: marker });
          setStatus(`${index + 1}. ${displayStopName(stop)}｜${source}`);
        });
      });
      map.fitBounds(bounds, 50);
      const polyline = new googleApi.maps.Polyline({
        map,
        path: system.path,
        strokeColor: '#0f5ea8',
        strokeOpacity: 0.92,
        strokeWeight: 6,
        clickable: false,
      });
      setupAnimation({ googleApi, map, panorama, system, polyline });
      const sourceSummary = document.getElementById('routeSourceSummary');
      if (sourceSummary) {
        const stats = system.coordinateStats || {};
        sourceSummary.textContent = `${system.pathSource}｜位置：OSM ${stats.osmCount || 0}・Google ${stats.googleCount || 0}・要確認 ${stats.fallbackCount || 0}`;
      }
      setStatus(`北栄線 系統${system.code}｜${system.title}｜${system.summary}`, 'ok');
    } catch (error) {
      console.error('北栄線表示失敗', error);
      setStatus(`${error instanceof Error ? error.message : '北栄線を表示できませんでした。'} 再検証ボタンを押してください。`, 'error');
    }
  }

  routes = function routesAuthoritativeV12() {
    const route = ensureAuthoritativeRoute();
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) {
      animationCleanup?.();
      originalRoutesPage();
      return;
    }

    routeState.direction = 'outbound';
    const code = getSelectedSystemCode();
    const system = selectedSystem(route, code);
    activeDrawToken += 1;
    const drawToken = activeDrawToken;
    shell(`
      <section>
        <div class="controls authoritative-controls">
          <label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label>
          <label>系統<select id="hokueiSystemSelect">${Object.values(SYSTEM_DEFINITIONS).map((item) => `<option value="${item.code}" ${item.code === code ? 'selected' : ''}>${esc(item.code)}｜${esc(item.title)}</option>`).join('')}</select></label>
        </div>
        ${sourcePanel(system)}
        <div class="split"><div id="routeMap" class="map"></div><div id="street" class="street"></div></div>
        <p id="mapStatus" class="status">系統${esc(code)}を検証しています…</p>
      </section>`);

    document.getElementById('routeSelect').onchange = (event) => {
      routeState.routeId = event.target.value;
      routes();
    };
    document.getElementById('hokueiSystemSelect').onchange = (event) => {
      setSelectedSystemCode(event.target.value);
      const selected = selectedSystem(route, event.target.value);
      route.outbound = selected.stops;
      route.inbound = [];
      save();
      routes();
    };
    document.getElementById('refreshCurrentSystem').onclick = async () => {
      const button = document.getElementById('refreshCurrentSystem');
      button.disabled = true;
      try {
        await resolveSystem(code, { force: true, statusCallback: (text) => setStatus(text) });
        routes();
      } finally {
        button.disabled = false;
      }
    };
    document.getElementById('refreshAllSystems').onclick = async () => {
      const button = document.getElementById('refreshAllSystems');
      button.disabled = true;
      try {
        await resolveAllSystems(true);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '一括検証に失敗しました。', 'error');
      } finally {
        button.disabled = false;
      }
    };
    drawAuthoritativeRoute(route, code, drawToken);
  };

  drawRoute = function drawRouteAuthoritativeV12(route, stops) {
    if (route?.id === ROUTE_ID) return;
    originalDrawRoute(route, stops);
  };

  function closeStopEditor() {
    editorMapCleanup?.();
    editorMapCleanup = null;
    document.getElementById('stopEditDialog')?.remove();
  }

  function parseCoordinate(value) {
    const number = Number(String(value).trim());
    return Number.isFinite(number) ? number : null;
  }

  async function mountEditorMap(containerId, latInputId, lngInputId, statusId, initial, trackCleanup = false) {
    if (trackCleanup) editorMapCleanup?.();
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const googleApi = await loadMaps();
      const start = Number.isFinite(initial?.lat) && Number.isFinite(initial?.lng) ? initial : { lat: 35.662, lng: 139.901 };
      const map = new googleApi.maps.Map(container, { center: start, zoom: initial ? 17 : 13, mapTypeControl: false, streetViewControl: false });
      const marker = new googleApi.maps.Marker({ map, position: start, draggable: true });
      const update = (position) => {
        const lat = position.lat();
        const lng = position.lng();
        document.getElementById(latInputId).value = lat.toFixed(7);
        document.getElementById(lngInputId).value = lng.toFixed(7);
        document.getElementById(statusId).textContent = `位置：${lat.toFixed(7)}, ${lng.toFixed(7)}`;
      };
      const clickListener = map.addListener('click', (event) => { marker.setPosition(event.latLng); update(event.latLng); });
      const dragListener = marker.addListener('dragend', () => { const position = marker.getPosition(); if (position) update(position); });
      const sync = () => {
        const lat = parseCoordinate(document.getElementById(latInputId).value);
        const lng = parseCoordinate(document.getElementById(lngInputId).value);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
      };
      document.getElementById(latInputId).addEventListener('change', sync);
      document.getElementById(lngInputId).addEventListener('change', sync);
      if (trackCleanup) editorMapCleanup = () => { clickListener.remove(); dragListener.remove(); };
    } catch (error) {
      document.getElementById(statusId).textContent = error instanceof Error ? error.message : '地図を読み込めませんでした。';
    }
  }

  function settingsStops(route, mode) {
    if (route?.id === ROUTE_ID) return route.systems?.[mode]?.stops || [];
    return route?.[mode] || [];
  }

  function settingsModes(route) {
    if (route?.id === ROUTE_ID) {
      return Object.values(SYSTEM_DEFINITIONS).map((item) => ({ value: item.code, label: `${item.code}｜${item.title}` }));
    }
    return [{ value: 'outbound', label: '行き' }, { value: 'inbound', label: '戻り' }];
  }

  function settingsModeLabel(route, mode) {
    return route?.id === ROUTE_ID ? `系統${mode}` : (mode === 'outbound' ? '行き' : '戻り');
  }

  function renderSettingsModeOptions() {
    const route = data.routes.find((item) => item.id === document.getElementById('sRoute')?.value) || data.routes[0];
    const select = document.getElementById('sMode');
    if (!select) return;
    const modes = settingsModes(route);
    if (!modes.some((item) => item.value === settingsMode)) settingsMode = modes[0]?.value || 'outbound';
    document.getElementById('sModeCaption').textContent = route.id === ROUTE_ID ? '系統' : '方向';
    select.innerHTML = modes.map((item) => `<option value="${item.value}" ${item.value === settingsMode ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
    const refresh = document.getElementById('settingsRefreshRoute');
    if (refresh) refresh.hidden = route.id !== ROUTE_ID;
  }

  function renderSettingsStopList() {
    const box = document.getElementById('stopList');
    if (!box) return;
    const route = data.routes.find((item) => item.id === document.getElementById('sRoute')?.value) || data.routes[0];
    const mode = document.getElementById('sMode')?.value || settingsMode;
    settingsRouteId = route.id;
    settingsMode = mode;
    const stops = settingsStops(route, mode);
    document.getElementById('stopListTitle').textContent = `登録済み停留所｜${settingsModeLabel(route, mode)}｜${stops.length}件`;
    box.innerHTML = stops.map((stop, index) => `
      <div class="item stop-coordinate-item">
        <div class="stop-coordinate-main">
          <strong>${index + 1}. ${esc(displayStopName(stop))}</strong>
          <span>${esc(stop.address || '住所未設定')}</span>
          <code>緯度 ${Number.isFinite(stop.lat) ? stop.lat.toFixed(6) : '未設定'} ／ 経度 ${Number.isFinite(stop.lng) ? stop.lng.toFixed(6) : '未設定'}${stop.source ? ` ／ ${esc(stop.source)}` : ''}</code>
        </div>
        <button type="button" class="stop-edit-button" data-edit-stop="${route.id}|${mode}|${stop.id}">位置を修正</button>
      </div>`).join('') || '<p>この方向の停留所は未登録です。</p>';
    box.querySelectorAll('[data-edit-stop]').forEach((button) => {
      button.onclick = () => {
        const [routeId, selectedMode, stopId] = button.dataset.editStop.split('|');
        openStopEditor(routeId, selectedMode, stopId);
      };
    });
  }

  function openStopEditor(routeId, mode, stopId) {
    closeStopEditor();
    const route = data.routes.find((item) => item.id === routeId);
    const stops = settingsStops(route, mode);
    const index = stops.findIndex((stop) => stop.id === stopId);
    const stop = stops[index];
    if (!route || !stop || index < 0) return;
    const previous = stops[index - 1];
    const next = stops[index + 1];
    const dialog = document.createElement('div');
    dialog.id = 'stopEditDialog';
    dialog.className = 'stop-edit-backdrop';
    dialog.innerHTML = `
      <section class="stop-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="stopEditTitle">
        <div class="stop-edit-header"><div><h2 id="stopEditTitle">位置を修正</h2><p>${esc(label(route))}・${esc(settingsModeLabel(route, mode))}・${index + 1} / ${stops.length}</p></div><button type="button" id="closeStopEditor" class="stop-edit-close" aria-label="閉じる">×</button></div>
        <div class="stop-edit-grid">
          <label>停留所名<input id="editStopName" value="${esc(stop.name)}"></label>
          <label>補足<input id="editStopNote" value="${esc(stop.note || '')}"></label>
          <label>住所・場所<input id="editStopAddress" value="${esc(stop.address || '')}"></label>
          <label>緯度<input id="editStopLat" inputmode="decimal" value="${Number.isFinite(stop.lat) ? stop.lat.toFixed(7) : ''}"></label>
          <label>経度<input id="editStopLng" inputmode="decimal" value="${Number.isFinite(stop.lng) ? stop.lng.toFixed(7) : ''}"></label>
        </div>
        <div class="stop-edit-actions-inline"><button type="button" id="editStopGeocode" class="secondary">住所から位置を取得</button><span id="editStopStatus" class="status">地図のピン移動、または緯度・経度の直接入力で位置を修正できます。</span></div>
        <div id="editStopMap" class="stop-edit-map"></div>
        <div class="stop-edit-footer">
          <button type="button" id="cancelStopEdit" class="secondary">キャンセル</button>
          <button type="button" id="previousStopEdit" class="secondary" ${previous ? '' : 'disabled'}>← 前の停留所</button>
          <button type="button" id="nextStopEdit" class="secondary" ${next ? '' : 'disabled'}>次の停留所 →</button>
          <button type="button" id="saveStopEdit" class="primary">変更を保存</button>
        </div>
      </section>`;
    document.body.appendChild(dialog);
    document.getElementById('closeStopEditor').onclick = closeStopEditor;
    document.getElementById('cancelStopEdit').onclick = closeStopEditor;
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeStopEditor(); });

    const saveCurrent = () => {
      const name = document.getElementById('editStopName').value.trim();
      const lat = parseCoordinate(document.getElementById('editStopLat').value);
      const lng = parseCoordinate(document.getElementById('editStopLng').value);
      const status = document.getElementById('editStopStatus');
      if (!name) { status.textContent = '停留所名を入力してください。'; return false; }
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { status.textContent = '正しい緯度・経度を入力してください。'; return false; }
      stop.name = name;
      stop.note = document.getElementById('editStopNote').value.trim();
      stop.address = document.getElementById('editStopAddress').value.trim();
      stop.lat = lat;
      stop.lng = lng;
      stop.manualOverride = true;
      stop.source = 'manual-confirmed';
      stop.verifiedAt = new Date().toISOString();
      if (route.id === ROUTE_ID) {
        const system = route.systems[mode];
        system.resolvedVersion = null;
        system.path = [];
      }
      save();
      return true;
    };
    document.getElementById('editStopGeocode').onclick = async () => {
      const status = document.getElementById('editStopStatus');
      try {
        const position = await geocode(document.getElementById('editStopAddress').value.trim());
        document.getElementById('editStopLat').value = position.lat.toFixed(7);
        document.getElementById('editStopLng').value = position.lng.toFixed(7);
        await mountEditorMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', position, true);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };
    document.getElementById('previousStopEdit').onclick = () => { if (previous && saveCurrent()) openStopEditor(routeId, mode, previous.id); };
    document.getElementById('nextStopEdit').onclick = () => { if (next && saveCurrent()) openStopEditor(routeId, mode, next.id); };
    document.getElementById('saveStopEdit').onclick = () => { if (!saveCurrent()) return; closeStopEditor(); settings(); };
    mountEditorMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', Number.isFinite(stop.lat) ? { lat: stop.lat, lng: stop.lng } : null, true);
  }

  stopEditor = function stopEditorAuthoritativeV12() {
    const authoritative = ensureAuthoritativeRoute();
    const initialRoute = data.routes.find((item) => item.id === settingsRouteId) || authoritative || data.routes[0];
    settingsRouteId = initialRoute?.id || '';
    if (initialRoute?.id === ROUTE_ID && !SYSTEM_DEFINITIONS[settingsMode]) settingsMode = getSelectedSystemCode();
    document.getElementById('settingsBody').innerHTML = `
      <div class="grid">
        <div class="card">
          <label>路線<select id="sRoute">${data.routes.map((route) => `<option value="${route.id}" ${route.id === settingsRouteId ? 'selected' : ''}>${esc(label(route))}</option>`).join('')}</select></label>
          <label><span id="sModeCaption">系統</span><select id="sMode"></select></label>
          <button type="button" id="settingsRefreshRoute" class="secondary">公式ルートを再検証</button>
          <label>停留所名<input id="sName"></label>
          <label>補足<input id="sNote"></label>
          <label>住所・施設名<input id="sAddress"></label>
          <div class="coordinate-inputs"><label>緯度<input id="sLat" inputmode="decimal"></label><label>経度<input id="sLng" inputmode="decimal"></label></div>
          <button class="secondary" id="sSearch">住所から位置を取得</button>
          <div id="picker" class="picker"></div>
          <p id="sStatus" class="status">地図をクリック、または緯度・経度を直接入力できます。</p>
          <button class="primary" id="sAdd">停留所を追加</button>
        </div>
        <div class="card"><strong id="stopListTitle">登録済み停留所</strong><p class="stop-list-help">各停留所の「位置を修正」から、地図ピンまたは緯度・経度で登録位置を修正できます。保存後はルート案内に反映されます。</p><div id="stopList"></div></div>
      </div>`;
    renderSettingsModeOptions();
    renderSettingsStopList();
    mountEditorMap('picker', 'sLat', 'sLng', 'sStatus', null);

    document.getElementById('sRoute').onchange = (event) => {
      settingsRouteId = event.target.value;
      const route = data.routes.find((item) => item.id === settingsRouteId);
      settingsMode = route?.id === ROUTE_ID ? getSelectedSystemCode() : 'outbound';
      renderSettingsModeOptions();
      renderSettingsStopList();
    };
    document.getElementById('sMode').onchange = (event) => {
      settingsMode = event.target.value;
      if (settingsRouteId === ROUTE_ID) setSelectedSystemCode(settingsMode);
      renderSettingsStopList();
    };
    document.getElementById('settingsRefreshRoute').onclick = async () => {
      const button = document.getElementById('settingsRefreshRoute');
      button.disabled = true;
      document.getElementById('sStatus').textContent = `系統${settingsMode}を再検証しています…`;
      try {
        await resolveSystem(settingsMode, { force: true, statusCallback: (text) => { document.getElementById('sStatus').textContent = text; } });
        settings();
      } catch (error) {
        document.getElementById('sStatus').textContent = error instanceof Error ? error.message : '再検証に失敗しました。';
      } finally {
        button.disabled = false;
      }
    };
    document.getElementById('sSearch').onclick = async () => {
      try {
        const position = await geocode(document.getElementById('sAddress').value.trim());
        document.getElementById('sLat').value = position.lat.toFixed(7);
        document.getElementById('sLng').value = position.lng.toFixed(7);
        document.getElementById('sStatus').textContent = `位置：${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}`;
      } catch (error) {
        document.getElementById('sStatus').textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };
    document.getElementById('sAdd').onclick = () => {
      const route = data.routes.find((item) => item.id === document.getElementById('sRoute').value);
      const mode = document.getElementById('sMode').value;
      const stops = settingsStops(route, mode);
      const name = document.getElementById('sName').value.trim();
      const lat = parseCoordinate(document.getElementById('sLat').value);
      const lng = parseCoordinate(document.getElementById('sLng').value);
      if (!route || !name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        alert('停留所名と正しい緯度・経度を入力してください。');
        return;
      }
      stops.push({
        id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        note: document.getElementById('sNote').value.trim(),
        address: document.getElementById('sAddress').value.trim(),
        lat,
        lng,
        manualOverride: true,
        source: 'manual-confirmed',
      });
      if (route.id === ROUTE_ID) {
        route.systems[mode].resolvedVersion = null;
        route.systems[mode].path = [];
      }
      save();
      settings();
    };
  };

  window.HOKUEI_AUTHORITATIVE_API = {
    VERSION,
    SYSTEM_DEFINITIONS: deepClone(SYSTEM_DEFINITIONS),
    ensureAuthoritativeRoute,
    resolveSystem,
    resolveAllSystems,
    getSelectedSystemCode,
    setSelectedSystemCode,
  };

  ensureAuthoritativeRoute();
  setTimeout(ensureAuthoritativeRoute, 1200);
  setTimeout(ensureAuthoritativeRoute, 4200);
  setTimeout(ensureAuthoritativeRoute, 9000);
})();
