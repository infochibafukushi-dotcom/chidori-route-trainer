// 堀江線（route-5）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`（例: 5-shinurayasu|浦安駅入口）
// 画像なしでも走行可能。D1共有キーは horie-stop-images。
(() => {
  window.HORIE_STOP_IMAGES_V1 = window.HORIE_STOP_IMAGES_V1 || {
    version: '2026-07-24-horie-stop-images-v1',
    images: {},
  };
})();
