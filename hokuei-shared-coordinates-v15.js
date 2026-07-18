(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-19-shared-coordinate-master-v23';
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

  function occurrenceKeys(stops = []) {
    const counts = new Map();
    return stops.map((stop) => {
      const name = normalize(stop.name);
      const occurrence = (counts.get(name) || 0) + 1;
      counts.set(name, occurrence);
      return `${name}#${occurrence}`;
    });
  }

  function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sourceScore(systemCode, stop) {
    let score = 0;
    if (stop.source === 'manual-confirmed') score += 1_000_000_000_000;
    else if (stop.manualOverride === true) score += 500_000_000_000;
    else if (stop.source === 'manual-shared-copy') score += 250_000_000_000;
    score += timestamp(stop.verifiedAt);
    if (systemCode === '1-1') score += 3;
    else if (systemCode === '1') score += 2;
    else if (systemCode === '1-3') score += 1;
    return score;
  }

  function samePosition(stop, source) {
    if (!validPosition(stop)) return false;
    return Math.abs(stop.lat - source.lat) < 0.00000005 && Math.abs(stop.lng - source.lng) < 0.00000005;
  }

  function buildGroups(systems) {
    const groups = new Map();
    Object.values(systems || {}).forEach((system) => {
      const keys = occurrenceKeys(system.stops || []);
      (system.stops || []).forEach((stop, index) => {
        const key = keys[index];
        stop.sharedStopKey = key;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ system, systemCode: system.code, stop, index, key });
      });
    });
    return groups;
  }

  function chooseMaster(entries) {
    const positioned = entries.filter((entry) => validPosition(entry.stop));
    if (!positioned.length) return null;
    return positioned
      .map((entry) => ({ ...entry, score: sourceScore(entry.systemCode, entry.stop) }))
      .sort((a, b) => b.score - a.score)[0];
  }

  function invalidateSystem(system) {
    system.path = [];
    system.pathSource = null;
    system.verifiedAt = null;
    system.resolvedVersion = null;
    system.guidanceVersion = null;
  }

  function syncSharedCoordinates({ persist = true } = {}) {
    if (syncing) return { changed: false, updated: 0, groups: 0 };
    const route = data?.routes?.find((item) => item.id === ROUTE_ID);
    const systems = route?.systems;
    if (!systems) return { changed: false, updated: 0, groups: 0 };

    syncing = true;
    try {
      const groups = buildGroups(systems);
      let updated = 0;
      const updatedBySystem = {};
      const changedSystems = new Set();
      const masters = {};

      groups.forEach((entries, key) => {
        const master = chooseMaster(entries);
        if (!master) return;
        const source = {
          lat: master.stop.lat,
          lng: master.stop.lng,
          address: master.stop.address || '',
          verifiedAt: master.stop.verifiedAt || new Date().toISOString(),
          sourceSystem: master.systemCode,
          sourceStopId: master.stop.id,
        };
        masters[key] = {
          sourceSystem: source.sourceSystem,
          sourceStopId: source.sourceStopId,
          verifiedAt: source.verifiedAt,
        };

        entries.forEach((entry) => {
          const isMaster = entry.systemCode === master.systemCode && entry.stop.id === master.stop.id;
          const positionChanged = !samePosition(entry.stop, source);
          const keyChanged = entry.stop.sharedStopKey !== key;
          const addressChanged = !entry.stop.address && source.address;
          const metadataChanged = !isMaster && (
            entry.stop.source !== 'manual-shared-copy' ||
            entry.stop.inheritedFromSystem !== source.sourceSystem ||
            entry.stop.inheritedFromStopId !== source.sourceStopId ||
            entry.stop.verifiedAt !== source.verifiedAt
          );

          if (!positionChanged && !keyChanged && !addressChanged && !metadataChanged) return;

          entry.stop.sharedStopKey = key;
          entry.stop.lat = source.lat;
          entry.stop.lng = source.lng;
          if (!entry.stop.address && source.address) entry.stop.address = source.address;
          entry.stop.manualOverride = true;
          if (!isMaster) {
            entry.stop.source = 'manual-shared-copy';
            entry.stop.inheritedFromSystem = source.sourceSystem;
            entry.stop.inheritedFromStopId = source.sourceStopId;
            entry.stop.verifiedAt = source.verifiedAt;
          } else {
            entry.stop.inheritedFromSystem = null;
            entry.stop.inheritedFromStopId = null;
          }
          updated += 1;
          updatedBySystem[entry.systemCode] = (updatedBySystem[entry.systemCode] || 0) + 1;
          changedSystems.add(entry.system);
        });
      });

      changedSystems.forEach(invalidateSystem);
      route.sharedCoordinateVersion = VERSION;
      route.sharedCoordinateUpdatedAt = new Date().toISOString();
      route.sharedCoordinateStats = {
        groups: groups.size,
        updated,
        updatedBySystem,
      };
      route.sharedCoordinateMasters = masters;

      if (updated && persist) originalSave();
      return { changed: updated > 0, updated, groups: groups.size, updatedBySystem };
    } finally {
      syncing = false;
    }
  }

  save = function saveWithSharedHokueiCoordinates() {
    const result = syncSharedCoordinates({ persist: false });
    const saved = originalSave();
    if (result.changed) {
      console.info('共通停留所の緯度・経度を全系統へ一括反映しました。', result);
    }
    return saved;
  };

  function updateEditorHelp() {
    const help = document.querySelector('.stop-list-help');
    if (help) help.textContent = '同じ停留所・同じ方向の位置は、系統1・1-1・1-3へ自動で一括反映されます。';
    const status = document.getElementById('editStopStatus');
    if (status && !status.dataset.sharedCoordinateHelp) {
      status.dataset.sharedCoordinateHelp = '1';
      status.textContent = '保存すると、同じ停留所・同じ方向を使用する全系統へ緯度・経度を一括反映します。';
    }
  }

  new MutationObserver(updateEditorHelp).observe(document.getElementById('app'), {
    childList: true,
    subtree: true,
  });
  new MutationObserver(updateEditorHelp).observe(document.body, {
    childList: true,
    subtree: true,
  });

  function retrySync() {
    attempts += 1;
    const result = syncSharedCoordinates({ persist: true });
    if (result.changed) {
      console.info('D1読込後の共通停留所位置を全系統へ統一しました。', result);
    }
    updateEditorHelp();
    if (attempts < 40) setTimeout(retrySync, 1000);
  }

  retrySync();
  window.HOKUEI_SHARED_COORDINATES_API = {
    VERSION,
    syncSharedCoordinates,
    normalize,
    occurrenceKeys,
  };
})();