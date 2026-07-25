// 高洲線（route-10）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 10-minato-minami|みなと南）
// 画像なしでも走行可能。D1共有フィールドは route.takasuLineStopImages。
(() => {
  window.TAKASU_LINE_STOP_IMAGES_V1 = window.TAKASU_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-25-takasu-line-stop-images-v1',
    images: {},
  };
})();
