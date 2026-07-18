(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-18-keisei-map-google-places-v11';
  const POSITION_SOURCE = 'google-places-keisei-crosscheck-v11';
  const OFFICIAL_ROUTE_MAP = 'https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf';
  const OFFICIAL_BUS_NAVI = 'https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619';
  const API = window.HOKUEI_SYSTEMS_API;
  if (!API) return;

  const PLATFORM_RULES = {
    '新浦安駅': { outward: 'A' },
    '浦安警察署': { outward: '01', returning: '02' },
    '浦安高校前': { outward: '01', returning: '02' },
    '消防本部前': { outward: '04', returning: '05' },
    '北栄四丁目': { outward: '02', returning: '03' },
    '浦安駅東口': { outward: '02', returning: '02' },
    '東京ベイ医療センター': { returning: '01' },
  };

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/[\s　・･()（）「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  function phaseFor(system, stop, index) {
    if (stop.note?.includes('2回目') || stop.note === '終点') return 'returning';
    const eastIndex = system.stops.findIndex((item) => item.name === '浦安駅東口');
    if (index <= eastIndex) return 'outward';
    if (system.code === '1-5') return 'outward';
    return 'returning';
  }

  function destinationHint(system, phase) {
    if (system.code === '1-5') return '浦安駅入口方面';
    if (phase === 'returning') return '北栄二丁目 美浜中学校 新浦安駅方面';
    return '北栄中央 浦安駅東口方面';
  }

  function platformFor(stop, phase) {
    return PLATFORM_RULES[stop.name]?.[phase] || '';
  }

  function clearIncorrectCoordinates() {
    const route = API.ensureSystems();
    if (!route || route.coordinateCorrectionVersion === VERSION) return route;

    Object.values(route.systems || {}).forEach((system) => {
      (system.stops || []).forEach((stop) => {
        stop.lat = null;
        stop.lng = null;
        stop.placeId = null;
        stop.googleMapsURI = null;
        stop.iconMaskURI = null;
        stop.iconBackgroundColor = null;
        stop.manualPosition = false;
        stop.positionSource = `pending:${VERSION}`;
        stop.coordinateVerifiedAt = null;
        stop.coordinateReference = '京成バスナビの停留所名・方向を照合し、Google Mapsのバス停地点から取得';
      });
    });

    route.coordinateCorrectionVersion = VERSION;
    route.coordinatePolicy = '停留所順・系統・のりばは京成バス公式、数値座標はGoogle Mapsのバス停地点';
    route.officialRouteMap = OFFICIAL_ROUTE_MAP;
    route.officialBusNavi = OFFICIAL_BUS_NAVI;
    save();
    return route;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    const rad = (degrees) => degrees * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function scoreCandidate(place, stop, platform, previous, usedIds) {
    if (!place?.location) return -Infinity;
    const wanted = normalize(stop.name);
    const found = normalize(place.displayName || '');
    const address = place.formattedAddress || '';
    const types = place.types || [];
    let score = found === wanted ? 500 : (found.includes(wanted) || wanted.includes(found) ? 260 : 0);
    if (types.includes('bus_station')) score += 230;
    if (types.includes('transit_station')) score += 140;
    if (address.includes('浦安市')) score += 100;
    if (platform && `${place.displayName || ''} ${address}`.includes(platform)) score += 100;
    if (place.id && usedIds.has(place.id)) score -= 1200;
    if (previous) {
      const distance = distanceMeters(previous, {
        lat: place.location.lat(),
        lng: place.location.lng(),
      });
      if (distance > 3500) score -= 1000;
      score -= Math.min(220, distance / 18);
    }
    return score;
  }

  async function searchStop(googleApi, system, stop, index, previous, usedIds) {
    const { Place } = await googleApi.maps.importLibrary('places');
    const phase = phaseFor(system, stop, index);
    const platform = platformFor(stop, phase);
    const destination = destinationHint(system, phase);
    const queries = [
      `${stop.name} バス停 ${platform ? `のりば${platform} ` : ''}${destination} 京成バス千葉ウエスト`,
      `${stop.name} バス停 北栄線 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 浦安市 千葉県`,
    ];
    const candidates = new Map();

    for (const textQuery of queries) {
      try {
        const response = await Place.searchByText({
          textQuery,
          fields: [
            'id', 'displayName', 'formattedAddress', 'location', 'types',
            'googleMapsURI', 'svgIconMaskURI', 'iconBackgroundColor',
          ],
          locationBias: { center: { lat: 35.662, lng: 139.901 }, radius: 9000 },
          language: 'ja',
          region: 'jp',
          maxResultCount: 15,
        });
        (response.places || []).forEach((place) => {
          if (!place.location) return;
          const key = place.id || `${place.location.lat()},${place.location.lng()}`;
          candidates.set(key, place);
        });
      } catch (error) {
        console.warn('停留所検索に失敗', textQuery, error);
      }
      if (candidates.size >= 4) break;
    }

    const selected = [...candidates.values()]
      .sort((a, b) => scoreCandidate(b, stop, platform, previous, usedIds) - scoreCandidate(a, stop, platform, previous, usedIds))[0];

    if (!selected?.location) throw new Error(`${stop.name}のGoogle Mapsバス停地点を取得できませんでした。`);
    return { selected, phase, platform };
  }

  async function resolveSystemCoordinates(route, system, status) {
    if (!system?.stops?.length) return;
    const unresolved = system.stops.some((stop) => !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng));
    if (!unresolved) return;

    const googleApi = await loadMaps();
    const usedIdsByName = new Map();
    let previous = null;

    for (let index = 0; index < system.stops.length; index += 1) {
      const stop = system.stops[index];
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
        previous = { lat: stop.lat, lng: stop.lng };
        if (stop.placeId) {
          if (!usedIdsByName.has(stop.name)) usedIdsByName.set(stop.name, new Set());
          usedIdsByName.get(stop.name).add(stop.placeId);
        }
        continue;
      }

      if (index === system.stops.length - 1 && stop.name === system.stops[0].name && Number.isFinite(system.stops[0].lat)) {
        Object.assign(stop, {
          lat: system.stops[0].lat,
          lng: system.stops[0].lng,
          placeId: system.stops[0].placeId,
          googleMapsURI: system.stops[0].googleMapsURI,
          positionSource: POSITION_SOURCE,
          coordinateVerifiedAt: new Date().toISOString(),
        });
        previous = { lat: stop.lat, lng: stop.lng };
        continue;
      }

      if (status) status.textContent = `京成バスナビの方向と照合して位置を取得中… ${index + 1}/${system.stops.length} ${stop.name}`;
      if (!usedIdsByName.has(stop.name)) usedIdsByName.set(stop.name, new Set());
      const result = await searchStop(googleApi, system, stop, index, previous, usedIdsByName.get(stop.name));
      const place = result.selected;
      stop.lat = place.location.lat();
      stop.lng = place.location.lng();
      stop.placeId = place.id || null;
      stop.address = place.formattedAddress || stop.address;
      stop.googleMapsURI = place.googleMapsURI || null;
      stop.iconMaskURI = place.svgIconMaskURI || null;
      stop.iconBackgroundColor = place.iconBackgroundColor || '#1a73e8';
      stop.positionSource = POSITION_SOURCE;
      stop.officialPlatform = result.platform || null;
      stop.officialDirection = destinationHint(system, result.phase);
      stop.coordinateVerifiedAt = new Date().toISOString();
      if (stop.placeId) usedIdsByName.get(stop.name).add(stop.placeId);
      previous = { lat: stop.lat, lng: stop.lng };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    route.coordinateCorrectionVersion = VERSION;
    route.lastCoordinateResolutionAt = new Date().toISOString();
    save();
  }

  const previousDrawRoute = drawRoute;
  drawRoute = function drawRouteWithCorrectedCoordinates(route, stops) {
    if (route?.id !== ROUTE_ID) {
      previousDrawRoute(route, stops);
      return;
    }

    const correctedRoute = clearIncorrectCoordinates();
    const selectedSystem = API.system(correctedRoute);
    const status = document.getElementById('mapStatus');
    resolveSystemCoordinates(correctedRoute, selectedSystem, status)
      .then(() => previousDrawRoute(correctedRoute, selectedSystem?.stops || []))
      .catch((error) => {
        console.error('北栄線の停留所位置取得に失敗', error);
        if (status) status.textContent = `${error instanceof Error ? error.message : '位置を取得できませんでした。'} 設定画面から確認してください。`;
      });
  };

  window.HOKUEI_COORDINATE_FIX_API = {
    VERSION,
    clearIncorrectCoordinates,
    resolveSystemCoordinates,
    OFFICIAL_ROUTE_MAP,
    OFFICIAL_BUS_NAVI,
  };

  clearIncorrectCoordinates();
  setTimeout(clearIncorrectCoordinates, 4200);
  setTimeout(clearIncorrectCoordinates, 9000);
})();