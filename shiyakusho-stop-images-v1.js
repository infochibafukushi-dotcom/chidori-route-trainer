// 市役所線（route-6）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 6-maihama|市役所前）
// 画像なしでも走行可能。D1共有フィールドは route.shiyakushoStopImages。
(() => {
  window.SHIYAKUSHO_STOP_IMAGES_V1 = window.SHIYAKUSHO_STOP_IMAGES_V1 || {
    version: '2026-07-24-shiyakusho-stop-images-v1',
    images: {},
  };
})();
