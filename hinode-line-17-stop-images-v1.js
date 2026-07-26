// 日の出線（route-17）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.hinode17LineStopImages。
// route-16 の HINODE_LINE_STOP_IMAGES_V1 / hinodeLineStopImages とは別バンク。
(() => {
  window.HINODE_LINE_17_STOP_IMAGES_V1 = window.HINODE_LINE_17_STOP_IMAGES_V1 || {
    version: '2026-07-26-hinode-line-17-stop-images-v1',
    images: {},
  };
})();
