// 舞浜リゾート線（route-12）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.maihamaResortLineStopImages。
(() => {
  window.MAIHAMA_RESORT_LINE_STOP_IMAGES_V1 = window.MAIHAMA_RESORT_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-25-maihama-resort-line-stop-images-v1',
    images: {},
  };
})();
