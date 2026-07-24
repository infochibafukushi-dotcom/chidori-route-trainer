// 舞浜線（route-9）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 9-maihama|京成ローズタウン）
// 画像なしでも走行可能。D1共有フィールドは route.maihamaLineStopImages。
(() => {
  window.MAIHAMA_LINE_STOP_IMAGES_V1 = window.MAIHAMA_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-25-maihama-line-stop-images-v1',
    images: {},
  };
})();
