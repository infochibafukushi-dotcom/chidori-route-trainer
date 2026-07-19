(() => {
  const ROUTE_ID = 'route-2';
  const VERSION = '2026-07-19-imagawa-v1j';
  const PATH_POLICY_VERSION = '2026-07-19-imagawa-path-v3j';
  const SYSTEM_KEY = 'chidori-imagawa-system-v1';
  const OSM_API_BASE = 'https://openstreetmap.tools/public_transport_geojson/api/route/';
  const OFFICIAL_ROUTE_MAP = 'https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf';
  const OFFICIAL_BUS_NAVI = 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020739&course-sequence=0008200206-1';
  const CHIBA_BUS_ASSOCIATION = 'https://www.chiba-bus-kyokai.or.jp/app/navi/navitime2/lineval/209532_-1_210_10930_0/pageID/1/stop_id/31998/';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const MAP_ZOOM = 18;
  const MAX_STOPS_PER_REQUEST = 8;
  const MAX_DATA_URL_CHARS = 70000;

  /**
   * 系統キー単位の確定停留所座標（OSM platform + Google Maps/Street View照合）。
   * directionGroup 共有は使わない。systemKey|停留所名 で管理。
   * 2-maihama 美浜東団地: 美浜5丁目2側（NW→SE道路の南西側＝舞浜駅行き）。
   * 2-urayasu-maihama 美浜東団地: 美浜1丁目7側（反対方向・OSM 1330409783）。
   */
  const AUTHORITATIVE_PLATFORMS = {
    '2-maihama': {
      浦安駅入口: { lat: 35.6647047, lng: 139.8949743 },
      神明裏: { lat: 35.6623799, lng: 139.8989516 },
      猫実: { lat: 35.6608375, lng: 139.9012946 },
      消防本部前: { lat: 35.6594904, lng: 139.9034126 },
      海楽: { lat: 35.6576449, lng: 139.9059641 },
      美浜東団地: { lat: 35.6522225, lng: 139.9128348 },
      新浦安駅北口: { lat: 35.6499903, lng: 139.9126359 },
      若潮公園: { lat: 35.6473943, lng: 139.9095296 },
      順天堂病院前: { lat: 35.6453182, lng: 139.9070393 },
      サンコーポ東口: { lat: 35.6439144, lng: 139.905342 },
      サンコーポ西口: { lat: 35.6420634, lng: 139.9031259 },
      弁天第二: { lat: 35.6398165, lng: 139.9004629 },
      見明川中学校前: { lat: 35.6384265, lng: 139.8987768 },
      見明川住宅: { lat: 35.6364748, lng: 139.8964564 },
      舞浜三丁目: { lat: 35.6337929, lng: 139.8932505 },
      運動公園: { lat: 35.6310025, lng: 139.8899547 },
      オリエンタルランド本社前: { lat: 35.6320206, lng: 139.887359 },
      舞浜駅: { lat: 35.6360225, lng: 139.8833113 },
    },
    /** OSM relation 9964872（舞浜駅⇒浦安駅入口）platform。2-maihama とは別乗り場。 */
    '2-urayasu-maihama': {
      舞浜駅: { lat: 35.6358527, lng: 139.8837581, platformId: 2661127170 },
      オリエンタルランド本社前: { lat: 35.6312873, lng: 139.8885643, platformId: 2301981524 },
      運動公園: { lat: 35.6325209, lng: 139.8914704, platformId: 6720667166 },
      舞浜三丁目: { lat: 35.6339331, lng: 139.8931509, platformId: 1652826334 },
      見明川住宅: { lat: 35.6366143, lng: 139.8963732, platformId: 1652792629 },
      見明川中学校前: { lat: 35.6385937, lng: 139.8987376, platformId: 11581103370 },
      弁天第二: { lat: 35.6400525, lng: 139.900479, platformId: 11581103369 },
      サンコーポ西口: { lat: 35.6423093, lng: 139.9031895, platformId: 11581097368 },
      サンコーポ東口: { lat: 35.6440928, lng: 139.9053323, platformId: 6720667163 },
      順天堂病院前: { lat: 35.645692, lng: 139.907214, platformId: 11581097365 },
      若潮公園: { lat: 35.6475041, lng: 139.9093912, platformId: 6720667161 },
      新浦安駅北口: { lat: 35.650172, lng: 139.9125398, platformId: 6720642144 },
      美浜東団地: { lat: 35.6522648, lng: 139.9122584, platformId: 1330409783 },
      海楽: { lat: 35.6573684, lng: 139.9059647, platformId: 6720667167 },
      消防本部前: { lat: 35.6589613, lng: 139.9038774, platformId: 12368996379 },
      猫実: { lat: 35.6611395, lng: 139.9005341, platformId: 2900279301 },
      神明裏: { lat: 35.6628205, lng: 139.8979314, platformId: 6764110350 },
      浦安駅入口: { lat: 35.6644872, lng: 139.8950364, platformId: 6764110353 },
    },
  };

  /** 道路形状用経由点（停留所としては表示しない）。OSM route relation の道路上。 */
  const IMAGAWA_PATH_SHAPING_POINTS = {
    '2-maihama': {
      '運動公園->オリエンタルランド本社前': [
        { lat: 35.6306759, lng: 139.8891321 },
        { lat: 35.6312119, lng: 139.888456 },
      ],
      'オリエンタルランド本社前->舞浜駅': [
        { lat: 35.6347206, lng: 139.884061 },
        { lat: 35.6351208, lng: 139.883533 },
      ],
    },
    '2-urayasu-maihama': {
      '舞浜駅->オリエンタルランド本社前': [
        { lat: 35.6355647, lng: 139.8838339 },
        { lat: 35.6350695, lng: 139.8836973 },
        { lat: 35.6335251, lng: 139.885658 },
      ],
      'オリエンタルランド本社前->運動公園': [
        { lat: 35.6305993, lng: 139.8892788 },
        { lat: 35.631266, lng: 139.8900762 },
      ],
      '運動公園->舞浜三丁目': [
        { lat: 35.6330661, lng: 139.8922557 },
      ],
      '見明川住宅->見明川中学校前': [
        { lat: 35.6369958, lng: 139.8969513 },
        { lat: 35.6377077, lng: 139.8978001 },
      ],
      '弁天第二->サンコーポ西口': [
        { lat: 35.6409129, lng: 139.9016435 },
      ],
      'サンコーポ西口->サンコーポ東口': [
        { lat: 35.6431926, lng: 139.9043656 },
      ],
      'サンコーポ東口->順天堂病院前': [
        { lat: 35.6446906, lng: 139.9061601 },
      ],
      '順天堂病院前->若潮公園': [
        { lat: 35.6462457, lng: 139.908028 },
      ],
      '新浦安駅北口->美浜東団地': [
        { lat: 35.650726, lng: 139.9132923 },
        { lat: 35.6512245, lng: 139.9136655 },
      ],
    },
  };

  /** 2-maihama の Directions 区間分割（0-based stop index）。 */
  const MAIHAMA_SEGMENT_BOUNDS = [
    [0, 6],
    [6, 12],
    [12, 15],
    [15, 16],
    [16, 17],
  ];

  /** 2-urayasu-maihama の Directions 区間分割（問題区間を独立生成）。 */
  const URAYASU_MAIHAMA_SEGMENT_BOUNDS = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 17],
  ];

  const URAYASU_TO_NORTH = [
    '浦安駅入口', '神明裏', '猫実', '消防本部前', '海楽', '美浜東団地', '新浦安駅北口',
  ];
  const NORTH_TO_PARK = [
    '若潮公園', '順天堂病院前', 'サンコーポ東口', 'サンコーポ西口', '弁天第二',
    '見明川中学校前', '見明川住宅', '舞浜三丁目', '運動公園',
  ];
  const TO_MAIHAMA = [...URAYASU_TO_NORTH, ...NORTH_TO_PARK, 'オリエンタルランド本社前', '舞浜駅'];
  const TO_CHIDORI = [...URAYASU_TO_NORTH, ...NORTH_TO_PARK, '千鳥車庫'];

  const SYSTEM_DEFINITIONS = {
    '2-maihama': {
      key: '2-maihama', displayCode: '2', directionGroup: 'outbound',
      title: '舞浜駅行き',
      summary: '浦安駅入口 → 新浦安駅北口 → 順天堂病院前 → 運動公園 → 舞浜駅',
      relationId: 18323695,
      names: TO_MAIHAMA,
    },
    '2-urayasu-maihama': {
      key: '2-urayasu-maihama', displayCode: '2', directionGroup: 'inbound',
      title: '浦安駅入口行き（舞浜駅発）',
      summary: '舞浜駅 → 運動公園 → 順天堂病院前 → 新浦安駅北口 → 浦安駅入口',
      relationId: 9964872,
      names: [...TO_MAIHAMA].reverse(),
    },
    '2-chidori': {
      key: '2-chidori', displayCode: '2', directionGroup: 'outbound',
      title: '千鳥車庫行き（舞浜駅非経由）',
      summary: '浦安駅入口 → 新浦安駅北口 → 順天堂病院前 → 運動公園 → 千鳥車庫',
      relationId: null,
      names: TO_CHIDORI,
    },
    '2-urayasu-chidori': {
      key: '2-urayasu-chidori', displayCode: '2', directionGroup: 'inbound',
      title: '浦安駅入口行き（千鳥車庫発）',
      summary: '千鳥車庫 → 運動公園 → 順天堂病院前 → 新浦安駅北口 → 浦安駅入口',
      relationId: null,
      names: [...TO_CHIDORI].reverse(),
    },
    '2-kitaguchi': {
      key: '2-kitaguchi', displayCode: '2', directionGroup: 'outbound',
      title: '新浦安駅北口行き（区間便）',
      summary: '浦安駅入口 → 海楽 → 新浦安駅北口',
      relationId: null,
      names: URAYASU_TO_NORTH,
    },
  };

  const previousRoutes = routes;
  const previousStopEditor = stopEditor;
  let cleanupGuidance = null;
  let renderToken = 0;
  let editorRouteId = routeState?.routeId === ROUTE_ID ? ROUTE_ID : '';
  let editorSystemKey = getSelectedSystemKey();
  let editorMapCleanup = null;

  const escHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所|＜浦安市＞/g, '')
    .toLowerCase();

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const validPosition = (stop) => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng);

  function getSelectedSystemKey() {
    const stored = localStorage.getItem(SYSTEM_KEY);
    return SYSTEM_DEFINITIONS[stored] ? stored : '2-maihama';
  }

  function setSelectedSystemKey(key) {
    localStorage.setItem(SYSTEM_KEY, SYSTEM_DEFINITIONS[key] ? key : '2-maihama');
  }

  function imageKey(definition, stop) {
    return `${definition.directionGroup}|${normalize(stop?.name)}`;
  }

  function coordinateKey(systemKey, stopName) {
    return `${systemKey}|${normalize(stopName)}`;
  }

  function makeStop(definition, name, index) {
    const platform = AUTHORITATIVE_PLATFORMS[definition.key]?.[name] || null;
    return {
      id: `imagawa-v1-${definition.key.replace(/[^a-z0-9]/gi, '')}-${String(index + 1).padStart(2, '0')}`,
      name,
      note: index === 0 ? '始発' : (index === definition.names.length - 1 ? '終点' : ''),
      address: `${name} バス停, 浦安市, 千葉県`,
      lat: platform ? platform.lat : null,
      lng: platform ? platform.lng : null,
      placeId: null,
      googleMapsURI: null,
      source: platform ? 'authoritative-platform' : null,
      sourceName: platform ? name : null,
      order: index + 1,
      manualOverride: false,
      directionGroup: definition.directionGroup,
      systemCode: definition.key,
      directionKey: coordinateKey(definition.key, name),
    };
  }

  function invalidateSystemPath(system) {
    if (!system) return;
    system.path = [];
    system.pathSource = null;
    system.resolvedVersion = null;
    system.verifiedAt = null;
    system.pathInvalid = false;
    system.pathIssues = null;
    system.validation = null;
  }

  function validCachedSystem(system, definition) {
    return Boolean(
      system
      && system.key === definition.key
      && Array.isArray(system.stops)
      && system.stops.length === definition.names.length
      && system.stops.every((stop, index) => normalize(stop.name) === normalize(definition.names[index]))
    );
  }

  function ensureRoute() {
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route) return null;
    const previousSystems = route.systems || {};
    const systems = {};
    let changed = route.imagawaVersion !== VERSION || route.imagawaPathPolicyVersion !== PATH_POLICY_VERSION;

    Object.values(SYSTEM_DEFINITIONS).forEach((definition) => {
      const previous = previousSystems[definition.key];
      if (validCachedSystem(previous, definition)) {
        systems[definition.key] = previous;
        systems[definition.key].displayCode = '2';
        systems[definition.key].directionGroup = definition.directionGroup;
        systems[definition.key].title = definition.title;
        systems[definition.key].summary = definition.summary;
        systems[definition.key].relationId = definition.relationId;
        // 確定座標を強制適用（2-maihama / 2-urayasu-maihama のみ。他系統は触らない）
        if (definition.key === '2-maihama' || definition.key === '2-urayasu-maihama') {
          const platforms = AUTHORITATIVE_PLATFORMS[definition.key];
          let stopChanged = false;
          (systems[definition.key].stops || []).forEach((stop, index) => {
            const name = definition.names[index];
            const platform = platforms[name];
            if (!platform) return;
            const sharedBad = String(stop.source || '').startsWith('shared-direction')
              || String(stop.source || '').startsWith('shared-manual')
              || stop.directionKey === `outbound|${normalize(name)}`
              || stop.directionKey === `inbound|${normalize(name)}`;
            const drifted = !validPosition(stop)
              || Math.abs(stop.lat - platform.lat) > 0.0000005
              || Math.abs(stop.lng - platform.lng) > 0.0000005;
            if (stop.manualOverride && validPosition(stop) && !sharedBad) return;
            if (!drifted && !sharedBad && stop.source === 'authoritative-platform') return;
            stop.lat = platform.lat;
            stop.lng = platform.lng;
            stop.source = 'authoritative-platform';
            stop.sourceName = name;
            stop.systemCode = definition.key;
            stop.directionKey = coordinateKey(definition.key, name);
            stop.platformId = platform.platformId || null;
            stop.verifiedAt = new Date().toISOString();
            stopChanged = true;
          });
          // 2-maihama は座標ドリフト時のみ path 無効化（VERSION 更新だけでは触らない）
          // 2-urayasu-maihama は今回の再生成対象のため VERSION 更新で無効化
          const shouldInvalidatePath = definition.key === '2-urayasu-maihama'
            ? (stopChanged || route.imagawaVersion !== VERSION || route.imagawaPathPolicyVersion !== PATH_POLICY_VERSION)
            : stopChanged;
          if (shouldInvalidatePath) {
            invalidateSystemPath(systems[definition.key]);
            changed = true;
          } else if (stopChanged) {
            changed = true;
          }
        }
        return;
      }
      systems[definition.key] = {
        key: definition.key,
        code: definition.key,
        displayCode: '2',
        directionGroup: definition.directionGroup,
        title: definition.title,
        summary: definition.summary,
        relationId: definition.relationId,
        stops: definition.names.map((name, index) => {
          const created = makeStop(definition, name, index);
          const prior = previous?.stops?.[index];
          if (
            prior
            && normalize(prior.name) === normalize(name)
            && prior.manualOverride
            && validPosition(prior)
            && !String(prior.source || '').startsWith('shared')
          ) {
            return {
              ...created,
              lat: prior.lat,
              lng: prior.lng,
              address: prior.address || created.address,
              placeId: prior.placeId || null,
              googleMapsURI: prior.googleMapsURI || null,
              source: 'manual-confirmed',
              manualOverride: true,
              verifiedAt: prior.verifiedAt || new Date().toISOString(),
              stopImageDataUrl: prior.stopImageDataUrl,
              stopImageUpdatedAt: prior.stopImageUpdatedAt,
            };
          }
          return created;
        }),
        path: [],
        pathSource: null,
        positionSource: null,
        verifiedAt: null,
        resolvedVersion: null,
      };
      changed = true;
    });

    route.systems = systems;
    route.imagawaVersion = VERSION;
    route.imagawaPathPolicyVersion = PATH_POLICY_VERSION;
    route.description = '今川線：片道5運行パターン（公式系統番号はいずれも2）';
    route.sourcePolicy = '停留所座標は系統キー（systemKey+停留所名）単位。道路はGoogle Directionsのみ（OSM LineString不使用）。';
    route.officialRouteMap = OFFICIAL_ROUTE_MAP;
    route.officialBusNavi = OFFICIAL_BUS_NAVI;
    route.chibaBusAssociation = CHIBA_BUS_ASSOCIATION;
    if (!route.imagawaStopImages || typeof route.imagawaStopImages !== 'object') route.imagawaStopImages = {};
    const selected = systems[getSelectedSystemKey()] || systems['2-maihama'];
    route.outbound = selected.stops;
    route.inbound = [];
    if (changed) save();
    return route;
  }

  function selectedSystem(route, key = getSelectedSystemKey()) {
    return route?.systems?.[key] || route?.systems?.['2-maihama'] || null;
  }

  function displayStopName(stop) {
    return `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;
  }

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
    return (feature?.geometry?.coordinates || [])
      .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function mapOsmStops(expectedStops, osmStops) {
    const pools = new Map();
    (osmStops || []).forEach((stop) => {
      const key = normalize(stop.name);
      const lat = Number(stop.lat);
      const lng = Number(stop.lon);
      if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push({ ...stop, lat, lng });
    });
    const used = new Set();
    return expectedStops.map((expected) => {
      const wanted = normalize(expected.name);
      let candidate = (pools.get(wanted) || []).find((item) => !used.has(item));
      if (!candidate) {
        for (const [key, entries] of pools.entries()) {
          if (!key.includes(wanted) && !wanted.includes(key)) continue;
          candidate = entries.find((item) => !used.has(item));
          if (candidate) break;
        }
      }
      if (!candidate) return null;
      used.add(candidate);
      return { lat: candidate.lat, lng: candidate.lng, name: candidate.name || expected.name, source: 'osm-stop' };
    });
  }

  function coordinateBank(route) {
    const bank = new Map();
    Object.values(route.systems || {}).forEach((system) => {
      const systemKey = system.key || system.code;
      (system.stops || []).forEach((stop) => {
        if (!validPosition(stop)) return;
        // 今川線は systemKey|停留所名 のみ。directionGroup 共有は使わない。
        const key = coordinateKey(systemKey, stop.name);
        if (!bank.has(key) || stop.manualOverride) bank.set(key, stop);
      });
    });
    return bank;
  }

  function latLngValue(location, axis) {
    if (!location) return null;
    const value = typeof location[axis] === 'function' ? location[axis]() : location[axis];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  async function searchGoogleStop(googleApi, definition, stop, previous, usedPlaceIds) {
    const { Place } = await googleApi.maps.importLibrary('places');
    const destination = definition.title.replace(/（.*?）/g, '');
    const queries = [
      `${stop.name} バス停 今川線 ${destination} 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 京成バス千葉ウエスト 浦安市`,
      `${stop.name} バス停 浦安市 千葉県`,
    ];
    const candidates = new Map();
    for (const textQuery of queries) {
      try {
        const response = await Place.searchByText({
          textQuery,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI'],
          locationBias: { center: { lat: 35.645, lng: 139.902 }, radius: 10000 },
          language: 'ja', region: 'jp', maxResultCount: 15,
        });
        (response.places || []).forEach((place) => {
          const lat = latLngValue(place.location, 'lat');
          const lng = latLngValue(place.location, 'lng');
          if (lat === null || lng === null) return;
          candidates.set(place.id || `${lat},${lng}`, { place, lat, lng });
        });
      } catch (error) {
        console.warn('今川線 Google Places検索失敗', textQuery, error);
      }
      if (candidates.size >= 5) break;
    }

    const wanted = normalize(stop.name);
    const scored = [...candidates.values()].map((entry) => {
      const place = entry.place;
      const found = normalize(place.displayName || '');
      const types = place.types || [];
      const point = { lat: entry.lat, lng: entry.lng };
      let score = found === wanted ? 700 : (found.includes(wanted) || wanted.includes(found) ? 360 : 0);
      if (types.includes('bus_station')) score += 260;
      if (types.includes('transit_station')) score += 150;
      if ((place.formattedAddress || '').includes('浦安市')) score += 100;
      if (place.id && usedPlaceIds.has(place.id)) score -= 1600;
      if (previous) {
        const distance = distanceMeters(previous, point);
        if (distance > 3000) score -= 1400;
        score -= Math.min(200, distance / 15);
      }
      return { ...entry, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score > 100) {
      return {
        lat: best.lat, lng: best.lng,
        placeId: best.place.id || null,
        address: best.place.formattedAddress || stop.address,
        googleMapsURI: best.place.googleMapsURI || null,
        source: 'google-places',
      };
    }

    const geocoder = new googleApi.maps.Geocoder();
    const response = await geocoder.geocode({
      address: `${stop.name} バス停 浦安市 千葉県`, region: 'JP', componentRestrictions: { country: 'JP' },
    });
    const result = response.results.find((item) => item.formatted_address.includes('浦安市')) || response.results[0];
    if (!result?.geometry?.location) throw new Error(`${stop.name}の位置を取得できませんでした。`);
    return {
      lat: result.geometry.location.lat(), lng: result.geometry.location.lng(),
      placeId: result.place_id || null, address: result.formatted_address || stop.address,
      googleMapsURI: null, source: 'google-geocoder-fallback',
    };
  }

  function angleDiff(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  function pathLength(path) {
    let total = 0;
    for (let index = 1; index < path.length; index += 1) total += distanceMeters(path[index - 1], path[index]);
    return total;
  }

  function nearestPathIndex(path, stop, minIndex = 0) {
    let bestIndex = Math.max(0, minIndex);
    let bestDistance = Infinity;
    for (let index = Math.max(0, minIndex); index < path.length; index += 1) {
      const distance = distanceMeters(path[index], stop);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return { index: bestIndex, distance: bestDistance };
  }

  function countSelfIntersections(path) {
    const segments = [];
    for (let index = 1; index < path.length; index += 1) {
      const length = distanceMeters(path[index - 1], path[index]);
      if (length < 28) continue;
      segments.push({ a: path[index - 1], b: path[index], length, pathIndex: index });
    }
    let count = 0;
    const orient = (a, b, c) => {
      const value = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
      if (Math.abs(value) < 1e-14) return 0;
      return value > 0 ? 1 : 2;
    };
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 3; j < segments.length; j += 1) {
        const s1 = segments[i];
        const s2 = segments[j];
        if (s2.pathIndex - s1.pathIndex < 4) continue;
        const o1 = orient(s1.a, s1.b, s2.a);
        const o2 = orient(s1.a, s1.b, s2.b);
        const o3 = orient(s2.a, s2.b, s1.a);
        const o4 = orient(s2.a, s2.b, s1.b);
        if (o1 === o2 || o3 === o4) continue;
        // 端点近傍の接触は overview_path のノイズとして除外
        const nearEnd =
          distanceMeters(s1.a, s2.a) < 18
          || distanceMeters(s1.a, s2.b) < 18
          || distanceMeters(s1.b, s2.a) < 18
          || distanceMeters(s1.b, s2.b) < 18;
        if (nearEnd) continue;
        count += 1;
      }
    }
    return count;
  }

  function validateRoadPath(path, stops, systemKey) {
    const issues = [];
    const metrics = { sharpReversals: 0, selfIntersections: 0, revisitPairs: [] };
    if (!Array.isArray(path) || path.length < 4) {
      return { valid: false, issues: [{ type: 'empty', message: '道路ルートが空です' }], metrics };
    }

    let previousHeading = null;
    let reverseRun = 0;
    // 舞浜駅行き: 終点ターミナル進入は急反転検出から除外
    // 浦安駅入口行き: 始発ターミナル出発は急反転検出から除外
    const reverseStartIndex = systemKey === '2-urayasu-maihama' ? 18 : 1;
    const reverseLimitIndex = systemKey === '2-maihama'
      ? Math.max(2, path.length - 18)
      : path.length;
    for (let index = reverseStartIndex; index < reverseLimitIndex; index += 1) {
      const step = distanceMeters(path[index - 1], path[index]);
      if (step < 8) continue;
      const currentHeading = heading(path[index - 1], path[index]);
      if (previousHeading !== null && angleDiff(previousHeading, currentHeading) >= 150) {
        reverseRun += step;
        metrics.sharpReversals += 1;
        if (reverseRun >= 160) {
          issues.push({ type: 'out-and-back', message: `同一区間の往復・急反転疑い（約${Math.round(reverseRun)}m）` });
          break;
        }
      } else {
        reverseRun = 0;
      }
      previousHeading = currentHeading;
    }

    // 停留所同士を道路無視で直線結んだ疑い（overview_path の点間隔は検出しない）
    // 2-maihama は確定済み dd1102d の閾値を維持。2-urayasu-maihama のみ近距離直線道路の誤検知を緩和。
    for (let index = 0; index < stops.length - 1 && issues.length === 0; index += 1) {
      const start = stops[index];
      const end = stops[index + 1];
      const direct = distanceMeters(start, end);
      const minDirect = systemKey === '2-urayasu-maihama' ? 450 : 350;
      const maxPoints = systemKey === '2-urayasu-maihama' ? 3 : 4;
      const ratioLimit = systemKey === '2-urayasu-maihama' ? 0.95 : 0.93;
      if (direct < minDirect) continue;
      const bestStart = nearestPathIndex(path, start).index;
      const bestEnd = nearestPathIndex(path, end, systemKey === '2-urayasu-maihama' ? bestStart : 0).index;
      if (bestEnd <= bestStart) continue;
      const segment = path.slice(bestStart, bestEnd + 1);
      const along = pathLength(segment);
      if (along > 0 && direct / along > ratioLimit && segment.length <= maxPoints) {
        issues.push({
          type: 'diagonal-cut',
          message: `${start.name}→${end.name} が道路を無視した斜め接続に見える`,
        });
      }
    }

    // 舞浜駅前の正規ターミナル進入／出発を誤検知しないよう周回検出範囲を調整
    // 2-urayasu-maihama の新浦安駅北口→美浜東団地は東側迂回が正規のため、全体スキャンせず問題区間のみ検査
    if (systemKey !== '2-urayasu-maihama') {
      const enclosureStart = 12;
      const enclosureLimit = systemKey === '2-maihama'
        ? Math.max(20, path.length - 25)
        : path.length;
      for (let index = enclosureStart; index < enclosureLimit && issues.length === 0; index += 1) {
        for (let back = 8; back <= 28 && index - back >= 0; back += 1) {
          const gap = distanceMeters(path[index], path[index - back]);
          if (gap > 28) continue;
          const loop = path.slice(index - back, index + 1);
          const length = pathLength(loop);
          if (length < 220 || length > 700) continue;
          issues.push({ type: 'block-enclosure', message: `円形・矩形周回疑い（周長約${Math.round(length)}m）` });
          break;
        }
      }
    }

    metrics.selfIntersections = countSelfIntersections(path);
    // overview_path の微細交差は無視し、明確な道路交差のみ失敗扱い
    if (systemKey === '2-urayasu-maihama' && metrics.selfIntersections >= 2) {
      issues.push({ type: 'self-intersection', message: `経路の自己交差 ${metrics.selfIntersections} 件` });
    }

    if (systemKey === '2-maihama' && stops.length >= 18) {
      const stop16 = stops[15];
      const stop17 = stops[16];
      const stop18 = stops[17];
      const i16 = nearestPathIndex(path, stop16).index;
      const i17 = nearestPathIndex(path, stop17).index;
      const i18 = nearestPathIndex(path, stop18).index;
      if (!(i16 < i17 && i17 < i18)) {
        issues.push({ type: 'order', message: '16→17→18 の通過順が崩れています' });
      } else {
        const segment1718 = path.slice(i17, i18 + 1);
        const along = pathLength(segment1718);
        const direct = distanceMeters(stop17, stop18);
        // 舞浜駅ターミナル進入を含めても通常 1.5km 未満
        if (along > Math.max(1600, direct * 4.5)) {
          issues.push({ type: 'detour', message: `17→18 が極端に長い（約${Math.round(along)}m）` });
        }
        const mid1716 = path.slice(i16, i17 + 1);
        let backToward16 = 0;
        for (let index = 1; index < mid1716.length; index += 1) {
          const to16 = distanceMeters(mid1716[index], stop16);
          const prevTo16 = distanceMeters(mid1716[index - 1], stop16);
          if (to16 + 25 < prevTo16) backToward16 += distanceMeters(mid1716[index - 1], mid1716[index]);
        }
        if (backToward16 > 180) {
          issues.push({ type: 'backtrack', message: '16→17 で運動公園方向へ戻る折返し疑い' });
        }
      }
    }

    if (systemKey === '2-urayasu-maihama' && stops.length >= 18) {
      const indices = [];
      let cursor = 0;
      for (let stopIndex = 0; stopIndex < stops.length; stopIndex += 1) {
        const found = nearestPathIndex(path, stops[stopIndex], cursor);
        if (found.distance > 140) {
          issues.push({
            type: 'order',
            message: `${stopIndex + 1}（${stops[stopIndex].name}）が経路上で見つかりません`,
          });
          break;
        }
        if (stopIndex > 0 && found.index < cursor) {
          issues.push({
            type: 'order',
            message: `${stopIndex}→${stopIndex + 1}（${stops[stopIndex - 1].name}→${stops[stopIndex].name}）の通過順が崩れています`,
          });
          metrics.revisitPairs.push([stops[stopIndex - 1].name, stops[stopIndex].name]);
          break;
        }
        indices.push(found.index);
        cursor = found.index;
      }

      const checkNoBacktrack = (fromIndex, toIndex, label) => {
        if (indices.length <= toIndex) return;
        const start = indices[fromIndex];
        const end = indices[toIndex];
        if (!(start < end)) return;
        const segment = path.slice(start, end + 1);
        const origin = stops[fromIndex];
        let back = 0;
        for (let index = 1; index < segment.length; index += 1) {
          const toOrigin = distanceMeters(segment[index], origin);
          const prev = distanceMeters(segment[index - 1], origin);
          if (toOrigin + 30 < prev) back += distanceMeters(segment[index - 1], segment[index]);
        }
        if (back > 160) {
          issues.push({ type: 'backtrack', message: `${label} で前停留所方向へ戻る折返し疑い（約${Math.round(back)}m）` });
          metrics.revisitPairs.push([stops[fromIndex].name, stops[toIndex].name]);
        }
        const along = pathLength(segment);
        const direct = distanceMeters(stops[fromIndex], stops[toIndex]);
        if (along > Math.max(1200, direct * 4.2)) {
          issues.push({ type: 'detour', message: `${label} が極端に長い（約${Math.round(along)}m）` });
        }
      };

      checkNoBacktrack(0, 4, '1→5（舞浜駅〜見明川住宅）');
      checkNoBacktrack(8, 10, '9→11（サンコーポ東口〜若潮公園）');
      checkNoBacktrack(11, 12, '12→13（新浦安駅北口〜美浜東団地）');

      const detectLocalEnclosure = (fromIndex, toIndex, label) => {
        if (indices.length <= toIndex) return;
        const start = indices[fromIndex];
        const end = indices[toIndex];
        if (!(start < end) || end - start < 12) return;
        const segment = path.slice(start, end + 1);
        for (let index = 10; index < segment.length; index += 1) {
          for (let back = 8; back <= 24 && index - back >= 0; back += 1) {
            const gap = distanceMeters(segment[index], segment[index - back]);
            if (gap > 22) continue;
            const loop = segment.slice(index - back, index + 1);
            const length = pathLength(loop);
            if (length < 280 || length > 600) continue;
            issues.push({ type: 'block-enclosure', message: `${label} で円形・矩形周回疑い（周長約${Math.round(length)}m）` });
            return;
          }
        }
      };
      detectLocalEnclosure(0, 4, '1→5');
      detectLocalEnclosure(8, 10, '9→11');
    }

    return { valid: issues.length === 0, issues, metrics };
  }

  function buildSegmentWaypoints(systemKey, fromStop, toStop) {
    const key = `${fromStop.name}->${toStop.name}`;
    return (IMAGAWA_PATH_SHAPING_POINTS[systemKey]?.[key] || []).map((point) => ({
      location: { lat: point.lat, lng: point.lng },
      stopover: false,
    }));
  }

  function segmentBoundsForSystem(systemKey, stopCount) {
    if (systemKey === '2-maihama') {
      return MAIHAMA_SEGMENT_BOUNDS.filter(([start, end]) => start < stopCount && end < stopCount);
    }
    if (systemKey === '2-urayasu-maihama') {
      return URAYASU_MAIHAMA_SEGMENT_BOUNDS.filter(([start, end]) => start < stopCount && end < stopCount);
    }
    const bounds = [];
    for (let start = 0; start < stopCount - 1; start += MAX_STOPS_PER_REQUEST - 1) {
      const end = Math.min(start + MAX_STOPS_PER_REQUEST - 1, stopCount - 1);
      bounds.push([start, end]);
    }
    return bounds;
  }

  async function directionsPath(googleApi, stops, statusCallback, systemKey = '') {
    const service = new googleApi.maps.DirectionsService();
    const fullPath = [];
    let requestCount = 0;
    const bounds = segmentBoundsForSystem(systemKey, stops.length);
    for (const [start, end] of bounds) {
      const origin = stops[start];
      const destination = stops[end];
      statusCallback?.(`道路ルートを生成中… ${start + 1}〜${end + 1}/${stops.length}`);
      const middleStops = stops.slice(start + 1, end);
      const waypoints = [];
      if (end === start + 1) {
        waypoints.push(...buildSegmentWaypoints(systemKey, origin, destination));
      } else {
        for (let index = 0; index < middleStops.length; index += 1) {
          const prev = index === 0 ? origin : middleStops[index - 1];
          const current = middleStops[index];
          waypoints.push(...buildSegmentWaypoints(systemKey, prev, current));
          waypoints.push({ location: { lat: current.lat, lng: current.lng }, stopover: false });
        }
        const lastMiddle = middleStops.at(-1) || origin;
        waypoints.push(...buildSegmentWaypoints(systemKey, lastMiddle, destination));
      }
      const result = await service.route({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        optimizeWaypoints: false,
        travelMode: googleApi.maps.TravelMode.DRIVING,
        avoidFerries: true,
        provideRouteAlternatives: false,
      });
      requestCount += 1;
      const path = result.routes?.[0]?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (path.length < 2) throw new Error('Google Mapsから道路ルートを取得できませんでした。');
      if (fullPath.length) path.shift();
      fullPath.push(...path);
    }
    return { path: fullPath, requestCount };
  }

  async function resolveSystem(key, { force = false, statusCallback = null } = {}) {
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[key];
    const system = route?.systems?.[key];
    if (!route || !definition || !system) throw new Error('今川線の系統データがありません。');
    if (
      !force
      && system.stops.every(validPosition)
      && system.path?.length > 2
      && !system.pathInvalid
      && !system.stops.some((stop) => String(stop.source || '').startsWith('shared-direction'))
      && (
        system.resolvedVersion === VERSION
        // 2-maihama は確定済みルートを VERSION 更新だけでは再生成しない
        || (key === '2-maihama' && system.resolvedVersion && route.imagawaPathPolicyVersion)
      )
    ) {
      return system;
    }

    const googleApi = await loadMaps();
    let osmPayload = null;
    let osmError = null;
    if (definition.relationId && key !== '2-maihama' && key !== '2-urayasu-maihama') {
      statusCallback?.(`OSM route relation ${definition.relationId}を取得中…`);
      try {
        osmPayload = await fetchJson(`${OSM_API_BASE}${definition.relationId}`);
      } catch (error) {
        osmError = error instanceof Error ? error.message : String(error);
      }
    }
    const osmMapped = mapOsmStops(system.stops, osmPayload?.stops || []);
    const bank = coordinateBank(route);
    const usedPlaceIds = new Set();
    let previous = null;
    const stats = { osmCount: 0, sharedCount: 0, googleCount: 0, fallbackCount: 0, authoritativeCount: 0 };
    const platforms = AUTHORITATIVE_PLATFORMS[key] || null;

    for (let index = 0; index < system.stops.length; index += 1) {
      const stop = system.stops[index];
      const name = definition.names[index];
      statusCallback?.(`停留所位置を照合中… ${index + 1}/${system.stops.length} ${stop.name}`);
      stop.systemCode = key;
      stop.directionKey = coordinateKey(key, name);
      stop.directionGroup = definition.directionGroup;

      if (!force && stop.manualOverride && validPosition(stop) && !String(stop.source || '').startsWith('shared')) {
        previous = { lat: stop.lat, lng: stop.lng };
        bank.set(coordinateKey(key, stop.name), stop);
        continue;
      }

      let resolved = null;
      if (platforms?.[name]) {
        resolved = {
          lat: platforms[name].lat,
          lng: platforms[name].lng,
          placeId: null,
          address: stop.address,
          googleMapsURI: null,
          source: 'authoritative-platform',
          name,
          platformId: platforms[name].platformId || null,
        };
      }
      if (!resolved) resolved = osmMapped[index];
      // 今川線では directionGroup 共有座標は使わない（系統ごとに乗り場が異なるため）
      if (!resolved && key !== '2-maihama' && key !== '2-urayasu-maihama') {
        const shared = bank.get(coordinateKey(key, stop.name));
        if (shared && validPosition(shared)) {
          resolved = {
            lat: shared.lat, lng: shared.lng, placeId: shared.placeId || null,
            address: shared.address || stop.address, googleMapsURI: shared.googleMapsURI || null,
            source: shared.manualOverride ? 'shared-manual' : 'system-local',
          };
        }
      }
      if (!resolved) resolved = await searchGoogleStop(googleApi, definition, stop, previous, usedPlaceIds);

      stop.lat = Number(resolved.lat);
      stop.lng = Number(resolved.lng);
      stop.placeId = resolved.placeId || null;
      stop.address = resolved.address || stop.address;
      stop.googleMapsURI = resolved.googleMapsURI || null;
      stop.source = resolved.source;
      stop.sourceName = resolved.name || name;
      stop.platformId = resolved.platformId || stop.platformId || null;
      stop.manualOverride = false;
      stop.verifiedAt = new Date().toISOString();
      if (stop.placeId) usedPlaceIds.add(stop.placeId);
      if (resolved.source === 'authoritative-platform') stats.authoritativeCount += 1;
      else if (resolved.source === 'osm-stop') stats.osmCount += 1;
      else if (String(resolved.source).startsWith('shared') || resolved.source === 'system-local') stats.sharedCount += 1;
      else if (resolved.source === 'google-places') stats.googleCount += 1;
      else stats.fallbackCount += 1;
      bank.set(coordinateKey(key, stop.name), stop);
      previous = { lat: stop.lat, lng: stop.lng };
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    let googleResult = await directionsPath(googleApi, system.stops, statusCallback, key);
    let validation = validateRoadPath(googleResult.path, system.stops, key);
    if (!validation.valid) {
      statusCallback?.(`検証失敗のため再生成します… ${validation.issues[0]?.message || ''}`);
      invalidateSystemPath(system);
      googleResult = await directionsPath(googleApi, system.stops, statusCallback, key);
      validation = validateRoadPath(googleResult.path, system.stops, key);
    }

    if (!validation.valid) {
      invalidateSystemPath(system);
      system.pathInvalid = true;
      system.pathIssues = validation.issues;
      system.validation = {
        valid: false,
        issues: validation.issues,
        metrics: validation.metrics || null,
        osmError,
        googleDirectionsRequests: googleResult.requestCount,
      };
      save();
      const detail = validation.issues.map((item) => item.message).join(' / ');
      throw new Error(`停留所座標または経由点を確認してください（${detail}）`);
    }

    // OSM LineString は道路ルートに使わない（Google Directions のみ）
    system.path = googleResult.path;
    system.pathSource = 'Google Directions overview_path（停留所順固定・stopover:false）';
    system.positionSource = (key === '2-maihama' || key === '2-urayasu-maihama')
      ? '系統キー単位の確定platform座標（往復共有なし）'
      : 'OSM停留所・系統ローカル座標・Google Maps';
    system.coordinateStats = stats;
    system.validation = {
      valid: true,
      issues: [],
      metrics: validation.metrics || null,
      osmError,
      googleDirectionsRequests: googleResult.requestCount,
    };
    system.pathInvalid = false;
    system.pathIssues = null;
    system.resolvedVersion = VERSION;
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    route.inbound = [];
    route.imagawaPathPolicyVersion = PATH_POLICY_VERSION;
    save();
    statusCallback?.(`検証完了｜${system.pathSource}`);
    return system;
  }

  async function resolveAllSystems(force = false, statusCallback = null) {
    const order = ['2-maihama', '2-urayasu-maihama', '2-chidori', '2-urayasu-chidori', '2-kitaguchi'];
    for (const key of order) {
      const definition = SYSTEM_DEFINITIONS[key];
      statusCallback?.(`5パターン一括検証｜${definition.title}`);
      await resolveSystem(key, { force, statusCallback });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
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
    const segmentLength = metrics.cumulative[index] - startDistance || 1;
    const ratio = (distance - startDistance) / segmentLength;
    const start = path[index - 1];
    const end = path[index];
    return {
      position: { lat: start.lat + (end.lat - start.lat) * ratio, lng: start.lng + (end.lng - start.lng) * ratio },
      next: end,
    };
  }

  function pointSegmentDistance(point, a, b) {
    const refLat = point.lat * Math.PI / 180;
    const meterLat = 111320;
    const meterLng = 111320 * Math.cos(refLat);
    const ax = (a.lng - point.lng) * meterLng;
    const ay = (a.lat - point.lat) * meterLat;
    const bx = (b.lng - point.lng) * meterLng;
    const by = (b.lat - point.lat) * meterLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy || 1;
    let ratio = -(ax * dx + ay * dy) / lengthSquared;
    ratio = Math.max(0, Math.min(1, ratio));
    return { distance: Math.hypot(ax + ratio * dx, ay + ratio * dy), ratio };
  }

  function mapStopsToRoute(stops, path, metrics) {
    const distances = [0];
    let minimumIndex = 0;
    for (let stopIndex = 1; stopIndex < stops.length - 1; stopIndex += 1) {
      let best = null;
      for (let index = minimumIndex; index < path.length - 1; index += 1) {
        const projected = pointSegmentDistance(stops[stopIndex], path[index], path[index + 1]);
        const routeDistance = metrics.cumulative[index]
          + projected.ratio * (metrics.cumulative[index + 1] - metrics.cumulative[index]);
        const score = projected.distance + Math.max(0, routeDistance - (metrics.cumulative[minimumIndex] || 0)) * 0.01;
        if (!best || score < best.score) best = { score, routeDistance, segmentIndex: index };
        if (projected.distance <= 35) break;
      }
      minimumIndex = Math.max(minimumIndex, best?.segmentIndex || minimumIndex);
      distances.push(Math.max(distances.at(-1) + 3, best?.routeDistance || distances.at(-1) + 3));
    }
    distances.push(metrics.total);
    return distances;
  }

  function markerIcon(googleApi, number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"><circle cx="19" cy="19" r="17" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="19" y="24" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${number}</text></svg>`;
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(38, 38), anchor: new googleApi.maps.Point(19, 19) };
  }

  function busIcon(googleApi) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><circle cx="26" cy="26" r="24" fill="white" stroke="#0f5ea8" stroke-width="3"/><text x="26" y="35" text-anchor="middle" font-size="28">🚌</text></svg>';
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(52, 52), anchor: new googleApi.maps.Point(26, 26) };
  }

  function getImageEntry(route, definition, stop) {
    return route.imagawaStopImages?.[imageKey(definition, stop)] || null;
  }

  function showStopImage(route, definition, stop, street) {
    const entry = getImageEntry(route, definition, stop);
    const existing = street.querySelector('.stop-image-display-v25.imagawa-stop-image');
    existing?.remove();
    if (!entry?.dataUrl) return false;
    const overlay = document.createElement('div');
    overlay.className = 'stop-image-display-v25 imagawa-stop-image';
    overlay.innerHTML = `<img alt="${escHtml(stop.name)}の停留所画像" src="${entry.dataUrl}">`;
    street.appendChild(overlay);
    return true;
  }

  function hideStopImage(street) {
    street?.querySelector('.imagawa-stop-image')?.remove();
  }

  async function drawGuidance(route, definition, system, token) {
    cleanupGuidance?.();
    const status = document.getElementById('mapStatus');
    if (!system.stops.every(validPosition) || !Array.isArray(system.path) || system.path.length < 2) {
      await resolveSystem(definition.key, { statusCallback: (text) => { if (status) status.textContent = text; } });
    }
    if (token !== renderToken || page !== 'routes' || routeState.routeId !== ROUTE_ID) return;
    const googleApi = await loadMaps();
    const stops = system.stops;
    const path = system.path;
    const metrics = buildMetrics(path);
    const stopDistances = mapStopsToRoute(stops, path, metrics);
    const center = { lat: stops[0].lat, lng: stops[0].lng };
    const map = new googleApi.maps.Map(document.getElementById('routeMap'), {
      center, zoom: MAP_ZOOM, mapTypeControl: false, scaleControl: true,
      streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy',
    });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), {
      position: center, pov: { heading: heading(stops[0], stops[1] || stops[0]), pitch: 0 }, zoom: 1,
      motionTracking: false, addressControl: false,
    });
    const street = document.getElementById('street');
    street.style.position = 'relative';
    const telop = document.createElement('div');
    telop.className = 'station-name-telop guidance-station-v22';
    street.appendChild(telop);
    const markers = stops.map((stop, index) => {
      const marker = new googleApi.maps.Marker({ map, position: { lat: stop.lat, lng: stop.lng }, icon: markerIcon(googleApi, index + 1), title: displayStopName(stop) });
      return marker;
    });
    const line = new googleApi.maps.Polyline({ map, path, strokeColor: '#0f5ea8', strokeOpacity: 0.95, strokeWeight: 7 });
    const vehicle = new googleApi.maps.Marker({ map, position: center, icon: busIcon(googleApi), zIndex: 1000, title: `今川線 ${definition.title}` });

    const controls = document.createElement('div');
    controls.className = 'bus-controls bus-controls-v22';
    controls.innerHTML = `
      <button id="driveStartPause" class="primary bus-control-button" type="button"><span class="bus-label-full">スタート</span><span class="bus-label-short">スタート</span></button>
      <button id="drivePrevious" class="secondary bus-control-button" type="button"><span class="bus-label-full">前の停留所</span><span class="bus-label-short">前</span></button>
      <button id="driveNext" class="secondary bus-control-button" type="button"><span class="bus-label-full">次の停留所</span><span class="bus-label-short">次</span></button>
      <button id="driveReset" class="secondary bus-control-button" type="button"><span class="bus-label-full">S地点</span><span class="bus-label-short">S地点</span></button>
      <span id="driveProgress" class="bus-progress">始発：${escHtml(stops[0].name)}</span>`;
    document.querySelector('.guidance-v22-split')?.insertAdjacentElement('afterend', controls);

    const sequence = document.createElement('section');
    sequence.className = 'route-sequence-card';
    sequence.innerHTML = `<div class="route-sequence-title">系統2｜${escHtml(definition.title)}｜${stops.length}停留所</div><div class="route-sequence">${stops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-imagawa-stop="${index}">${index + 1}. ${escHtml(displayStopName(stop))}</button>${index < stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    controls.insertAdjacentElement('afterend', sequence);

    const progress = document.getElementById('driveProgress');
    const startPause = document.getElementById('driveStartPause');
    const previousButton = document.getElementById('drivePrevious');
    const nextButton = document.getElementById('driveNext');
    let traveled = 0;
    let currentStopIndex = 0;
    let nextStopIndex = 1;
    let running = false;
    let frame = 0;
    let lastTime = null;
    let dwellUntil = 0;
    let requestToken = 0;

    const highlight = (index) => {
      sequence.querySelectorAll('[data-imagawa-stop]').forEach((button) => button.classList.toggle('active', Number(button.dataset.imagawaStop) === index));
      sequence.querySelector(`[data-imagawa-stop="${index}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };

    const updateButtons = () => {
      previousButton.disabled = currentStopIndex <= 0;
      nextButton.disabled = currentStopIndex >= stops.length - 1;
      const labelNode = startPause.querySelector('.bus-label-full');
      const shortNode = startPause.querySelector('.bus-label-short');
      const text = running ? '一時停止' : 'スタート';
      if (labelNode) labelNode.textContent = text;
      if (shortNode) shortNode.textContent = text;
    };

    const setStreetAtStop = async (index) => {
      const stop = stops[index];
      const tokenNow = ++requestToken;
      panorama.setPosition({ lat: stop.lat, lng: stop.lng });
      panorama.setPov({ heading: heading(stop, stops[index + 1] || stops[index - 1] || stop), pitch: 0 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (tokenNow !== requestToken) return;
    };

    const showTelop = (index, text = '停車中') => {
      telop.innerHTML = `<span>停留所</span><strong>${escHtml(stops[index].name)}</strong><small class="station-telop-dir">${escHtml(definition.title)}</small><em>${text}</em>`;
      telop.classList.add('show');
    };

    const selectStop = (index, autoContinue = false) => {
      if (index < 0 || index >= stops.length) return;
      currentStopIndex = index;
      nextStopIndex = index + 1;
      traveled = stopDistances[index];
      vehicle.setPosition({ lat: stops[index].lat, lng: stops[index].lng });
      map.setCenter({ lat: stops[index].lat, lng: stops[index].lng });
      map.setZoom(MAP_ZOOM);
      highlight(index);
      showTelop(index, autoContinue ? '停車中 あと3秒' : '選択中');
      setStreetAtStop(index);
      const usedImage = showStopImage(route, definition, stops[index], street);
      if (autoContinue && running) {
        dwellUntil = performance.now() + DWELL_MS;
        status.textContent = `${displayStopName(stops[index])}に到着｜${usedImage ? '停留所画像を表示' : 'Street Viewを表示'}｜3秒停車`;
      } else {
        dwellUntil = 0;
        status.textContent = `${index + 1}. ${displayStopName(stops[index])}｜登録座標 ${stops[index].lat.toFixed(6)}, ${stops[index].lng.toFixed(6)}`;
      }
      progress.textContent = `${running ? '走行中' : '停止中'}｜現在：${stops[index].name}｜次：${stops[index + 1]?.name || '終点'}`;
      updateButtons();
    };

    const tick = (now) => {
      if (!running) return;
      if (dwellUntil) {
        if (now < dwellUntil) {
          const seconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
          showTelop(currentStopIndex, `停車中 あと${seconds}秒`);
          frame = requestAnimationFrame(tick);
          return;
        }
        dwellUntil = 0;
        hideStopImage(street);
        telop.classList.remove('show');
        if (currentStopIndex >= stops.length - 1) {
          running = false;
          progress.textContent = `停止中｜終点：${stops.at(-1).name}`;
          status.textContent = `終点 ${stops.at(-1).name} に到着しました。`;
          updateButtons();
          return;
        }
      }
      if (lastTime === null) lastTime = now;
      const delta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      traveled = Math.min(metrics.total, traveled + (SPEED_KMH * 1000 / 3600) * delta);
      if (nextStopIndex < stops.length && traveled >= stopDistances[nextStopIndex]) {
        selectStop(nextStopIndex, true);
        lastTime = null;
        frame = requestAnimationFrame(tick);
        return;
      }
      const point = positionAtDistance(path, metrics, traveled);
      vehicle.setPosition(point.position);
      map.setCenter(point.position);
      panorama.setPosition(point.position);
      panorama.setPov({ heading: heading(point.position, point.next), pitch: 0 });
      progress.textContent = `走行中｜通過：${stops[currentStopIndex].name}｜次：${stops[nextStopIndex]?.name || '終点'}`;
      frame = requestAnimationFrame(tick);
    };

    const pause = () => {
      running = false;
      cancelAnimationFrame(frame);
      lastTime = null;
      status.textContent = '走行を一時停止しました。';
      updateButtons();
    };

    const start = () => {
      if (running) return;
      if (currentStopIndex >= stops.length - 1) selectStop(0, false);
      hideStopImage(street);
      telop.classList.remove('show');
      running = true;
      dwellUntil = 0;
      lastTime = null;
      status.textContent = `${stops[currentStopIndex].name}から走行を開始しました。`;
      updateButtons();
      frame = requestAnimationFrame(tick);
    };

    startPause.onclick = () => { if (running) pause(); else start(); };
    previousButton.onclick = () => { pause(); selectStop(currentStopIndex - 1, false); };
    nextButton.onclick = () => { pause(); selectStop(currentStopIndex + 1, false); };
    document.getElementById('driveReset').onclick = () => { pause(); selectStop(0, false); status.textContent = `S地点（${stops[0].name}）へ戻しました。`; };
    sequence.querySelectorAll('[data-imagawa-stop]').forEach((button) => { button.onclick = () => { pause(); selectStop(Number(button.dataset.imagawaStop), false); }; });
    markers.forEach((marker, index) => marker.addListener('click', () => { pause(); selectStop(index, false); }));

    selectStop(0, false);
    status.textContent = `今川線｜系統2｜${definition.title}｜${stops.length}停留所｜${system.pathSource}`;
    cleanupGuidance = () => {
      running = false;
      cancelAnimationFrame(frame);
      requestToken += 1;
      markers.forEach((marker) => marker.setMap(null));
      line.setMap(null);
      vehicle.setMap(null);
      controls.remove();
      sequence.remove();
      telop.remove();
      hideStopImage(street);
    };
  }

  function sourcePanel() {
    // 一般利用画面には検証パネルを出さない（再検証は resolveSystem 内部で実行）
    return '';
  }

  routes = function routesImagawaV1() {
    const route = ensureRoute();
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) {
      cleanupGuidance?.();
      previousRoutes();
      return;
    }
    editorRouteId = ROUTE_ID;
    routeState.direction = 'outbound';
    const key = getSelectedSystemKey();
    const definition = SYSTEM_DEFINITIONS[key];
    const system = selectedSystem(route, key);
    route.outbound = system.stops;
    route.inbound = [];
    renderToken += 1;
    const token = renderToken;

    shell(`<section class="guidance-page-v26">
      <div class="controls manual-route-controls">
        <label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${escHtml(label(item))}</option>`).join('')}</select></label>
        <label>系統<select id="systemSelect">${Object.values(SYSTEM_DEFINITIONS).map((item) => `<option value="${item.key}" ${item.key === key ? 'selected' : ''}>2｜${escHtml(item.title)}</option>`).join('')}</select></label>
      </div>
      <div class="split guidance-v22-split">
        <div class="guidance-map-wrap-v22"><div id="routeMap" class="map guidance-map-v22"></div><div class="guidance-version-v22">今川線・系統2</div></div>
        <div id="street" class="street guidance-street-v22"></div>
      </div>
      <p id="mapStatus" class="status">今川線を準備しています…</p>
    </section>`);

    document.getElementById('routeSelect').onchange = (event) => { routeState.routeId = event.target.value; routes(); };
    document.getElementById('systemSelect').onchange = (event) => {
      setSelectedSystemKey(event.target.value);
      editorSystemKey = event.target.value;
      routes();
    };

    drawGuidance(route, definition, system, token).catch((error) => {
      const node = document.getElementById('mapStatus');
      if (node) { node.dataset.state = 'error'; node.textContent = error instanceof Error ? error.message : '今川線を表示できませんでした。'; }
    });
  };

  function parseCoordinate(value) {
    const number = Number(String(value ?? '').trim());
    return Number.isFinite(number) ? number : null;
  }

  async function mountEditorMap(containerId, latInputId, lngInputId, statusId, initial) {
    editorMapCleanup?.();
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const googleApi = await loadMaps();
      const start = validPosition(initial) ? initial : { lat: 35.645, lng: 139.902 };
      const map = new googleApi.maps.Map(container, { center: start, zoom: validPosition(initial) ? 17 : 13, mapTypeControl: false, streetViewControl: false });
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
      editorMapCleanup = () => { clickListener.remove(); dragListener.remove(); };
    } catch (error) {
      document.getElementById(statusId).textContent = error instanceof Error ? error.message : '地図を読み込めませんでした。';
    }
  }

  function closeEditorDialog() {
    editorMapCleanup?.();
    editorMapCleanup = null;
    document.getElementById('stopEditDialog')?.remove();
  }

  function readImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('画像形式を確認してください。'));
      image.onload = () => resolve(image);
      image.src = src;
    });
  }

  async function readOrientedSource(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fallback */ }
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    return readImageElement(dataUrl);
  }

  function canvasDataUrl(source, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/webp', quality);
    if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', quality);
    return result;
  }

  async function compressImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
    const source = await readOrientedSource(file);
    const width0 = source.naturalWidth || source.width || 1;
    const height0 = source.naturalHeight || source.height || 1;
    const scale = Math.min(1, 1280 / width0, 720 / height0);
    let width = Math.max(1, Math.round(width0 * scale));
    let height = Math.max(1, Math.round(height0 * scale));
    let quality = 0.78;
    let dataUrl = canvasDataUrl(source, width, height, quality);
    for (let attempt = 0; attempt < 14 && dataUrl.length > MAX_DATA_URL_CHARS; attempt += 1) {
      if (quality > 0.42) quality -= 0.07;
      else { width = Math.max(420, Math.round(width * 0.86)); height = Math.max(236, Math.round(height * 0.86)); }
      dataUrl = canvasDataUrl(source, width, height, quality);
    }
    if (typeof source.close === 'function') source.close();
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('画像を十分に圧縮できませんでした。別の写真を試してください。');
    return dataUrl;
  }

  function propagateManualCoordinate(route, definition, stop) {
    // 今川線は系統ごとに乗り場が異なるため、他系統への座標伝播はしない。
    // 画像キー（directionGroup|name）とは分離して管理する。
    const system = route.systems?.[definition.key];
    if (!system) return;
    (system.stops || []).forEach((target) => {
      if (normalize(target.name) !== normalize(stop.name)) return;
      if (target === stop) return;
      // 同一系統内の同名（通常は無い）のみ同期
      target.lat = stop.lat;
      target.lng = stop.lng;
      target.address = stop.address;
      target.manualOverride = true;
      target.source = 'manual-confirmed';
      target.systemCode = definition.key;
      target.directionKey = coordinateKey(definition.key, stop.name);
      target.verifiedAt = stop.verifiedAt;
    });
    system.resolvedVersion = null;
    system.path = [];
  }

  function openRoute2StopEditor(systemKey, stopIndex) {
    closeEditorDialog();
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[systemKey];
    const system = route.systems[systemKey];
    const stop = system.stops[stopIndex];
    if (!definition || !stop) return;
    const bankKey = imageKey(definition, stop);
    const currentImage = route.imagawaStopImages?.[bankKey]?.dataUrl || '';
    const state = { dataUrl: currentImage, removeImage: false, processing: false };
    const dialog = document.createElement('div');
    dialog.id = 'stopEditDialog';
    dialog.className = 'stop-edit-backdrop';
    dialog.dataset.routeId = ROUTE_ID;
    dialog.innerHTML = `<section class="stop-edit-dialog" role="dialog" aria-modal="true">
      <div class="stop-edit-header"><div><h2>今川線 停留所設定</h2><p>2｜${escHtml(definition.title)}・${stopIndex + 1} / ${system.stops.length}</p></div><button type="button" id="closeStopEditor" class="stop-edit-close">×</button></div>
      <div class="stop-edit-grid">
        <label>停留所名<input id="editStopName" value="${escHtml(stop.name)}" readonly></label>
        <label>補足<input id="editStopNote" value="${escHtml(stop.note || '')}"></label>
        <label>住所・場所<input id="editStopAddress" value="${escHtml(stop.address || '')}"></label>
        <label>緯度<input id="editStopLat" inputmode="decimal" value="${validPosition(stop) ? stop.lat.toFixed(7) : ''}"></label>
        <label>経度<input id="editStopLng" inputmode="decimal" value="${validPosition(stop) ? stop.lng.toFixed(7) : ''}"></label>
      </div>
      <div class="stop-edit-actions-inline"><button type="button" id="editStopGeocode" class="secondary">住所から位置を取得</button><span id="editStopStatus" class="status">画像のみ手動登録できます。位置修正は同じ進行方向の同名停留所へ共有されます。</span></div>
      <div id="editStopMap" class="stop-edit-map"></div>
      <section class="stop-image-editor-v25">
        <div class="stop-image-editor-heading-v25"><div><strong>停留所の停止画像</strong><span>停車時にStreet View領域へ表示。同じ進行方向の共通系統で共有します。</span></div><button type="button" class="secondary" id="removeImagawaImage">画像を削除</button></div>
        <label class="stop-image-drop-v25" tabindex="0"><input id="imagawaImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden><img id="imagawaImagePreview" alt="停留所画像プレビュー" ${currentImage ? `src="${currentImage}"` : 'hidden'}><span id="imagawaImageEmpty" ${currentImage ? 'hidden' : ''}><b>画像を選択</b><br>ドラッグ＆ドロップ<br>スクリーンショットはCtrl＋V</span></label>
        <p class="status stop-image-status-v25" id="imagawaImageStatus">${currentImage ? '登録画像あり。「変更を保存」で確定します。' : 'JPEG / PNG / WebPを選択してください。'}</p>
      </section>
      <div class="stop-edit-footer">
        <button type="button" id="cancelStopEdit" class="secondary">キャンセル</button>
        <button type="button" id="previousStopEdit" class="secondary" ${stopIndex > 0 ? '' : 'disabled'}>← 前の停留所</button>
        <button type="button" id="nextStopEdit" class="secondary" ${stopIndex < system.stops.length - 1 ? '' : 'disabled'}>次の停留所 →</button>
        <button type="button" id="saveStopEdit" class="primary">変更を保存</button>
      </div>
    </section>`;
    document.body.appendChild(dialog);

    const preview = document.getElementById('imagawaImagePreview');
    const empty = document.getElementById('imagawaImageEmpty');
    const imageStatus = document.getElementById('imagawaImageStatus');
    const renderImage = () => {
      if (state.dataUrl && !state.removeImage) {
        preview.src = state.dataUrl; preview.hidden = false; empty.hidden = true;
      } else { preview.removeAttribute('src'); preview.hidden = true; empty.hidden = false; }
    };
    const acceptImage = async (file) => {
      if (!file || state.processing) return;
      state.processing = true;
      imageStatus.textContent = '画像を向き補正・圧縮しています…';
      try {
        state.dataUrl = await compressImage(file);
        state.removeImage = false;
        imageStatus.textContent = '画像を準備しました。「変更を保存」で確定します。';
        renderImage();
      } catch (error) { imageStatus.textContent = error instanceof Error ? error.message : '画像を処理できませんでした。'; }
      finally { state.processing = false; }
    };
    document.getElementById('imagawaImageFile').onchange = (event) => acceptImage(event.target.files?.[0]);
    const drop = dialog.querySelector('.stop-image-drop-v25');
    drop.ondragover = (event) => { event.preventDefault(); drop.classList.add('dragging'); };
    drop.ondragleave = () => drop.classList.remove('dragging');
    drop.ondrop = (event) => { event.preventDefault(); drop.classList.remove('dragging'); acceptImage([...(event.dataTransfer?.files || [])].find((file) => file.type.startsWith('image/'))); };
    const pasteHandler = (event) => {
      if (!dialog.isConnected) return;
      const file = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith('image/'))?.getAsFile();
      if (file) { event.preventDefault(); acceptImage(file); }
    };
    document.addEventListener('paste', pasteHandler, true);
    document.getElementById('removeImagawaImage').onclick = () => { state.dataUrl = ''; state.removeImage = true; imageStatus.textContent = '画像を削除予定です。「変更を保存」で確定します。'; renderImage(); };

    const saveCurrent = () => {
      if (state.processing) { imageStatus.textContent = '画像処理が終わるまでお待ちください。'; return false; }
      const lat = parseCoordinate(document.getElementById('editStopLat').value);
      const lng = parseCoordinate(document.getElementById('editStopLng').value);
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        document.getElementById('editStopStatus').textContent = '正しい緯度・経度を入力してください。';
        return false;
      }
      stop.note = document.getElementById('editStopNote').value.trim();
      stop.address = document.getElementById('editStopAddress').value.trim();
      stop.lat = lat; stop.lng = lng; stop.manualOverride = true; stop.source = 'manual-confirmed'; stop.verifiedAt = new Date().toISOString();
      propagateManualCoordinate(route, definition, stop);
      if (state.removeImage) delete route.imagawaStopImages[bankKey];
      else if (state.dataUrl) route.imagawaStopImages[bankKey] = { dataUrl: state.dataUrl, updatedAt: new Date().toISOString(), sourceSystem: systemKey, sourceStopId: stop.id };
      route.imagawaStopImageUpdatedAt = new Date().toISOString();
      save();
      return true;
    };

    const close = () => { document.removeEventListener('paste', pasteHandler, true); closeEditorDialog(); };
    document.getElementById('closeStopEditor').onclick = close;
    document.getElementById('cancelStopEdit').onclick = close;
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    document.getElementById('saveStopEdit').onclick = () => { if (!saveCurrent()) return; close(); stopEditor(); };
    document.getElementById('previousStopEdit').onclick = () => { if (!saveCurrent()) return; close(); openRoute2StopEditor(systemKey, stopIndex - 1); };
    document.getElementById('nextStopEdit').onclick = () => { if (!saveCurrent()) return; close(); openRoute2StopEditor(systemKey, stopIndex + 1); };
    document.getElementById('editStopGeocode').onclick = async () => {
      const statusNode = document.getElementById('editStopStatus');
      try {
        const position = await geocode(document.getElementById('editStopAddress').value.trim());
        document.getElementById('editStopLat').value = position.lat.toFixed(7);
        document.getElementById('editStopLng').value = position.lng.toFixed(7);
        statusNode.textContent = `位置：${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}`;
        await mountEditorMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', position);
      } catch (error) { statusNode.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。'; }
    };
    mountEditorMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', validPosition(stop) ? stop : null);
  }

  function renderRoute2StopList() {
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[editorSystemKey] || SYSTEM_DEFINITIONS['2-maihama'];
    const system = route.systems[definition.key];
    const box = document.getElementById('stopList');
    if (!box) return;
    document.getElementById('stopListTitle').textContent = `登録済み停留所｜2｜${definition.title}｜${system.stops.length}件`;
    box.innerHTML = system.stops.map((stop, index) => {
      const hasImage = Boolean(getImageEntry(route, definition, stop)?.dataUrl);
      return `<div class="item stop-coordinate-item"><div class="stop-coordinate-main"><strong>${index + 1}. ${escHtml(displayStopName(stop))}</strong><span>${escHtml(stop.address || '住所未設定')}</span><code>緯度 ${validPosition(stop) ? stop.lat.toFixed(6) : '未設定'} ／ 経度 ${validPosition(stop) ? stop.lng.toFixed(6) : '未設定'} ／ 画像 ${hasImage ? '登録済み' : '未登録'}${stop.source ? ` ／ ${escHtml(stop.source)}` : ''}</code></div><button type="button" class="stop-edit-button" data-imagawa-edit="${index}">位置・画像を設定</button></div>`;
    }).join('');
    box.querySelectorAll('[data-imagawa-edit]').forEach((button) => { button.onclick = () => openRoute2StopEditor(definition.key, Number(button.dataset.imagawaEdit)); });
  }

  function route2StopEditor() {
    ensureRoute();
    editorRouteId = ROUTE_ID;
    if (!SYSTEM_DEFINITIONS[editorSystemKey]) editorSystemKey = getSelectedSystemKey();
    document.getElementById('settingsBody').innerHTML = `<div class="grid">
      <div class="card">
        <label>路線<select id="sRoute">${data.routes.map((route) => `<option value="${route.id}" ${route.id === ROUTE_ID ? 'selected' : ''}>${escHtml(label(route))}</option>`).join('')}</select></label>
        <label>系統<select id="sMode">${Object.values(SYSTEM_DEFINITIONS).map((item) => `<option value="${item.key}" ${item.key === editorSystemKey ? 'selected' : ''}>2｜${escHtml(item.title)}</option>`).join('')}</select></label>
        <button type="button" id="settingsRefreshRoute" class="secondary">現在の系統を公式情報で再検証</button>
        <p class="status" id="sStatus">停留所名と順序は公式情報から固定しています。画像は各停留所の「位置・画像を設定」から手動登録してください。</p>
      </div>
      <div class="card"><strong id="stopListTitle">登録済み停留所</strong><p class="stop-list-help">同じ進行方向で共通する停留所は、位置と画像を共有します。反対方向は別の停留所として扱います。</p><div id="stopList"></div></div>
    </div>`;
    renderRoute2StopList();
    document.getElementById('sRoute').onchange = (event) => {
      editorRouteId = event.target.value;
      if (editorRouteId === ROUTE_ID) return;
      stopEditor();
    };
    document.getElementById('sMode').onchange = (event) => {
      editorSystemKey = event.target.value;
      setSelectedSystemKey(editorSystemKey);
      renderRoute2StopList();
    };
    document.getElementById('settingsRefreshRoute').onclick = async () => {
      const button = document.getElementById('settingsRefreshRoute');
      button.disabled = true;
      try {
        await resolveSystem(editorSystemKey, { force: true, statusCallback: (text) => { document.getElementById('sStatus').textContent = text; } });
        renderRoute2StopList();
        document.getElementById('sStatus').textContent = '公式停留所順とGoogle Mapsの位置を再検証しました。';
      } catch (error) { document.getElementById('sStatus').textContent = error instanceof Error ? error.message : '再検証に失敗しました。'; }
      finally { button.disabled = false; }
    };
  }

  stopEditor = function stopEditorImagawaV1() {
    if (editorRouteId === ROUTE_ID || routeState?.routeId === ROUTE_ID) {
      route2StopEditor();
      return;
    }
    previousStopEditor();
    const selector = document.getElementById('sRoute');
    selector?.addEventListener('change', (event) => {
      if (event.target.value !== ROUTE_ID) return;
      editorRouteId = ROUTE_ID;
      setTimeout(() => stopEditor(), 0);
    });
  };

  window.IMAGAWA_ROUTE_V1 = {
    VERSION,
    PATH_POLICY_VERSION,
    SYSTEM_DEFINITIONS: clone(SYSTEM_DEFINITIONS),
    AUTHORITATIVE_PLATFORMS,
    IMAGAWA_PATH_SHAPING_POINTS,
    ensureRoute,
    resolveSystem,
    resolveAllSystems,
    validateRoadPath,
    getSelectedSystemKey,
    setSelectedSystemKey,
  };

  ensureRoute();
  setTimeout(ensureRoute, 1200);
  setTimeout(() => {
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }, 0);
})();
