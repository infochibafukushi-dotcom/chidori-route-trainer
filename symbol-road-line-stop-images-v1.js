// シンボルロード線（route-11）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 11-urayasu-hinode|日の出南）
// 画像なしでも走行可能。D1共有フィールドは route.symbolRoadLineStopImages。
(() => {
  window.SYMBOL_ROAD_LINE_STOP_IMAGES_V1 = window.TAKASU_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-25-symbol-road-line-stop-images-v1',
    images: {},
  };
})();
