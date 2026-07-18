(() => {
  const renderRoutes = routes;

  routes = function routesWithClearDirectionLabels() {
    renderRoutes();
    if (routeState.routeId !== HOKUEI_ROUTE_ID) return;

    const outboundButton = document.querySelector('[data-dir="outbound"]');
    const inboundButton = document.querySelector('[data-dir="inbound"]');

    if (outboundButton) {
      outboundButton.textContent = '新浦安→浦安';
      outboundButton.title = '新浦安駅から浦安駅入口まで';
    }

    if (inboundButton) {
      inboundButton.textContent = '浦安駅東口→新浦安';
      inboundButton.title = '浦安駅東口から新浦安駅まで';
    }
  };
})();