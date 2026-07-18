(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-18-shared-coordinate-seed-v15';
  const originalSave = save;
  let syncing = false;
  let attempts = 0;

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  const validPosition = (stop) => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng);
  const isManualPosition = (stop) => validPosition(stop) && (
    stop.manualOverride === true ||
    stop.source === 'manual-confirmed' ||
    stop.source === 'manual-shared-copy'
  );

  function occurrenceKeys(stops = []) {
    const counts = new Map();
    return stops.map((stop) => {
      const name = normalize(stop.name);
      const occurrence = (counts.get(name) || 0) + 1;
      counts.set(name, occurrence);
      return `${name}#${occurrence}`;
    });
  }

  function sourcePriority(systemCode, stop) {
    let score = 0;
    if (stop.source === 'manual-confirmed') score += 100;
    if (stop.manualOverride === true) score += 80;
    if (systemCode === '1-1') score += 30;
    if (systemCode === '1') score += 20;
    if (systemCode === '1-3') score += 10;
    return score;
  }

  function buildCoordinateBank(systems) {
    const bank = new Map();
    Object.values(systems || {}).forEach((system) => {
      const keys = occurrenceKeys(system.stops || []);
      (system.stops || []).forEach((stop, index) => {
        if (!isManualPosition(stop)) return;
        const key = keys[index];
        const candidate = {
          lat: stop.lat,
          lng: stop.lng,
          address: stop.address || '',
          verifiedAt: stop.verifiedAt || new Date().toISOString(),
          sourceSystem: system.code,
          priority: sourcePriority(system.code, stop),
        };
        const current = bank.get(key);
        if (!current || candidate.priority > current.priority) bank.set(key, candidate);
      });
    });
    return bank;
  }

  function syncSharedCoordinates({ persist = true } = {}) {
    if (syncing) return { changed: false, copied: 0, manualSources: 0 };
    const route = data?.routes?.find((item) => item.id === ROUTE_ID);
    const systems = route?.systems;
    if (!systems) return { changed: false, copied: 0, manualSources: 0 };

    syncing = true;
    try {
      const bank = buildCoordinateBank(systems);
      if (!bank.size) return { changed: false, copied: 0, manualSources: 0 };

      let copied = 0;
      const copiedBySystem = {};
      Object.values(systems).forEach((system) => {
        const keys = occurrenceKeys(system.stops || []);
        let systemCopied = 0;
        (system.stops || []).forEach((stop, index) => {
          if (validPosition(stop)) return;
          const source = bank.get(keys[index]);
          if (!source) return;
          stop.lat = source.lat;
          stop.lng = source.lng;
          if (!stop.address && source.address) stop.address = source.address;
          stop.manualOverride = true;
          stop.source = 'manual-shared-copy';
          stop.inheritedFromSystem = source.sourceSystem;
          stop.verifiedAt = source.verifiedAt;
          copied += 1;
          systemCopied += 1;
        });
        if (systemCopied) {
          system.path = [];
          system.pathSource = null;
          system.verifiedAt = null;
          system.resolvedVersion = null;
          copiedBySystem[system.code] = systemCopied;
        }
      });

      route.sharedCoordinateSeedVersion = VERSION;
      route.sharedCoordinateSeedAt = new Date().toISOString();
      route.sharedCoordinateSeedStats = {
        manualSources: bank.size,
        copied,
        copiedBySystem,
      };

      if (copied && persist) originalSave();
      return { changed: copied > 0, copied, manualSources: bank.size, copiedBySystem };
    } finally {
      syncing = false;
    }
  }

  save = function saveWithSharedHokueiCoordinates() {
    syncSharedCoordinates({ persist: false });
    return originalSave();
  };

  function retrySync() {
    attempts += 1;
    const result = syncSharedCoordinates({ persist: true });
    if (result.changed) {
      console.info('北栄線の共通停留所位置を他系統へ反映しました。', result);
    }
    if (attempts < 30) setTimeout(retrySync, 1000);
  }

  retrySync();
  window.HOKUEI_SHARED_COORDINATES_API = { VERSION, syncSharedCoordinates };
})();