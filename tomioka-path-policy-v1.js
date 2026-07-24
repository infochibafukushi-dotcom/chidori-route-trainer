// 富岡線（route-4）の道路形状ポリシー。
// 停留所順：京成バスナビ通過時刻表で確認済み。
// 座標・道路：OSM relation採用（要走行確認）。
(() => {
  const POLICY_VERSION = '2026-07-24-tomioka-path-v1';
  window.TOMIOKA_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    routeSource: 'OSM route relation採用（系統キー単位・要走行確認）',
    osmUsage: '停留所座標・道路形状に使用。Google Directionsは使用しない。',
    stopOrderStatus: '京成バスナビ通過時刻表で確認済み',
    streetViewStatus: '未完了（要走行確認）',
  };
})();
