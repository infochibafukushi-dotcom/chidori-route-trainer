// 潮音の街線（route-15）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.shioneNoMachiLineStopImages。
(() => {
  window.SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1 = window.SHIONE_NO_MACHI_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-shione-no-machi-line-stop-images-v1',
    images: {},
  };
})();
