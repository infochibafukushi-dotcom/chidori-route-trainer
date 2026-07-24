// 富岡線（route-4）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 4-tdl|舞浜駅）
// 画像なしでも走行可能。D1共有キーは tomioka-stop-images。
(() => {
  window.TOMIOKA_STOP_IMAGES_V1 = window.TOMIOKA_STOP_IMAGES_V1 || {
    version: '2026-07-24-tomioka-stop-images-v1',
    images: {},
  };
})();
