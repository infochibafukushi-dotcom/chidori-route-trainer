// 浦安東団地線（route-3）の道路形状ポリシー。
// 停留所座標・道路形状のいずれも OSM route relation の確定 pathPoints
// （urayasu-higashi-danchi-platforms-v1.js / urayasu-higashi-danchi-path-v1.js）を採用し、
// Google Directions は使用しない。フラグのみを公開する最小モジュール。
(() => {
  const POLICY_VERSION = '2026-07-23-urayasu-higashi-danchi-path-v1';

  window.URAYASU_HIGASHI_DANCHI_PATH_POLICY_V1 = {
    version: POLICY_VERSION,
    routeSource: 'OSM route relation（確定pathPoints・系統キー単位）',
    osmUsage: '停留所座標・道路形状の両方に使用（Google Directionsは使用しない）',
  };
})();
