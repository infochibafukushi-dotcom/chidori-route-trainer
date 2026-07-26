// 弁天・富岡線（route-14）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.bentenTomiokaLineStopImages。
(() => {
  window.BENTEN_TOMIOKA_LINE_STOP_IMAGES_V1 = window.BENTEN_TOMIOKA_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-benten-tomioka-line-stop-images-v1',
    images: {},
  };
})();
