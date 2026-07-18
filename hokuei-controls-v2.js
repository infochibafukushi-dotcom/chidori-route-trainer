(() => {
  const SPEED_KMH = 15;
  const SPEED_METERS_PER_SECOND = (SPEED_KMH * 1000) / 3600;
  const STOP_DWELL_MILLISECONDS = 5000;

  setupBusAnimation = function setupBusAnimationV2({
    googleApi,
    map,
    path,
    stops,
    panorama,
    routeStatus,
    arrowLine,
  }) {
    hokueiAnimationCleanup?.();

    document.getElementById('hokueiBusControls')?.remove();

    const controls = document.createElement('div');
    controls.id = 'hokueiBusControls';
    controls.className = 'bus-controls';
    controls.innerHTML = `
      <button type="button" id="busStart" class="primary bus-control-button">▶ ${SPEED_KMH}km/hで走行</button>
      <button type="button" id="busPause" class="secondary bus-control-button">一時停止</button>
      <button type="button" id="busSkip" class="secondary bus-control-button">次の停留所へ</button>
      <button type="button" id="busReset" class="secondary bus-control-button">最初に戻す</button>
      <span id="busProgress" class="bus-progress">${stops[0]?.name || '始発'}で待機中</span>`;

    document.querySelector('.split')?.insertAdjacentElement('afterend', controls);

    const vehicleMarker = new googleApi.maps.Marker({
      map,
      position: path[0],
      title: `北栄線 バス（時速${SPEED_KMH}km）`,
      icon: createBusIcon(googleApi),
      zIndex: 1000,
    });

    const metrics = buildPathMetrics(path);
    const stopDistances = mapStopsToRouteDistances(stops, path, metrics);
    const progress = document.getElementById('busProgress');
    const skipButton = document.getElementById('busSkip');

    let traveled = 0;
    let running = false;
    let frameId = null;
    let previousTime = null;
    let nextStopIndex = 1;
    let dwellUntil = 0;
    let lastStreetViewUpdate = 0;
    let lastStreetViewDistance = -Infinity;
    let streetViewBusy = false;

    function updateSkipButton() {
      const nextStop = stops[nextStopIndex];
      if (!nextStop) {
        skipButton.textContent = '終点に到着';
        skipButton.disabled = true;
        return;
      }
      skipButton.disabled = false;
      skipButton.textContent = `次へ：${nextStop.name}`;
      skipButton.title = `${nextStop.name}までスキップ`;
    }

    function updateArrow() {
      if (!arrowLine || !metrics.totalDistance) return;
      const icons = arrowLine.get('icons');
      if (!icons?.length) return;
      icons[0].offset = `${Math.min(100, (traveled / metrics.totalDistance) * 100).toFixed(2)}%`;
      arrowLine.set('icons', icons);
    }

    async function updateStreetView(now, force = false) {
      if (streetViewBusy || !panorama || !metrics.totalDistance) return;
      if (!force && now - lastStreetViewUpdate < 1200 && traveled - lastStreetViewDistance < 3) return;
      const current = getPositionAtDistance(path, metrics, traveled);
      streetViewBusy = true;
      try {
        panorama.setPosition(current.position);
        panorama.setPov({
          heading: headingDegrees(current.position, current.nextPosition),
          pitch: 0,
        });
        lastStreetViewUpdate = now;
        lastStreetViewDistance = traveled;
      } finally {
        streetViewBusy = false;
      }
    }

    function updateVehicle(now, forceStreetView = false) {
      if (!metrics.totalDistance) return;
      const current = getPositionAtDistance(path, metrics, traveled);
      vehicleMarker.setPosition(current.position);
      updateArrow();
      updateStreetView(now, forceStreetView);
      const nextStop = stops[nextStopIndex];
      progress.textContent = `${(traveled / 1000).toFixed(2)} / ${(metrics.totalDistance / 1000).toFixed(2)}km｜時速${SPEED_KMH}km${nextStop ? `｜次：${nextStop.name}` : ''}`;
      updateSkipButton();
    }

    function completeRoute() {
      running = false;
      dwellUntil = 0;
      traveled = metrics.totalDistance;
      nextStopIndex = stops.length;
      updateVehicle(performance.now(), true);
      progress.textContent = `${stops.at(-1)?.name || '終点'}に到着｜総距離 ${(metrics.totalDistance / 1000).toFixed(2)}km`;
      routeStatus.textContent = '北栄線 系統1の走行を完了しました。';
      updateSkipButton();
    }

    function arriveAtStop(stopIndex, now, keepRunning) {
      const arrivedStop = stops[stopIndex];
      traveled = stopDistances[stopIndex];
      nextStopIndex = stopIndex + 1;
      previousTime = null;
      updateVehicle(now, true);
      panorama.setPosition({ lat: arrivedStop.lat, lng: arrivedStop.lng });
      updateSkipButton();

      if (keepRunning) {
        dwellUntil = now + STOP_DWELL_MILLISECONDS;
        routeStatus.textContent = `${arrivedStop.name}に到着。5秒間停車します。`;
      } else {
        dwellUntil = 0;
        progress.textContent = `${arrivedStop.name}へスキップしました${nextStopIndex < stops.length ? `｜次：${stops[nextStopIndex].name}` : '｜終点'}`;
        routeStatus.textContent = `${arrivedStop.name}へ移動しました。`;
      }
    }

    function tick(now) {
      if (!running) return;

      if (dwellUntil) {
        if (now < dwellUntil) {
          const remainingSeconds = Math.max(1, Math.ceil((dwellUntil - now) / 1000));
          const stop = stops[Math.max(0, nextStopIndex - 1)];
          progress.textContent = `${stop?.name || 'バス停'}で停車中｜あと${remainingSeconds}秒｜次：${stops[nextStopIndex]?.name || '終点'}`;
          frameId = requestAnimationFrame(tick);
          return;
        }
        dwellUntil = 0;
        previousTime = now;
        if (traveled >= metrics.totalDistance) {
          completeRoute();
          return;
        }
        routeStatus.textContent = `バス停を出発しました。時速${SPEED_KMH}kmで走行中です。`;
      }

      if (previousTime === null) previousTime = now;
      const elapsedSeconds = Math.min((now - previousTime) / 1000, 1);
      previousTime = now;
      const previousDistance = traveled;
      traveled = Math.min(metrics.totalDistance, traveled + SPEED_METERS_PER_SECOND * elapsedSeconds);

      const targetStopDistance = stopDistances[nextStopIndex];
      if (
        Number.isFinite(targetStopDistance) &&
        previousDistance < targetStopDistance &&
        traveled >= targetStopDistance
      ) {
        arriveAtStop(nextStopIndex, now, true);
        frameId = requestAnimationFrame(tick);
        return;
      }

      updateVehicle(now);
      if (traveled >= metrics.totalDistance) {
        completeRoute();
        return;
      }
      frameId = requestAnimationFrame(tick);
    }

    document.getElementById('busStart').onclick = () => {
      if (traveled >= metrics.totalDistance) {
        traveled = 0;
        nextStopIndex = 1;
        updateVehicle(performance.now(), true);
      }
      running = true;
      dwellUntil = 0;
      previousTime = null;
      routeStatus.textContent = `バス・矢印・Street Viewを時速${SPEED_KMH}kmで連動中です。`;
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(tick);
    };

    document.getElementById('busPause').onclick = () => {
      running = false;
      previousTime = null;
      dwellUntil = 0;
      cancelAnimationFrame(frameId);
      routeStatus.textContent = '走行を一時停止しました。';
    };

    skipButton.onclick = () => {
      if (nextStopIndex >= stops.length) return;
      const wasRunning = running;
      const now = performance.now();
      arriveAtStop(nextStopIndex, now, wasRunning);
      cancelAnimationFrame(frameId);
      if (wasRunning) frameId = requestAnimationFrame(tick);
    };

    document.getElementById('busReset').onclick = () => {
      running = false;
      previousTime = null;
      dwellUntil = 0;
      traveled = 0;
      nextStopIndex = 1;
      cancelAnimationFrame(frameId);
      vehicleMarker.setPosition(path[0]);
      updateArrow();
      panorama.setPosition(path[0]);
      progress.textContent = `${stops[0]?.name || '始発'}で待機中｜次：${stops[1]?.name || '終点'}`;
      routeStatus.textContent = '停留所ピンを押すと下半分にStreet Viewを表示します。';
      updateSkipButton();
    };

    updateSkipButton();

    hokueiAnimationCleanup = () => {
      running = false;
      cancelAnimationFrame(frameId);
      vehicleMarker.setMap(null);
      arrowLine?.setMap(null);
      controls.remove();
    };
  };
})();
