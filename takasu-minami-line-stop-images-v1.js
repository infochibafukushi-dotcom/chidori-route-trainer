// 高洲南線（route-19）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.takasuMinamiLineStopImages。
(() => {
  window.TAKASU_MINAMI_LINE_STOP_IMAGES_V1 = window.TAKASU_MINAMI_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-takasu-minami-line-v1-stop-images',
    images: {},
  };
})();
