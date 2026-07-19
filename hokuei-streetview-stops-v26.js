(() => {
  /**
   * 停留所ごとの Street View 表示設定（1か所で管理）
   * key: 停留所名#出現回数（本番 sharedStopKey と一致）
   * lat/lng は車両座標とは別に、見やすいパノラマ位置を指定
   * 座標は本番データ（2026-07-19 確認）の停留所付近を基準
   */
  const VERSION = '2026-07-19-streetview-stops-v26b';
  const DEFAULT_STOP_MS = 3000;

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  /** @type {Record<string, {
   *   panoId?: string,
   *   lat?: number,
   *   lng?: number,
   *   heading?: number,
   *   pitch?: number,
   *   zoom?: number,
   *   stopDurationMs?: number,
   *   note?: string
   * }>} */
  const BY_KEY = {
    // --- 確認済み優先停留所（本番座標ベース） ---
    // 新浦安駅：駅舎・ロータリー側が見える向き
    '新浦安駅#1': {
      lat: 35.64955,
      lng: 139.91395,
      heading: 35,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '始発・駅舎／のりば方面',
    },
    '新浦安駅#2': {
      lat: 35.64952,
      lng: 139.91430,
      heading: 20,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '終点・駅舎方面',
    },

    // 海楽東児童公園：公園側ではなく車道・停留所側へ
    '海楽東児童公園#1': {
      lat: 35.65880,
      lng: 139.91250,
      heading: 140,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '往路・車道側停留所',
    },
    '海楽東児童公園#2': {
      lat: 35.65901,
      lng: 139.91227,
      heading: 70,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '復路・車道側停留所',
    },

    // 浦安高校前：校門・標識側
    '浦安高校前#1': {
      lat: 35.66155,
      lng: 139.90826,
      heading: 300,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '往路・高校門方面',
    },
    '浦安高校前#2': {
      lat: 35.66124,
      lng: 139.90883,
      heading: 120,
      pitch: 0,
      zoom: 1,
      stopDurationMs: DEFAULT_STOP_MS,
      note: '復路・高校門方面',
    },

    // --- 往路 ---
    '入船東団地#1': { lat: 35.65041, lng: 139.91765, heading: 200, pitch: 0, zoom: 1 },
    '入船五丁目#1': { lat: 35.65141, lng: 139.91829, heading: 340, pitch: 0, zoom: 1 },
    '入船六丁目#1': { lat: 35.65227, lng: 139.91721, heading: 310, pitch: 0, zoom: 1 },
    '浦安警察署#1': { lat: 35.65400, lng: 139.91503, heading: 310, pitch: 0, zoom: 1 },
    '美浜北小学校#1': { lat: 35.65483, lng: 139.91400, heading: 20, pitch: 0, zoom: 1 },
    '美浜中学校#1': { lat: 35.65736, lng: 139.91469, heading: 340, pitch: 0, zoom: 1 },
    '海楽西児童公園#1': { lat: 35.65931, lng: 139.90509, heading: 250, pitch: 0, zoom: 1 },
    '消防本部前#1': { lat: 35.65896, lng: 139.90393, heading: 20, pitch: 0, zoom: 1 },
    '砂田橋#1': { lat: 35.66163, lng: 139.90361, heading: 310, pitch: 0, zoom: 1 },
    '北栄四丁目#1': { lat: 35.66269, lng: 139.90198, heading: 310, pitch: 0, zoom: 1 },
    '北栄大三角線#1': { lat: 35.66363, lng: 139.90055, heading: 310, pitch: 0, zoom: 1 },
    '北栄中央#1': { lat: 35.66443, lng: 139.89931, heading: 310, pitch: 0, zoom: 1 },
    '北栄三丁目#1': { lat: 35.66526, lng: 139.89809, heading: 300, pitch: 0, zoom: 1 },
    '北栄一丁目#1': { lat: 35.66604, lng: 139.89648, heading: 200, pitch: 0, zoom: 1 },
    '浦安駅東口#1': { lat: 35.66659, lng: 139.89432, heading: 250, pitch: 1, zoom: 1 },
    '当代島#1': { lat: 35.66946, lng: 139.89402, heading: 20, pitch: 0, zoom: 1 },

    // --- 復路・循環後半 ---
    '北栄北#1': { lat: 35.67026, lng: 139.89634, heading: 130, pitch: 0, zoom: 1 },
    '北栄第二街区公園#1': { lat: 35.66931, lng: 139.89807, heading: 130, pitch: 0, zoom: 1 },
    '北栄二丁目#1': { lat: 35.66826, lng: 139.89968, heading: 150, pitch: 0, zoom: 1 },
    '北部幼稚園入口#1': { lat: 35.66671, lng: 139.89886, heading: 160, pitch: 0, zoom: 1 },
    '北栄中央#2': { lat: 35.66545, lng: 139.89985, heading: 130, pitch: 0, zoom: 1 },
    '北栄大三角線#2': { lat: 35.66471, lng: 139.90099, heading: 130, pitch: 0, zoom: 1 },
    '北栄四丁目#2': { lat: 35.66303, lng: 139.90359, heading: 140, pitch: 0, zoom: 1 },
    '砂田橋#2': { lat: 35.66150, lng: 139.90439, heading: 150, pitch: 0, zoom: 1 },
    '消防本部前#2': { lat: 35.65951, lng: 139.90333, heading: 100, pitch: 0, zoom: 1 },
    '海楽西児童公園#2': { lat: 35.66010, lng: 139.90541, heading: 70, pitch: 0, zoom: 1 },
    '美浜中学校#2': { lat: 35.65740, lng: 139.91473, heading: 160, pitch: 0, zoom: 1 },
    '美浜北小学校#2': { lat: 35.65557, lng: 139.91424, heading: 170, pitch: 0, zoom: 1 },
    '浦安警察署#2': { lat: 35.65404, lng: 139.91509, heading: 140, pitch: 0, zoom: 1 },
    '入船六丁目#2': { lat: 35.65224, lng: 139.91734, heading: 130, pitch: 0, zoom: 1 },
    '入船五丁目#2': { lat: 35.65150, lng: 139.91827, heading: 160, pitch: 0, zoom: 1 },
    '入船東団地#2': { lat: 35.65000, lng: 139.91725, heading: 220, pitch: 0, zoom: 1 },

    // 系統1 / 1-3 追加停留所（本番に無い場合も設定を保持）
    '東京ベイ医療センター入口#1': { lat: 35.67064, lng: 139.89190, heading: 40, pitch: 0, zoom: 1 },
    '東京ベイ医療センター#1': { lat: 35.67135, lng: 139.89255, heading: 120, pitch: 0, zoom: 1 },
    '浦安駅入口#1': { lat: 35.66522, lng: 139.89072, heading: 220, pitch: 0, zoom: 1 },
  };

  function occurrenceKey(stops, index) {
    const stop = stops?.[index];
    if (!stop) return '';
    const name = normalize(stop.name);
    let occurrence = 0;
    for (let i = 0; i <= index; i += 1) {
      if (normalize(stops[i]?.name) === name) occurrence += 1;
    }
    return `${stop.name.replace(/（.*?）|\(.*?\)/g, '').trim()}#${occurrence}`;
  }

  function lookupKey(stop, index, stops) {
    if (stop?.sharedStopKey) {
      const raw = String(stop.sharedStopKey);
      const match = raw.match(/^(.*)#(\d+)$/);
      if (match) {
        const label = stop.name?.replace(/（.*?）|\(.*?\)/g, '').trim() || match[1];
        return `${label}#${match[2]}`;
      }
    }
    if (Array.isArray(stops) && Number.isInteger(index)) return occurrenceKey(stops, index);
    return `${String(stop?.name || '').replace(/（.*?）|\(.*?\)/g, '').trim()}#1`;
  }

  function resolve(stop, index = 0, stops = null) {
    if (stop?.streetView && typeof stop.streetView === 'object') {
      return {
        ...stop.streetView,
        stopDurationMs: stop.streetView.stopDurationMs ?? stop.stopDurationMs ?? DEFAULT_STOP_MS,
        source: 'stop.streetView',
      };
    }
    const key = lookupKey(stop, index, stops);
    const configured = BY_KEY[key] || BY_KEY[`${String(stop?.name || '').replace(/（.*?）|\(.*?\)/g, '').trim()}#1`];
    if (configured) {
      return {
        panoId: configured.panoId || '',
        lat: configured.lat,
        lng: configured.lng,
        heading: configured.heading,
        pitch: configured.pitch ?? 0,
        zoom: configured.zoom ?? 1,
        stopDurationMs: configured.stopDurationMs ?? stop?.stopDurationMs ?? DEFAULT_STOP_MS,
        source: `config:${key}`,
        key,
      };
    }
    return {
      lat: stop?.lat,
      lng: stop?.lng,
      heading: undefined,
      pitch: 0,
      zoom: 1,
      stopDurationMs: stop?.stopDurationMs ?? DEFAULT_STOP_MS,
      source: 'fallback-stop-coords',
      key,
    };
  }

  window.HOKUEI_STREETVIEW_STOPS = {
    version: VERSION,
    defaultStopDurationMs: DEFAULT_STOP_MS,
    byKey: BY_KEY,
    resolve,
    lookupKey,
    occurrenceKey,
  };
})();
