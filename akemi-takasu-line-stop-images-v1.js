// 明海・高洲線（route-18）停留所画像バンク初期化。
// キー形式: `${systemKey}|${normalize(stopName)}`
// 画像なしでも走行可能。D1共有フィールドは route.akemiTakasuLineStopImages。
// 潮音の街線（route-15）や日の出線（route-17）の画像バンクとは独立したストア。
// 画像は捏造しない。初期状態は空バンク。
(() => {
  window.AKEMI_TAKASU_LINE_STOP_IMAGES_V1 = window.AKEMI_TAKASU_LINE_STOP_IMAGES_V1 || {
    version: '2026-07-26-akemi-takasu-line-stop-images-v1',
    images: {},
  };
})();
