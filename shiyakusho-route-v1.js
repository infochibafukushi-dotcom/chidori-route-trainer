// 市役所線（系統番号6・route-6）走行シミュレーション／停留所編集モジュール。
// 停留所順：京成バスナビ通過時刻表で確認（evidence/route6-shiyakusho-implementation-2026-07-24/official-stop-orders.json）。
// 停留所座標：OSM platform採用（往復で別platform）。
// 道路形状：OSM relation way鎖。Google Directionsは使用しない。
// UI構造・走行シミュレーションは tomioka-route-v1.js パターンを移植。
(() => {
  const ROUTE_ID = 'route-6';
  const VERSION = '2026-07-24-shiyakusho-v1';
  const SYSTEM_RESOLVED_VERSIONS = {
    '6-maihama': '2026-07-24-shiyakusho-maihama-v1',
    '6-chidori': '2026-07-24-shiyakusho-chidori-v1',
    '6-urayasu-maihama': '2026-07-24-shiyakusho-urayasu-maihama-v1',
    '6-tokai': '2026-07-24-shiyakusho-tokai-v1',
    '6-urayasu-chidori': '2026-07-24-shiyakusho-urayasu-chidori-v1',
  };
  const SYSTEM_KEY = 'chidori-shiyakusho-system-v1';
  const DISPLAY_CODE = '6';
  const SPEED_KMH = 20;
  const DWELL_MS = 3000;
  const MAP_ZOOM = 18;
  const DRIVE_VISUAL_MS = 900;
  const HEADING_MIN_METERS = 5;
  const MAX_DATA_URL_CHARS = 70000;

  const NAMES_MAIHAMA = [
    '浦安駅入口',
    '神明裏',
    '猫実',
    '消防本部前',
    '商工会議所',
    '市役所前',
    '東野一丁目',
    '東野プール',
    '東海大浦安高校入口',
    '東海大浦安高校前',
    '東野三丁目',
    '弁天橋',
    '弁天四丁目',
    '見明川',
    '舞浜三丁目',
    '運動公園',
    'オリエンタルランド本社前',
    '舞浜駅',
  ];
  const NAMES_CHIDORI = [
    '浦安駅入口',
    '神明裏',
    '猫実',
    '消防本部前',
    '商工会議所',
    '市役所前',
    '東野一丁目',
    '東野プール',
    '東海大浦安高校入口',
    '東海大浦安高校前',
    '東野三丁目',
    '弁天橋',
    '弁天四丁目',
    '見明川',
    '舞浜三丁目',
    '運動公園',
    '千鳥車庫',
  ];
  const NAMES_URAYASU_MAIHAMA = [
    '舞浜駅',
    'オリエンタルランド本社前',
    '運動公園',
    '舞浜三丁目',
    '見明川',
    '弁天四丁目',
    '弁天橋',
    '東野三丁目',
    '東海大浦安高校前',
    '東海大浦安高校入口',
    '東野プール',
    '東野一丁目',
    '市役所前',
    '商工会議所',
    '消防本部前',
    '猫実',
    '神明裏',
    '浦安駅入口',
  ];
  const NAMES_TOKAI = [
    '舞浜駅',
    'オリエンタルランド本社前',
    '運動公園',
    '舞浜三丁目',
    '見明川',
    '弁天四丁目',
    '弁天橋',
    '東野三丁目',
    '東海大浦安高校前',
  ];
  const NAMES_URAYASU_CHIDORI = [
    '千鳥車庫',
    '運動公園',
    '舞浜三丁目',
    '見明川',
    '弁天四丁目',
    '弁天橋',
    '東野三丁目',
    '東海大浦安高校前',
    '東海大浦安高校入口',
    '東野プール',
    '東野一丁目',
    '市役所前',
    '商工会議所',
    '消防本部前',
    '猫実',
    '神明裏',
    '浦安駅入口',
  ];

  const SYSTEM_DEFINITIONS = {
    '6-maihama': {
      key: '6-maihama', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '舞浜駅行き',
      summary: '浦安駅入口 → 市役所前 → 舞浜駅',
      relationId: 9983007,
      names: NAMES_MAIHAMA,
    },
    '6-chidori': {
      key: '6-chidori', displayCode: DISPLAY_CODE, directionGroup: 'outbound',
      title: '千鳥車庫行き',
      summary: '浦安駅入口 → 市役所前 → 千鳥車庫',
      relationId: 18396393,
      names: NAMES_CHIDORI,
    },
    '6-urayasu-maihama': {
      key: '6-urayasu-maihama', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（舞浜駅発）',
      summary: '舞浜駅 → 市役所前 → 浦安駅入口',
      relationId: 18322968,
      names: NAMES_URAYASU_MAIHAMA,
    },
    '6-tokai': {
      key: '6-tokai', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '東海大浦安高校前行き',
      summary: '舞浜駅 → 東海大浦安高校前',
      relationId: 18322968,
      names: NAMES_TOKAI,
    },
    '6-urayasu-chidori': {
      key: '6-urayasu-chidori', displayCode: DISPLAY_CODE, directionGroup: 'inbound',
      title: '浦安駅入口行き（千鳥車庫発）',
      summary: '千鳥車庫 → 市役所前 → 浦安駅入口',
      relationId: 18396392,
      names: NAMES_URAYASU_CHIDORI,
    },
  };

  const DEFAULT_SYSTEM_KEY = '6-maihama';


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
    return SYSTEM_DEFINITIONS[stored] ? stored : DEFAULT_SYSTEM_KEY;
  }

  function setSelectedSystemKey(key) {
    localStorage.setItem(SYSTEM_KEY, SYSTEM_DEFINITIONS[key] ? key : DEFAULT_SYSTEM_KEY);
  }

  function expectedResolvedVersion(key) {
    return SYSTEM_RESOLVED_VERSIONS[key] || null;
  }

  function imageKey(definition, stop) {
    return `${definition.key}|${normalize(stop?.name)}`;
  }

  /** 旧仕様（進行方向グループ単位）の画像キー。移行のみに使用する。 */
  function legacyImageKey(definition, stop) {
    return `${definition.directionGroup}|${normalize(stop?.name)}`;
  }

  function coordinateKey(systemKey, stopName) {
    return `${systemKey}|${normalize(stopName)}`;
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

  function deepClonePath(path) {
    return (path || []).map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
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

  function pathHashPayload(path) {
    return (path || [])
      .map((point) => `${Number(point.lat).toFixed(7)},${Number(point.lng).toFixed(7)}`)
      .join(';');
  }

  async function hashPathSha256(path) {
    const payload = pathHashPayload(path);
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(payload);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.createHash('sha256').update(payload).digest('hex');
      } catch (error) {
        /* ignore */
      }
    }
    throw new Error('hashPathSha256: crypto.subtle unavailable');
  }

  /** hashPathSha256 の同期フォールバック（Node crypto がある環境のみ）。ブラウザで crypto.subtle しかない場合は null。 */
  function hashPathSha256Sync(path) {
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.createHash('sha256').update(pathHashPayload(path)).digest('hex');
      } catch (error) {
        /* ignore */
      }
    }
    return null;
  }

  function platformsForSystem(systemKey) {
    const bank = window.SHIYAKUSHO_PLATFORMS_V1 || {};
    return bank[systemKey] || {};
  }

  function pathDataForSystem(systemKey) {
    const bank = window.SHIYAKUSHO_PATH_V1 || {};
    return bank[systemKey] || null;
  }

  /** 系統キー単位の停留所IDへ揃える。 */
  function migrateStopId(definition, stop, index) {
    const newId = `shiyakusho-${definition.key}-${String(index + 1).padStart(2, '0')}`;
    if (stop.id === newId) return false;
    if (!stop.id || /^shiyakusho-6-\d{2}$/.test(stop.id)) {
      stop.id = newId;
      return true;
    }
    return false;
  }

  function makeStop(definition, name, index) {
    const platform = platformsForSystem(definition.key)[name] || null;
    return {
      id: `shiyakusho-${definition.key}-${String(index + 1).padStart(2, '0')}`,
      name,
      note: index === 0 ? '始発' : (index === definition.names.length - 1 ? '終点' : ''),
      address: `${name} バス停, 浦安市, 千葉県`,
      lat: platform ? platform.lat : null,
      lng: platform ? platform.lng : null,
      placeId: null,
      googleMapsURI: null,
      source: platform ? 'authoritative-platform' : null,
      sourceName: platform ? name : null,
      platformId: platform?.platformId || null,
      order: index + 1,
      manualOverride: false,
      directionGroup: definition.directionGroup,
      systemCode: definition.key,
      directionKey: coordinateKey(definition.key, name),
    };
  }

  function validCachedSystem(system, definition) {
    return Boolean(
      system
      && system.key === definition.key
      && Array.isArray(system.stops)
      && system.stops.length === definition.names.length
      && system.stops.every((stop, index) => normalize(stop.name) === normalize(definition.names[index])),
    );
  }

  /** 系統キー単位の path（pathファイル採用）を system に反映する。 */
  function applySystemPath(definition, system) {
    const pathData = pathDataForSystem(definition.key);
    if (!pathData?.pathPoints?.length) {
      system.path = [];
      system.pathSource = null;
      system.pathHash = null;
      system.resolvedVersion = null;
      system.pathInvalid = true;
      system.pathIssues = [{ message: '道路形状データが見つかりません。' }];
      return;
    }
    system.path = deepClonePath(pathData.pathPoints);
    system.pathSource = pathData.pathSource || `osm-relation-${pathData.relationId}-full`;
    system.pathHash = pathData.pathHash || hashPathSha256Sync(system.path) || null;
    system.relationId = pathData.relationId || definition.relationId;
    system.resolvedVersion = pathData.resolvedVersion || expectedResolvedVersion(definition.key);
    system.positionSource = 'OSM platform（要走行確認）';
    system.verifiedAt = new Date().toISOString();
    const recomputed = hashPathSha256Sync(system.path);
    if (pathData.pathHash && recomputed && pathData.pathHash !== recomputed) {
      system.pathInvalid = true;
      system.pathIssues = [{ message: `pathHash不一致（系統=${definition.key}）` }];
      return;
    }
    if (system.resolvedVersion !== expectedResolvedVersion(definition.key)) {
      system.pathInvalid = true;
      system.pathIssues = [{ message: `resolvedVersion不一致（系統=${definition.key}）` }];
      return;
    }
    // ブラウザでは sync ハッシュ不能のため、ここでは pathInvalid を落とさない。
    // 本番検証は resolveSystem → await hashPathSha256 で確定する。
    if (recomputed && pathData.pathHash && recomputed === pathData.pathHash) {
      system.pathInvalid = false;
      system.pathIssues = null;
    }
  }

  /** OSM platform 座標を強制適用し、必要であれば path も再適用する。変更有無を返す。 */
  function applyAuthoritativePlatformsAndPath(definition, system) {
    const platforms = platformsForSystem(definition.key);
    let coordsChanged = false;
    let stopChanged = false;
    (system.stops || []).forEach((stop, index) => {
      if (migrateStopId(definition, stop, index)) stopChanged = true;
      const name = definition.names[index];
      const platform = platforms[name];
      if (!platform) return;
      if (stop.manualOverride && validPosition(stop)) return;
      const drifted = !validPosition(stop)
        || Math.abs(stop.lat - platform.lat) > 0.0000005
        || Math.abs(stop.lng - platform.lng) > 0.0000005;
      if (!drifted && stop.source === 'authoritative-platform' && stop.directionKey === coordinateKey(definition.key, name)) return;
      if (drifted) coordsChanged = true;
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

    const versionMismatch = system.resolvedVersion !== expectedResolvedVersion(definition.key);
    const pathMissing = !Array.isArray(system.path) || system.path.length < 2 || system.pathInvalid;
    if (coordsChanged || versionMismatch || pathMissing) {
      applySystemPath(definition, system);
    }
    return stopChanged || coordsChanged;
  }

  function buildFreshSystem(definition, previous) {
    const stops = definition.names.map((name, index) => {
      const created = makeStop(definition, name, index);
      const prior = previous?.stops?.[index];
      if (
        prior
        && normalize(prior.name) === normalize(name)
        && prior.manualOverride
        && validPosition(prior)
      ) {
        return {
          ...created,
          lat: prior.lat,
          lng: prior.lng,
          address: prior.address || created.address,
          source: 'manual-confirmed',
          manualOverride: true,
          verifiedAt: prior.verifiedAt || new Date().toISOString(),
        };
      }
      return created;
    });
    const system = {
      key: definition.key,
      code: definition.key,
      displayCode: DISPLAY_CODE,
      directionGroup: definition.directionGroup,
      title: definition.title,
      summary: definition.summary,
      relationId: definition.relationId,
      stops,
      path: [],
      pathSource: null,
      pathHash: null,
      positionSource: null,
      verifiedAt: null,
      resolvedVersion: null,
      pathInvalid: false,
      pathIssues: null,
    };
    applySystemPath(definition, system);
    return system;
  }

  function ensureRoute() {
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route) return null;
    const previousSystems = route.systems || {};
    const systems = {};
    let changed = route.shiyakushoVersion !== VERSION;

    Object.values(SYSTEM_DEFINITIONS).forEach((definition) => {
      const previous = previousSystems[definition.key];
      if (validCachedSystem(previous, definition)) {
        systems[definition.key] = previous;
        systems[definition.key].displayCode = DISPLAY_CODE;
        systems[definition.key].directionGroup = definition.directionGroup;
        systems[definition.key].title = definition.title;
        systems[definition.key].summary = definition.summary;
        systems[definition.key].relationId = definition.relationId;
        const didChange = applyAuthoritativePlatformsAndPath(definition, systems[definition.key]);
        if (didChange) changed = true;
        return;
      }
      systems[definition.key] = buildFreshSystem(definition, previous);
      changed = true;
    });

    route.systems = systems;
    route.shiyakushoVersion = VERSION;
    route.description = '市役所線：5運行パターン（公式系統番号はいずれも6）';
    route.sourcePolicy = '停留所順は京成バスナビ通過時刻表で確認。停留所名「市役所前」（市役所入口・郵便局前ではない）。座標・道路はOSM relation採用（系統キー単位・要走行確認）。公式停留所順との照合状況：停留所順は完了／座標・道路のStreet View突合は未完了。';
    if (!route.shiyakushoStopImages) {
      route.shiyakushoStopImages = {};
      changed = true;
    }
    if (migrateStopImageBank(route)) changed = true;
    if (changed) save();
    return route;
  }

  function selectedSystem(route, key = getSelectedSystemKey()) {
    return route?.systems?.[key] || route?.systems?.[DEFAULT_SYSTEM_KEY] || null;
  }

  /** directionGroup に応じて route.outbound / route.inbound を設定する。
   *  makeQuestion() は outbound.length>=2 なら往路、そうでなければ inbound を復路として使うため、
   *  inbound 系統は inbound に stops を入れる必要がある。 */
  function applyDirectionStops(route, definition, system) {
    if (definition.directionGroup === 'inbound') {
      route.outbound = [];
      route.inbound = system.stops;
    } else {
      route.outbound = system.stops;
      route.inbound = [];
    }
  }

  function pathIntegrityFail(system, definition, reasons) {
    const policy = window.SHIYAKUSHO_PATH_POLICY_V1;
    const list = Array.isArray(reasons) && reasons.length ? reasons : ['検証失敗'];
    system.pathInvalid = true;
    system.pathIssues = list.map((message) => ({ message }));
    const message = policy?.formatInvalidMessage
      ? policy.formatInvalidMessage(definition.key, list)
      : [
        '市役所線の走行データを確認できません。',
        `系統：${definition.key}`,
        `理由：${list[0]}`,
      ].join('\n');
    return message;
  }

  /** 本番ブラウザで pathHash / resolvedVersion / NaN / 最低点数 / maxGap を検査する。 */
  async function validateSystemPathIntegrity(definition, system) {
    const pathData = pathDataForSystem(definition.key);
    const expectedHash = pathData?.pathHash || null;
    const expectedVersion = expectedResolvedVersion(definition.key);
    if (!Array.isArray(system.path) || system.path.length < 2) {
      return { ok: false, message: pathIntegrityFail(system, definition, ['道路形状未設定']) };
    }
    let recomputed;
    try {
      recomputed = await hashPathSha256(system.path);
    } catch (error) {
      return {
        ok: false,
        message: pathIntegrityFail(system, definition, [
          `pathHash計算失敗（${error instanceof Error ? error.message : String(error)}）`,
        ]),
      };
    }
    system.pathHash = expectedHash || recomputed;
    const policy = window.SHIYAKUSHO_PATH_POLICY_V1;
    const result = policy?.validateRuntimePath
      ? policy.validateRuntimePath({
        systemKey: definition.key,
        path: system.path,
        pathHash: recomputed,
        expectedPathHash: expectedHash,
        resolvedVersion: system.resolvedVersion,
        expectedResolvedVersion: expectedVersion,
        directionGroup: system.directionGroup || definition.directionGroup,
        pathSource: system.pathSource,
      })
      : {
        ok: Boolean(expectedHash && recomputed === expectedHash && system.resolvedVersion === expectedVersion),
        reasons: [
          !(expectedHash && recomputed === expectedHash) ? 'pathHash不一致' : null,
          system.resolvedVersion !== expectedVersion ? 'resolvedVersion不一致' : null,
        ].filter(Boolean),
      };

    if (!result.ok) {
      return { ok: false, message: pathIntegrityFail(system, definition, result.reasons) };
    }
    system.pathInvalid = false;
    system.pathIssues = null;
    system.pathHash = expectedHash;
    return { ok: true, message: null, maxGapM: result.maxGapM };
  }

  async function resolveSystem(key, { force = false, statusCallback = null } = {}) {
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[key];
    const system = route?.systems?.[key];
    if (!route || !definition || !system) throw new Error('市役所線の系統データがありません。');
    statusCallback?.(`${definition.title}の停留所・道路形状を確認中…`);
    if (force) {
      system.resolvedVersion = null;
      system.pathInvalid = false;
      (system.stops || []).forEach((stop) => {
        if (!stop.manualOverride) stop.source = null;
      });
    }
    applyAuthoritativePlatformsAndPath(definition, system);
    if (force || !Array.isArray(system.path) || system.path.length < 2) {
      applySystemPath(definition, system);
    }
    if (!system.stops.every(validPosition)) {
      const missing = system.stops.filter((stop) => !validPosition(stop)).map((stop) => stop.name);
      throw new Error(`停留所座標が不足しています：${missing.join('、')}`);
    }
    if (!Array.isArray(system.path) || system.path.length < 2) {
      throw new Error('道路形状（走行ルート）が未設定です。');
    }
    const integrity = await validateSystemPathIntegrity(definition, system);
    if (!integrity.ok) {
      applyDirectionStops(route, definition, system);
      route.shiyakushoVersion = VERSION;
      save();
      throw new Error(integrity.message);
    }
    applyDirectionStops(route, definition, system);
    route.shiyakushoVersion = VERSION;
    save();
    statusCallback?.(`${definition.title}の確認が完了しました。`);
    return system;
  }

  async function resolveAllSystems(force = false, statusCallback = null) {
    const order = ['6-maihama', '6-chidori', '6-urayasu-maihama', '6-tokai', '6-urayasu-chidori'];
    for (const key of order) {
      const definition = SYSTEM_DEFINITIONS[key];
      statusCallback?.(`一括確認｜${definition.title}`);
      await resolveSystem(key, { force, statusCallback });
      await new Promise((resolve) => setTimeout(resolve, 50));
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
    if (distance <= 0) return { position: path[0], next: path[1] || path[0], pathIndex: 0 };
    if (distance >= metrics.total) {
      return { position: path.at(-1), next: path.at(-1), pathIndex: Math.max(0, path.length - 1) };
    }
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
      pathIndex: index - 1,
    };
  }

  function drivingHeading(path, point) {
    const origin = point?.position;
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return 0;
    const startIndex = Math.max(0, Number(point.pathIndex) || 0);
    for (let index = startIndex + 1; index < path.length; index += 1) {
      const candidate = path[index];
      if (!candidate) continue;
      if (distanceMeters(origin, candidate) >= HEADING_MIN_METERS) {
        return heading(origin, candidate);
      }
    }
    if (point.next && Number.isFinite(point.next.lat) && Number.isFinite(point.next.lng)) {
      return heading(origin, point.next);
    }
    return 0;
  }

  function normalizeDrivePath(rawPath) {
    return (rawPath || [])
      .map((point) => {
        const lat = Number(point?.lat ?? point?.latitude);
        const lng = Number(point?.lng ?? point?.longitude);
        return { lat, lng };
      })
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
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

  /** 旧キー（進行方向グループ単位）から新キー（系統キー単位）へ画像を移行する。バンク自体は消さない。 */
  function migrateStopImageBank(route) {
    const bank = route.shiyakushoStopImages;
    if (!bank || !route.systems) return false;
    let changed = false;
    Object.values(SYSTEM_DEFINITIONS).forEach((definition) => {
      const system = route.systems[definition.key];
      (system?.stops || []).forEach((stop) => {
        const newKey = imageKey(definition, stop);
        if (bank[newKey]) return;
        const legacyEntry = bank[legacyImageKey(definition, stop)];
        if (legacyEntry) {
          bank[newKey] = legacyEntry;
          changed = true;
        }
      });
    });
    Object.keys(bank).forEach((key) => {
      const group = key.split('|')[0];
      if (group === 'outbound' || group === 'inbound') {
        delete bank[key];
        changed = true;
      }
    });
    return changed;
  }

  function getImageEntry(route, definition, stop) {
    const bank = route.shiyakushoStopImages;
    if (!bank) return null;
    return bank[imageKey(definition, stop)] || bank[legacyImageKey(definition, stop)] || null;
  }

  function showStopImage(route, definition, stop, street) {
    const entry = getImageEntry(route, definition, stop);
    const existing = street.querySelector('.stop-image-display-v25.shiyakusho-stop-image');
    existing?.remove();
    if (!entry?.dataUrl) return false;
    const overlay = document.createElement('div');
    overlay.className = 'stop-image-display-v25 shiyakusho-stop-image';
    overlay.innerHTML = `<img alt="${escHtml(stop.name)}の停留所画像" src="${entry.dataUrl}">`;
    street.appendChild(overlay);
    return true;
  }

  function hideStopImage(street) {
    street?.querySelector('.shiyakusho-stop-image')?.remove();
  }

  async function drawGuidance(route, definition, system, token) {
    cleanupGuidance?.();
    const status = document.getElementById('mapStatus');
    const showStatusError = (message) => {
      if (!status) return;
      status.hidden = false;
      status.removeAttribute('aria-hidden');
      status.dataset.state = 'error';
      status.textContent = message;
    };
    let active = system;
    try {
      active = await resolveSystem(definition.key, {
        statusCallback: (text) => {
          if (!status) return;
          status.hidden = false;
          status.removeAttribute('aria-hidden');
          status.textContent = text;
        },
      });
    } catch (error) {
      const missing = (system.stops || []).filter((stop) => !validPosition(stop)).map((stop) => stop.name);
      const issues = system.pathIssues || [];
      const issueText = issues.map((item) => item.message || String(item)).join(' / ');
      const base = error instanceof Error ? error.message : String(error);
      const message = base.includes('市役所線の走行データを確認できません')
        ? base
        : [
          '市役所線の走行データを確認できません。',
          `系統：${definition.key}`,
          `理由：${issueText || base}`,
          missing.length ? `不足の停留所：${missing.join('、')}` : null,
        ].filter(Boolean).join('\n');
      showStatusError(message);
      throw new Error(message);
    }
    if (token !== renderToken || page !== 'routes' || routeState.routeId !== ROUTE_ID) return;
    active = route.systems[definition.key] || active;
    if (active.pathInvalid) {
      const message = pathIntegrityFail(
        active,
        definition,
        (active.pathIssues || []).map((item) => item.message).filter(Boolean),
      );
      showStatusError(message);
      throw new Error(message);
    }
    if (!active.stops.every(validPosition) || !Array.isArray(active.path) || active.path.length < 2) {
      const missing = (active.stops || []).filter((stop) => !validPosition(stop)).map((stop) => stop.name);
      throw new Error(`系統=${definition.key} | 停留所または道路形状が未設定です | 不足：${missing.join('、') || '(なし)'}`);
    }
    const googleApi = await loadMaps();
    if (token !== renderToken || page !== 'routes' || routeState.routeId !== ROUTE_ID) return;
    const stops = active.stops;
    const path = normalizeDrivePath(active.path);
    if (path.length < 2) {
      throw new Error(`系統=${definition.key} | 道路形状データの座標が不正です`);
    }
    system = active;
    const metrics = buildMetrics(path);
    if (!(metrics.total > 0) || !Number.isFinite(metrics.total)) {
      throw new Error(`系統=${definition.key} | 道路形状の距離計算に失敗しました`);
    }
    const stopDistances = mapStopsToRoute(stops, path, metrics);
    const center = { lat: stops[0].lat, lng: stops[0].lng };
    const mapEl = document.getElementById('routeMap');
    const streetEl = document.getElementById('street');
    if (!mapEl || !streetEl) {
      throw new Error(`系統=${definition.key} | 地図表示領域が見つかりません`);
    }
    const map = new googleApi.maps.Map(mapEl, {
      center, zoom: MAP_ZOOM, mapTypeControl: false, scaleControl: true,
      streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy',
    });
    const panorama = new googleApi.maps.StreetViewPanorama(streetEl, {
      position: center, pov: { heading: heading(stops[0], stops[1] || stops[0]), pitch: 0 }, zoom: 1,
      motionTracking: false, addressControl: false,
    });
    map.setStreetView(panorama);
    const streetViewService = (typeof googleApi.maps.StreetViewService === 'function')
      ? new googleApi.maps.StreetViewService()
      : null;
    const street = streetEl;
    street.style.position = 'relative';
    const telop = document.createElement('div');
    telop.className = 'station-name-telop guidance-station-v22';
    street.appendChild(telop);
    const markers = stops.map((stop, index) => {
      const marker = new googleApi.maps.Marker({ map, position: { lat: stop.lat, lng: stop.lng }, icon: markerIcon(googleApi, index + 1), title: displayStopName(stop) });
      return marker;
    });
    const line = new googleApi.maps.Polyline({ map, path, strokeColor: '#0f5ea8', strokeOpacity: 0.95, strokeWeight: 7 });
    const vehicle = new googleApi.maps.Marker({ map, position: center, icon: busIcon(googleApi), zIndex: 1000, title: `市役所線 ${definition.title}` });

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
    sequence.innerHTML = `<div class="route-sequence-title">系統${DISPLAY_CODE}｜${escHtml(definition.title)}｜${stops.length}停留所</div><div class="route-sequence">${stops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-uhd-stop="${index}">${index + 1}. ${escHtml(displayStopName(stop))}</button>${index < stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    controls.insertAdjacentElement('afterend', sequence);

    const progress = document.getElementById('driveProgress');
    const startPause = document.getElementById('driveStartPause');
    const previousButton = document.getElementById('drivePrevious');
    const nextButton = document.getElementById('driveNext');
    if (!progress || !startPause || !previousButton || !nextButton) {
      throw new Error(`系統=${definition.key} | 走行操作パネルの初期化に失敗しました`);
    }

    const simulation = {
      routeId: ROUTE_ID,
      systemKey: definition.key,
      running: false,
      paused: false,
      path,
      pathIndex: 0,
      segmentProgress: 0,
      lastTimestamp: null,
      animationFrameId: 0,
      selectedStopIndex: 0,
      lastPassedStopIndex: 0,
      traveled: 0,
      nextStopIndex: 1,
      dwellUntil: 0,
      pausedDwellRemaining: 0,
      manualHold: true,
      lastDrivingVisualUpdate: 0,
      currentPosition: center,
      currentHeading: heading(stops[0], stops[1] || stops[0]),
      finalStopPending: false,
      requestToken: 0,
    };

    const highlight = (index) => {
      sequence.querySelectorAll('[data-uhd-stop]').forEach((button) => button.classList.toggle('active', Number(button.dataset.uhdStop) === index));
      sequence.querySelector(`[data-uhd-stop="${index}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };

    const isAtStopDistance = (index) => Math.abs(simulation.traveled - (stopDistances[index] || 0)) <= 2.5;

    const isAtRegisteredStop = () => {
      if (simulation.selectedStopIndex !== simulation.lastPassedStopIndex) return false;
      if (isAtStopDistance(simulation.selectedStopIndex)) return true;
      return simulation.manualHold
        && simulation.nextStopIndex >= stops.length
        && simulation.selectedStopIndex === stops.length - 1;
    };

    const getNavTargets = () => {
      if (!stops.length) return { previousTargetIndex: -1, nextTargetIndex: -1 };
      if (isAtRegisteredStop()) {
        return {
          previousTargetIndex: simulation.selectedStopIndex - 1,
          nextTargetIndex: simulation.selectedStopIndex + 1,
        };
      }
      return {
        previousTargetIndex: simulation.lastPassedStopIndex,
        nextTargetIndex: simulation.lastPassedStopIndex + 1,
      };
    };

    const publishDebugState = () => {
      window.SHIYAKUSHO_DRIVE_STATE = {
        ...simulation,
        pathLength: path.length,
        metricsTotal: metrics.total,
        stopCount: stops.length,
        panoramaReady: Boolean(panorama),
        markerReady: Boolean(vehicle),
      };
    };

    const updateButtons = () => {
      const { previousTargetIndex, nextTargetIndex } = getNavTargets();
      previousButton.disabled = previousTargetIndex < 0;
      nextButton.disabled = nextTargetIndex < 0 || nextTargetIndex >= stops.length;
      const labelNode = startPause.querySelector('.bus-label-full');
      const shortNode = startPause.querySelector('.bus-label-short');
      const text = simulation.running ? '一時停止' : 'スタート';
      if (labelNode) labelNode.textContent = text;
      if (shortNode) shortNode.textContent = text;
      startPause.classList.toggle('primary', !simulation.running);
      startPause.classList.toggle('secondary', simulation.running);
      publishDebugState();
    };

    const updateProgressText = (now = performance.now()) => {
      const lastPassedName = stops[simulation.lastPassedStopIndex]?.name || 'なし';
      const nextTarget = stops[simulation.lastPassedStopIndex + 1];
      const nextStopName = nextTarget?.name || '終点';
      const betweenStops = !isAtRegisteredStop() && simulation.traveled > (stopDistances[simulation.lastPassedStopIndex] || 0);
      const currentLabel = betweenStops
        ? `${lastPassedName}〜${nextStopName}`
        : (stops[simulation.selectedStopIndex]?.name || '走行中');
      const dwellLabel = simulation.dwellUntil && now < simulation.dwellUntil ? '｜停車中' : '';
      progress.textContent = `${simulation.running ? '走行中' : '停止中'}${dwellLabel}｜通過：${lastPassedName}｜現在：${currentLabel}｜次：${nextStopName}`;
      updateButtons();
    };

    const applyStreetView = (position, headingDeg, force = false) => {
      if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return false;
      const headingValue = Number.isFinite(headingDeg) ? headingDeg : simulation.currentHeading;
      simulation.currentPosition = position;
      simulation.currentHeading = headingValue;
      if (force) simulation.lastDrivingVisualUpdate = performance.now();

      const applyPovOnly = () => {
        try {
          panorama.setPov({ heading: headingValue, pitch: 0 });
        } catch (error) {
          /* ignore POV failures */
        }
      };

      if (streetViewService) {
        const request = { location: position, radius: 50 };
        if (googleApi.maps.StreetViewSource?.OUTDOOR) {
          request.source = googleApi.maps.StreetViewSource.OUTDOOR;
        }
        try {
          streetViewService.getPanorama(request, (data, status) => {
            try {
              if (status === googleApi.maps.StreetViewStatus.OK && data?.location) {
                const loc = data.location.latLng
                  ? { lat: data.location.latLng.lat(), lng: data.location.latLng.lng() }
                  : position;
                panorama.setPosition(loc);
                panorama.setPov({ heading: headingValue, pitch: 0 });
              } else {
                applyPovOnly();
              }
            } catch (error) {
              console.warn('[shiyakusho] panorama update failed', error);
            }
          });
        } catch (error) {
          console.warn('[shiyakusho] getPanorama failed', error);
          applyPovOnly();
        }
        return true;
      }

      try {
        panorama.setPosition(position);
        panorama.setPov({ heading: headingValue, pitch: 0 });
        return true;
      } catch (error) {
        console.warn('[shiyakusho] panorama update failed', error);
        return false;
      }
    };

    const updateDrivingVisual = (now, force = false) => {
      if (simulation.manualHold || simulation.dwellUntil) return;
      const point = positionAtDistance(path, metrics, simulation.traveled);
      if (!point?.position || !Number.isFinite(point.position.lat) || !Number.isFinite(point.position.lng)) {
        status.dataset.state = 'error';
        status.textContent = `走行位置が不正です（系統=${definition.key}）。`;
        console.error('[shiyakusho] invalid drive position', point, simulation);
        return;
      }
      simulation.pathIndex = point.pathIndex;
      simulation.currentPosition = point.position;
      simulation.currentHeading = drivingHeading(path, point);
      vehicle.setPosition(point.position);
      if (force || now - simulation.lastDrivingVisualUpdate >= DRIVE_VISUAL_MS) {
        map.setCenter(point.position);
        map.setZoom(MAP_ZOOM);
        applyStreetView(point.position, simulation.currentHeading, true);
      }
    };

    const setStreetAtStop = (index) => {
      const stop = stops[index];
      if (!stop) return;
      const tokenNow = ++simulation.requestToken;
      const next = stops[index + 1] || stops[index - 1] || stop;
      applyStreetView({ lat: stop.lat, lng: stop.lng }, heading(stop, next), true);
      setTimeout(() => {
        if (tokenNow !== simulation.requestToken) return;
      }, 200);
    };

    const showTelop = (index, text = '停車中') => {
      telop.innerHTML = `<span>停留所</span><strong>${escHtml(stops[index].name)}</strong><small class="station-telop-dir">${escHtml(definition.title)}</small><em>${text}</em>`;
      telop.classList.add('show');
    };

    const selectStop = (index, autoContinue = false) => {
      if (index < 0 || index >= stops.length) return;
      simulation.selectedStopIndex = index;
      simulation.lastPassedStopIndex = index;
      simulation.nextStopIndex = index + 1;
      simulation.traveled = stopDistances[index];
      simulation.lastTimestamp = null;
      simulation.dwellUntil = 0;
      simulation.pausedDwellRemaining = 0;
      simulation.manualHold = true;
      simulation.finalStopPending = autoContinue && index === stops.length - 1;
      const exact = { lat: stops[index].lat, lng: stops[index].lng };
      simulation.currentPosition = exact;
      simulation.currentHeading = heading(stops[index], stops[index + 1] || stops[index - 1] || stops[index]);
      vehicle.setPosition(exact);
      map.setCenter(exact);
      map.setZoom(MAP_ZOOM);
      highlight(index);
      showTelop(index, autoContinue ? '停車中 あと3秒' : '選択中');
      setStreetAtStop(index);
      const usedImage = showStopImage(route, definition, stops[index], street);
      if (autoContinue && simulation.running) {
        simulation.dwellUntil = performance.now() + DWELL_MS;
        status.textContent = `${displayStopName(stops[index])}に到着｜${usedImage ? '停留所画像を表示' : 'Street Viewを表示'}｜3秒停車`;
      } else {
        simulation.dwellUntil = 0;
        status.textContent = `${index + 1}. ${displayStopName(stops[index])}｜登録座標 ${stops[index].lat.toFixed(6)}, ${stops[index].lng.toFixed(6)}`;
      }
      updateProgressText();
    };

    const completeRun = () => {
      simulation.running = false;
      simulation.paused = false;
      simulation.dwellUntil = 0;
      simulation.pausedDwellRemaining = 0;
      simulation.finalStopPending = false;
      simulation.lastTimestamp = null;
      simulation.manualHold = true;
      simulation.lastPassedStopIndex = stops.length - 1;
      simulation.selectedStopIndex = stops.length - 1;
      simulation.nextStopIndex = stops.length;
      simulation.traveled = metrics.total;
      hideStopImage(street);
      telop.classList.remove('show');
      updateProgressText();
      status.textContent = `終点 ${stops.at(-1).name} に到着しました。`;
      publishDebugState();
    };

    const tick = (now) => {
      if (!simulation.running) return;
      if (simulation.dwellUntil) {
        if (now < simulation.dwellUntil) {
          const seconds = Math.max(1, Math.ceil((simulation.dwellUntil - now) / 1000));
          showTelop(simulation.selectedStopIndex, `停車中 あと${seconds}秒`);
          updateProgressText(now);
          simulation.animationFrameId = requestAnimationFrame(tick);
          return;
        }
        simulation.dwellUntil = 0;
        hideStopImage(street);
        telop.classList.remove('show');
        simulation.manualHold = false;
        simulation.lastTimestamp = now;
        if (simulation.finalStopPending || simulation.selectedStopIndex >= stops.length - 1) {
          completeRun();
          return;
        }
      }
      if (simulation.lastTimestamp === null) simulation.lastTimestamp = now;
      const delta = Math.min(0.1, Math.max(0, (now - simulation.lastTimestamp) / 1000));
      simulation.lastTimestamp = now;
      const speedMps = (SPEED_KMH * 1000) / 3600;
      if (!Number.isFinite(speedMps) || speedMps <= 0) {
        status.dataset.state = 'error';
        status.textContent = '走行速度が不正です。';
        simulation.running = false;
        updateButtons();
        return;
      }
      simulation.traveled = Math.min(metrics.total, simulation.traveled + speedMps * delta);
      simulation.nextStopIndex = simulation.lastPassedStopIndex + 1;
      const target = stopDistances[simulation.nextStopIndex];
      if (Number.isFinite(target) && simulation.traveled >= target - 0.5) {
        selectStop(simulation.nextStopIndex, true);
        simulation.animationFrameId = requestAnimationFrame(tick);
        return;
      }
      updateDrivingVisual(now);
      updateProgressText(now);
      if (simulation.traveled >= metrics.total && simulation.nextStopIndex >= stops.length) {
        completeRun();
        return;
      }
      simulation.animationFrameId = requestAnimationFrame(tick);
    };

    const pauseDriving = () => {
      if (!simulation.running && simulation.pausedDwellRemaining <= 0 && !simulation.dwellUntil) {
        updateProgressText();
        return;
      }
      simulation.running = false;
      simulation.paused = true;
      cancelAnimationFrame(simulation.animationFrameId);
      simulation.animationFrameId = 0;
      simulation.lastTimestamp = null;
      if (simulation.dwellUntil) {
        simulation.pausedDwellRemaining = Math.max(0, simulation.dwellUntil - performance.now());
        simulation.dwellUntil = 0;
      } else {
        simulation.pausedDwellRemaining = 0;
      }
      simulation.finalStopPending = false;
      simulation.manualHold = true;
      updateProgressText();
      status.textContent = simulation.pausedDwellRemaining > 0
        ? `一時停止｜停車残り約${Math.ceil(simulation.pausedDwellRemaining / 1000)}秒`
        : '走行を一時停止しました。';
      publishDebugState();
    };

    const failStart = (reason) => {
      simulation.running = false;
      status.dataset.state = 'error';
      status.textContent = `走行を開始できません：${reason}`;
      console.error('[shiyakusho] drive start failed', reason, {
        systemKey: definition.key,
        pathLength: path.length,
        metricsTotal: metrics.total,
        panorama: Boolean(panorama),
      });
      updateButtons();
    };

    const startDriving = () => {
      if (simulation.running) return;
      const live = route.systems?.[definition.key];
      if (live?.pathInvalid) {
        const reason = (live.pathIssues || []).map((item) => item.message).filter(Boolean)[0] || 'pathInvalid';
        return failStart([
          '市役所線の走行データを確認できません。',
          `系統：${definition.key}`,
          `理由：${reason}`,
        ].join(' '));
      }
      if (!path.length) return failStart('pathが空です');
      if (!(metrics.total > 0)) return failStart('path距離が不正です');
      if (!panorama) return failStart('panorama未初期化');

      if (simulation.pausedDwellRemaining > 0) {
        simulation.running = true;
        simulation.paused = false;
        simulation.dwellUntil = performance.now() + simulation.pausedDwellRemaining;
        simulation.pausedDwellRemaining = 0;
        simulation.lastTimestamp = null;
        cancelAnimationFrame(simulation.animationFrameId);
        simulation.animationFrameId = requestAnimationFrame(tick);
        status.textContent = '停車カウントを再開しました。';
        updateProgressText();
        return;
      }

      if (simulation.lastPassedStopIndex >= stops.length - 1 && isAtRegisteredStop()) {
        selectStop(0, false);
      }

      const lastDist = stopDistances[simulation.lastPassedStopIndex] || 0;
      if (simulation.traveled > lastDist + 1) {
        hideStopImage(street);
        telop.classList.remove('show');
        simulation.running = true;
        simulation.paused = false;
        simulation.manualHold = false;
        simulation.lastTimestamp = null;
        simulation.nextStopIndex = simulation.lastPassedStopIndex + 1;
        cancelAnimationFrame(simulation.animationFrameId);
        updateDrivingVisual(performance.now(), true);
        simulation.animationFrameId = requestAnimationFrame(tick);
        status.textContent = '走行を再開しました。';
        updateProgressText();
        return;
      }

      hideStopImage(street);
      telop.classList.remove('show');
      simulation.running = true;
      simulation.paused = false;
      simulation.manualHold = false;
      simulation.dwellUntil = 0;
      simulation.lastTimestamp = null;
      cancelAnimationFrame(simulation.animationFrameId);
      updateDrivingVisual(performance.now(), true);
      simulation.animationFrameId = requestAnimationFrame(tick);
      if (!simulation.animationFrameId) return failStart('animation loop開始失敗');
      status.textContent = `${stops[simulation.selectedStopIndex].name}から走行を開始しました。`;
      updateProgressText();
      publishDebugState();
    };

    startPause.onclick = () => { if (simulation.running) pauseDriving(); else startDriving(); };
    previousButton.onclick = () => {
      if (simulation.running) pauseDriving();
      const { previousTargetIndex: target } = getNavTargets();
      if (target < 0 || target >= stops.length) return;
      simulation.running = false;
      cancelAnimationFrame(simulation.animationFrameId);
      simulation.pausedDwellRemaining = 0;
      simulation.dwellUntil = 0;
      selectStop(target, false);
    };
    nextButton.onclick = () => {
      if (simulation.running) pauseDriving();
      const { nextTargetIndex: target } = getNavTargets();
      if (target < 0 || target >= stops.length) return;
      simulation.running = false;
      cancelAnimationFrame(simulation.animationFrameId);
      simulation.pausedDwellRemaining = 0;
      simulation.dwellUntil = 0;
      selectStop(target, false);
    };
    document.getElementById('driveReset').onclick = () => {
      pauseDriving();
      selectStop(0, false);
      status.textContent = `S地点（${stops[0].name}）へ戻しました。`;
    };
    sequence.querySelectorAll('[data-uhd-stop]').forEach((button) => {
      button.onclick = () => {
        pauseDriving();
        selectStop(Number(button.dataset.uhdStop), false);
      };
    });
    markers.forEach((marker, index) => marker.addListener('click', () => {
      pauseDriving();
      selectStop(index, false);
    }));

    selectStop(0, false);
    status.dataset.state = '';
    status.textContent = `市役所線｜系統${DISPLAY_CODE}｜${definition.title}｜${stops.length}停留所｜道路形状：OSM relation採用（要走行確認）`;
    publishDebugState();
    cleanupGuidance = () => {
      simulation.running = false;
      simulation.paused = false;
      cancelAnimationFrame(simulation.animationFrameId);
      simulation.animationFrameId = 0;
      simulation.requestToken += 1;
      markers.forEach((marker) => marker.setMap(null));
      line.setMap(null);
      vehicle.setMap(null);
      controls.remove();
      sequence.remove();
      telop.remove();
      hideStopImage(street);
      if (window.SHIYAKUSHO_DRIVE_STATE?.systemKey === definition.key) {
        window.SHIYAKUSHO_DRIVE_STATE = null;
      }
    };
  }

  routes = function routesShiyakushoV1() {
    const route = ensureRoute();
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) {
      cleanupGuidance?.();
      previousRoutes();
      return;
    }
    // 他路線から切替時に旧 animation loop が残らないよう明示停止
    try { window.HOKUEI_GUIDANCE_V22?.cleanup?.(); } catch (error) {
      console.warn('[shiyakusho] hokuei cleanup failed', error);
    }
    editorRouteId = ROUTE_ID;
    const key = getSelectedSystemKey();
    const definition = SYSTEM_DEFINITIONS[key];
    const system = selectedSystem(route, key);
    routeState.direction = definition.directionGroup;
    applyDirectionStops(route, definition, system);
    renderToken += 1;
    const token = renderToken;

    shell(`<section class="guidance-page-v26">
      <div class="controls manual-route-controls">
        <label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${escHtml(label(item))}</option>`).join('')}</select></label>
        <label>系統<select id="systemSelect">${Object.values(SYSTEM_DEFINITIONS).map((item) => `<option value="${item.key}" ${item.key === key ? 'selected' : ''}>${DISPLAY_CODE}｜${escHtml(item.title)}</option>`).join('')}</select></label>
      </div>
      <div class="split guidance-v22-split">
        <div class="guidance-map-wrap-v22"><div id="routeMap" class="map guidance-map-v22"></div><div class="guidance-version-v22">市役所線・系統${DISPLAY_CODE}</div></div>
        <div id="street" class="street guidance-street-v22"></div>
      </div>
      <p id="mapStatus" class="status" hidden aria-hidden="true">市役所線を準備しています…</p>
    </section>`);

    document.getElementById('routeSelect').onchange = (event) => { routeState.routeId = event.target.value; routes(); };
    document.getElementById('systemSelect').onchange = (event) => {
      setSelectedSystemKey(event.target.value);
      editorSystemKey = event.target.value;
      routes();
    };

    drawGuidance(route, definition, system, token).catch((error) => {
      const node = document.getElementById('mapStatus');
      if (node) {
        node.hidden = false;
        node.removeAttribute('aria-hidden');
        node.dataset.state = 'error';
        const message = error instanceof Error ? error.message : String(error);
        node.textContent = message.includes('市役所線の走行データを確認できません') || message.includes('系統')
          ? message
          : (`系統=${key} | ${message}`);
      }
      console.error('[shiyakusho] drawGuidance failed', definition.key, error);
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
      const start = validPosition(initial) ? initial : { lat: 35.639, lng: 139.925 };
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

  /** 系統ごとに乗り場座標が異なるため、他系統への座標伝播はしない（同一系統内の同名停留所のみ同期）。 */
  function propagateManualCoordinate(route, definition, stop) {
    const system = route.systems?.[definition.key];
    if (!system) return;
    (system.stops || []).forEach((target) => {
      if (normalize(target.name) !== normalize(stop.name)) return;
      if (target === stop) return;
      target.lat = stop.lat;
      target.lng = stop.lng;
      target.address = stop.address;
      target.manualOverride = true;
      target.source = 'manual-confirmed';
      target.systemCode = definition.key;
      target.directionKey = coordinateKey(definition.key, stop.name);
      target.verifiedAt = stop.verifiedAt;
    });
  }

  function openRoute6StopEditor(systemKey, stopIndex) {
    closeEditorDialog();
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[systemKey];
    const system = route.systems[systemKey];
    const stop = system?.stops?.[stopIndex];
    if (!definition || !stop) return;
    const bankKey = imageKey(definition, stop);
    const currentImage = route.shiyakushoStopImages?.[bankKey]?.dataUrl || '';
    const state = { dataUrl: currentImage, removeImage: false, processing: false };
    const dialog = document.createElement('div');
    dialog.id = 'stopEditDialog';
    dialog.className = 'stop-edit-backdrop';
    dialog.dataset.routeId = ROUTE_ID;
    dialog.innerHTML = `<section class="stop-edit-dialog" role="dialog" aria-modal="true">
      <div class="stop-edit-header"><div><h2>市役所線 停留所設定</h2><p>${DISPLAY_CODE}｜${escHtml(definition.title)}・${stopIndex + 1} / ${system.stops.length}</p></div><button type="button" id="closeStopEditor" class="stop-edit-close">×</button></div>
      <div class="stop-edit-grid">
        <label>停留所名<input id="editStopName" value="${escHtml(stop.name)}" readonly></label>
        <label>補足<input id="editStopNote" value="${escHtml(stop.note || '')}"></label>
        <label>住所・場所<input id="editStopAddress" value="${escHtml(stop.address || '')}"></label>
        <label>緯度<input id="editStopLat" inputmode="decimal" value="${validPosition(stop) ? stop.lat.toFixed(7) : ''}"></label>
        <label>経度<input id="editStopLng" inputmode="decimal" value="${validPosition(stop) ? stop.lng.toFixed(7) : ''}"></label>
      </div>
      <div class="stop-edit-actions-inline"><button type="button" id="editStopGeocode" class="secondary">住所から位置を取得</button><span id="editStopStatus" class="status">画像のみ手動登録できます。位置修正は同じ系統内の同名停留所へ反映されます。</span></div>
      <div id="editStopMap" class="stop-edit-map"></div>
      <section class="stop-image-editor-v25">
        <div class="stop-image-editor-heading-v25"><div><strong>停留所の停止画像</strong><span>停車時にStreet View領域へ表示。系統・進行方向単位で管理します。</span></div><button type="button" class="secondary" id="removeUhdImage">画像を削除</button></div>
        <label class="stop-image-drop-v25" tabindex="0"><input id="uhdImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden><img id="uhdImagePreview" alt="停留所画像プレビュー" ${currentImage ? `src="${currentImage}"` : 'hidden'}><span id="uhdImageEmpty" ${currentImage ? 'hidden' : ''}><b>画像を選択</b><br>ドラッグ＆ドロップ<br>スクリーンショットはCtrl＋V</span></label>
        <p class="status stop-image-status-v25" id="uhdImageStatus">${currentImage ? '登録画像あり。「変更を保存」で確定します。' : 'JPEG / PNG / WebPを選択してください。'}</p>
      </section>
      <div class="stop-edit-footer">
        <button type="button" id="cancelStopEdit" class="secondary">キャンセル</button>
        <button type="button" id="previousStopEdit" class="secondary" ${stopIndex > 0 ? '' : 'disabled'}>← 前の停留所</button>
        <button type="button" id="nextStopEdit" class="secondary" ${stopIndex < system.stops.length - 1 ? '' : 'disabled'}>次の停留所 →</button>
        <button type="button" id="saveStopEdit" class="primary">変更を保存</button>
      </div>
    </section>`;
    document.body.appendChild(dialog);

    const preview = document.getElementById('uhdImagePreview');
    const empty = document.getElementById('uhdImageEmpty');
    const imageStatus = document.getElementById('uhdImageStatus');
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
    document.getElementById('uhdImageFile').onchange = (event) => acceptImage(event.target.files?.[0]);
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
    document.getElementById('removeUhdImage').onclick = () => { state.dataUrl = ''; state.removeImage = true; imageStatus.textContent = '画像を削除予定です。「変更を保存」で確定します。'; renderImage(); };

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
      if (!route.shiyakushoStopImages) route.shiyakushoStopImages = {};
      if (state.removeImage) delete route.shiyakushoStopImages[bankKey];
      else if (state.dataUrl) route.shiyakushoStopImages[bankKey] = { dataUrl: state.dataUrl, updatedAt: new Date().toISOString(), sourceSystem: systemKey, sourceStopId: stop.id };
      route.shiyakushoStopImageUpdatedAt = new Date().toISOString();
      save();
      return true;
    };

    const close = () => { document.removeEventListener('paste', pasteHandler, true); closeEditorDialog(); };
    document.getElementById('closeStopEditor').onclick = close;
    document.getElementById('cancelStopEdit').onclick = close;
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    document.getElementById('saveStopEdit').onclick = () => { if (!saveCurrent()) return; close(); stopEditor(); };
    document.getElementById('previousStopEdit').onclick = () => { if (!saveCurrent()) return; close(); openRoute6StopEditor(systemKey, stopIndex - 1); };
    document.getElementById('nextStopEdit').onclick = () => { if (!saveCurrent()) return; close(); openRoute6StopEditor(systemKey, stopIndex + 1); };
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

  function renderShiyakushoStopList() {
    const route = ensureRoute();
    const definition = SYSTEM_DEFINITIONS[editorSystemKey] || SYSTEM_DEFINITIONS[DEFAULT_SYSTEM_KEY];
    const system = route.systems[definition.key];
    const box = document.getElementById('stopList');
    if (!box) return;
    document.getElementById('stopListTitle').textContent = `登録済み停留所｜${DISPLAY_CODE}｜${definition.title}｜${system.stops.length}件`;
    box.innerHTML = system.stops.map((stop, index) => {
      const hasImage = Boolean(getImageEntry(route, definition, stop)?.dataUrl);
      return `<div class="item stop-coordinate-item"><div class="stop-coordinate-main"><strong>${index + 1}. ${escHtml(displayStopName(stop))}</strong><span>${escHtml(stop.address || '住所未設定')}</span><code>緯度 ${validPosition(stop) ? stop.lat.toFixed(6) : '未設定'} ／ 経度 ${validPosition(stop) ? stop.lng.toFixed(6) : '未設定'} ／ 画像 ${hasImage ? '登録済み' : '未登録'}${stop.source ? ` ／ ${escHtml(stop.source)}` : ''}</code></div><button type="button" class="stop-edit-button" data-uhd-edit="${index}">位置・画像を設定</button></div>`;
    }).join('');
    box.querySelectorAll('[data-uhd-edit]').forEach((button) => { button.onclick = () => openRoute6StopEditor(definition.key, Number(button.dataset.uhdEdit)); });
  }

  function route6StopEditor() {
    ensureRoute();
    editorRouteId = ROUTE_ID;
    if (!SYSTEM_DEFINITIONS[editorSystemKey]) editorSystemKey = getSelectedSystemKey();
    document.getElementById('settingsBody').innerHTML = `<div class="grid">
      <div class="card">
        <label>路線<select id="sRoute">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${escHtml(label(item))}</option>`).join('')}</select></label>
        <label>系統<select id="sMode">${Object.values(SYSTEM_DEFINITIONS).map((item) => `<option value="${item.key}" ${item.key === editorSystemKey ? 'selected' : ''}>${DISPLAY_CODE}｜${escHtml(item.title)}</option>`).join('')}</select></label>
        <button type="button" id="settingsRefreshRoute" class="secondary">現在の系統を再確認</button>
        <p class="status" id="sStatus">停留所名と順序は京成バスナビ通過時刻表で確認済みです。道路形状はOSM relation採用（要走行確認）。画像は各停留所の「位置・画像を設定」から手動登録してください。</p>
      </div>
      <div class="card"><strong id="stopListTitle">登録済み停留所</strong><p class="stop-list-help">系統ごとに乗り場座標と道路形状を個別に管理しています。</p><div id="stopList"></div></div>
    </div>`;
    renderShiyakushoStopList();
    document.getElementById('sRoute').onchange = (event) => {
      editorRouteId = event.target.value;
      if (editorRouteId === ROUTE_ID) return;
      stopEditor();
    };
    document.getElementById('sMode').onchange = (event) => {
      editorSystemKey = event.target.value;
      setSelectedSystemKey(editorSystemKey);
      renderShiyakushoStopList();
    };
    document.getElementById('settingsRefreshRoute').onclick = async () => {
      const button = document.getElementById('settingsRefreshRoute');
      button.disabled = true;
      try {
        await resolveSystem(editorSystemKey, { force: true, statusCallback: (text) => { document.getElementById('sStatus').textContent = text; } });
        renderShiyakushoStopList();
        document.getElementById('sStatus').textContent = '停留所と道路形状を再確認しました。';
      } catch (error) { document.getElementById('sStatus').textContent = error instanceof Error ? error.message : '再確認に失敗しました。'; }
      finally { button.disabled = false; }
    };
  }

  stopEditor = function stopEditorShiyakushoV1() {
    if (editorRouteId === ROUTE_ID || routeState?.routeId === ROUTE_ID) {
      route6StopEditor();
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

  window.SHIYAKUSHO_ROUTE_V1 = {
    VERSION,
    SYSTEM_RESOLVED_VERSIONS: clone(SYSTEM_RESOLVED_VERSIONS),
    SYSTEM_DEFINITIONS: clone(SYSTEM_DEFINITIONS),
    DEFAULT_SYSTEM_KEY,
    expectedResolvedVersion,
    ensureRoute,
    resolveSystem,
    resolveAllSystems,
    validateSystemPathIntegrity,
    getSelectedSystemKey,
    setSelectedSystemKey,
    nearestPathIndex,
    hashPathSha256,
  };

  ensureRoute();
  setTimeout(ensureRoute, 1200);
  setTimeout(() => {
    if (page === 'routes' && routeState.routeId === ROUTE_ID) routes();
  }, 0);
})();
