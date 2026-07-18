(() => {
  const ROUTE_ID = 'route-1';
  const VERSION = '2026-07-18-manual-only-v13';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const MAX_STOPS = 8;
  const previousRoutes = routes;
  const previousDrawRoute = drawRoute;
  const previousStopEditor = stopEditor;
  let drawToken = 0;
  let cleanup = null;

  const selectedCode = () => {
    const code = localStorage.getItem(SYSTEM_KEY) || '1-1';
    return code === '1-5' ? '1' : code;
  };
  const setSelectedCode = (code) => localStorage.setItem(SYSTEM_KEY, code === '1-5' ? '1' : code);
  const manual = (stop) => stop?.manualOverride === true || stop?.source === 'manual-confirmed';
  const displayName = (stop) => `${stop.name}${stop.note ? `（${stop.note}）` : ''}`;

  function prepareManualData() {
    const route = data.routes.find((item) => item.id === ROUTE_ID);
    if (!route?.systems) return route;
    if (route.manualOnlyVersion !== VERSION) {
      Object.values(route.systems).forEach((system) => {
        system.stops.forEach((stop) => {
          if (!manual(stop)) {
            stop.lat = null;
            stop.lng = null;
            stop.placeId = null;
            stop.googleMapsURI = null;
            stop.source = null;
            stop.sourceName = null;
            stop.manualOverride = false;
          }
        });
        system.path = [];
        system.resolvedVersion = null;
        system.pathSource = null;
        system.verifiedAt = null;
      });
      route.manualOnlyVersion = VERSION;
      route.coordinatePolicy = '停留所名と順序のみ固定。位置は設定画面で手動確定し、その地点からGoogle Maps道路ルートを生成。';
      save();
    }
    const system = route.systems[selectedCode()] || route.systems['1-1'];
    route.outbound = system?.stops || [];
    route.inbound = [];
    return route;
  }

  function status(text, state = '') {
    const node = document.getElementById('mapStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.state = state;
  }

  function stripHtml(value = '') {
    const div = document.createElement('div');
    div.innerHTML = value;
    return div.textContent || '';
  }

  function maneuver(maneuverName = '', instructions = '') {
    const m = String(maneuverName).toLowerCase();
    const text = stripHtml(instructions);
    if (m.includes('uturn')) return ['↶', 'Uターン'];
    if (m.includes('roundabout')) return ['↻', 'ロータリー'];
    if (m.includes('sharp-left')) return ['↙', '大きく左折'];
    if (m.includes('sharp-right')) return ['↘', '大きく右折'];
    if (m.includes('slight-left')) return ['↖', '斜め左'];
    if (m.includes('slight-right')) return ['↗', '斜め右'];
    if (m.includes('left') || /左折|左方向/.test(text)) return ['←', '左折'];
    if (m.includes('right') || /右折|右方向/.test(text)) return ['→', '右折'];
    if (m.includes('merge')) return ['⇢', '合流'];
    if (m.includes('fork')) return ['Y', '分岐'];
    if (/直進/.test(text)) return ['↑', '直進'];
    return null;
  }

  async function directions(googleApi, stops) {
    const service = new googleApi.maps.DirectionsService();
    const path = [];
    const turns = [];
    for (let start = 0; start < stops.length - 1; start += MAX_STOPS - 1) {
      const end = Math.min(start + MAX_STOPS - 1, stops.length - 1);
      const segment = stops.slice(start, end + 1);
      status(`道路ルートを生成中… ${start + 1}〜${end + 1}/${stops.length}`);
      const result = await service.route({
        origin: { lat: segment[0].lat, lng: segment[0].lng },
        destination: { lat: segment.at(-1).lat, lng: segment.at(-1).lng },
        waypoints: segment.slice(1, -1).map((stop) => ({ location: { lat: stop.lat, lng: stop.lng }, stopover: true })),
        optimizeWaypoints: false,
        travelMode: googleApi.maps.TravelMode.DRIVING,
        avoidFerries: true,
      });
      const route = result.routes[0];
      const routePath = route?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
      if (!routePath.length) throw new Error('Google Mapsから道路ルートを取得できませんでした。');
      if (path.length) routePath.shift();
      path.push(...routePath);
      (route.legs || []).forEach((leg) => (leg.steps || []).forEach((step) => {
        const guide = maneuver(step.maneuver, step.instructions);
        if (!guide || !step.start_location || !step.end_location) return;
        turns.push({
          arrow: guide[0],
          label: guide[1],
          instruction: stripHtml(step.instructions),
          start: { lat: step.start_location.lat(), lng: step.start_location.lng() },
          end: { lat: step.end_location.lat(), lng: step.end_location.lng() },
        });
      }));
    }
    return { path, turns };
  }

  function heading(a, b) {
    const toRad = (value) => value * Math.PI / 180;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const delta = toRad(b.lng - a.lng);
    const y = Math.sin(delta) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function markerIcon(googleApi, number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#fff" stroke="#0f5ea8" stroke-width="3"/><text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f5ea8">${number}</text></svg>`;
    return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new googleApi.maps.Size(36, 36), anchor: new googleApi.maps.Point(18, 18) };
  }

  function turnPanel(turns, panorama) {
    const street = document.getElementById('street');
    const panel = document.createElement('div');
    panel.className = 'manual-turn-panel';
    panel.innerHTML = `
      <div class="manual-turn-main"><strong id="turnTitle">交差点案内</strong><span id="turnInstruction">案内を選択してください。</span></div>
      <div class="manual-turn-buttons"><button id="previousTurn" type="button">← 前の案内</button><span id="turnCounter">0 / ${turns.length}</span><button id="nextTurn" type="button">次の案内 →</button></div>`;
    street.style.position = 'relative';
    street.appendChild(panel);
    let index = -1;
    const show = (nextIndex) => {
      if (!turns.length) return;
      index = Math.max(0, Math.min(turns.length - 1, nextIndex));
      const turn = turns[index];
      document.getElementById('turnTitle').textContent = `${turn.arrow} ${turn.label}`;
      document.getElementById('turnInstruction').textContent = turn.instruction;
      document.getElementById('turnCounter').textContent = `${index + 1} / ${turns.length}`;
      document.getElementById('previousTurn').disabled = index === 0;
      document.getElementById('nextTurn').disabled = index === turns.length - 1;
      panorama.setPosition(turn.start);
      panorama.setPov({ heading: heading(turn.start, turn.end), pitch: 0 });
      status(`交差点案内 ${index + 1}/${turns.length}｜${turn.label}｜${turn.instruction}`);
    };
    document.getElementById('previousTurn').onclick = () => show(index - 1);
    document.getElementById('nextTurn').onclick = () => show(index + 1);
    if (turns.length) show(0);
    else {
      document.getElementById('turnInstruction').textContent = '右左折案内はありません。';
      document.getElementById('previousTurn').disabled = true;
      document.getElementById('nextTurn').disabled = true;
    }
    return panel;
  }

  function stopPanel(system, panorama) {
    const panel = document.createElement('section');
    panel.className = 'route-sequence-card';
    panel.innerHTML = `<div class="route-sequence-title">系統${esc(system.code)}｜全${system.stops.length}停留所</div><div class="route-sequence">${system.stops.map((stop, index) => `<button type="button" class="route-sequence-stop" data-stop-index="${index}">${index + 1}. ${esc(displayName(stop))}</button>${index < system.stops.length - 1 ? '<span class="route-sequence-arrow">→</span>' : ''}`).join('')}</div>`;
    document.querySelector('.split')?.insertAdjacentElement('afterend', panel);
    panel.querySelectorAll('[data-stop-index]').forEach((button) => {
      button.onclick = () => {
        const stop = system.stops[Number(button.dataset.stopIndex)];
        panorama.setPosition({ lat: stop.lat, lng: stop.lng });
        status(`${displayName(stop)}を表示中`);
      };
    });
    return panel;
  }

  async function drawManual(route, system, token) {
    cleanup?.();
    const valid = system.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    const googleApi = await loadMaps();
    if (token !== drawToken || page !== 'routes') return;
    const center = valid[0] ? { lat: valid[0].lat, lng: valid[0].lng } : { lat: 35.662, lng: 139.901 };
    const map = new googleApi.maps.Map(document.getElementById('routeMap'), { center, zoom: valid.length ? 14 : 13, mapTypeControl: false });
    const panorama = new googleApi.maps.StreetViewPanorama(document.getElementById('street'), { position: center, pov: { heading: 0, pitch: 0 }, zoom: 1, motionTracking: false });
    const bounds = new googleApi.maps.LatLngBounds();
    const markers = [];
    system.stops.forEach((stop, index) => {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      const marker = new googleApi.maps.Marker({ map, position, icon: markerIcon(googleApi, index + 1), title: displayName(stop) });
      marker.addListener('click', () => { panorama.setPosition(position); status(`${index + 1}. ${displayName(stop)}｜手動設定位置`); });
      markers.push(marker);
    });
    if (valid.length) map.fitBounds(bounds, 50);
    const missing = system.stops.length - valid.length;
    if (missing) {
      status(`位置設定 ${valid.length}/${system.stops.length}件。残り${missing}件を手動設定してください。`, 'warning');
      cleanup = () => markers.forEach((marker) => marker.setMap(null));
      return;
    }
    const result = await directions(googleApi, system.stops);
    if (token !== drawToken || page !== 'routes') return;
    const line = new googleApi.maps.Polyline({ map, path: result.path, strokeColor: '#0f5ea8', strokeOpacity: .92, strokeWeight: 6 });
    system.path = result.path;
    system.pathSource = '手動設定した停留所位置からGoogle Maps道路ルートを生成';
    system.turnCount = result.turns.length;
    system.verifiedAt = new Date().toISOString();
    route.outbound = system.stops;
    save();
    const turns = turnPanel(result.turns, panorama);
    const stops = stopPanel(system, panorama);
    status(`系統${system.code}｜手動位置から道路ルート生成済み｜交差点案内 ${result.turns.length}件`, 'ok');
    cleanup = () => { markers.forEach((marker) => marker.setMap(null)); line.setMap(null); turns.remove(); stops.remove(); };
  }

  routes = function manualRoutesV13() {
    const route = prepareManualData();
    const selectedRoute = data.routes.find((item) => item.id === routeState.routeId) || data.routes[0];
    if (selectedRoute?.id !== ROUTE_ID) return previousRoutes();
    const code = selectedCode();
    const system = route.systems[code] || route.systems['1-1'];
    route.outbound = system.stops;
    route.inbound = [];
    const count = system.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)).length;
    drawToken += 1;
    const token = drawToken;
    shell(`<section><div class="controls manual-route-controls"><label>路線<select id="routeSelect">${data.routes.map((item) => `<option value="${item.id}" ${item.id === ROUTE_ID ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label><label>系統<select id="systemSelect">${Object.values(route.systems).map((item) => `<option value="${item.code}" ${item.code === code ? 'selected' : ''}>${esc(item.code)}｜${esc(item.title)}</option>`).join('')}</select></label></div><section class="manual-mode-card"><div><strong>手動位置モード</strong><span>位置設定 ${count}/${system.stops.length}件。自動検索は停止しています。</span></div><button id="manualSettings" class="secondary" type="button">設定画面で位置を決める</button></section><div class="split"><div id="routeMap" class="map"></div><div id="street" class="street"></div></div><p id="mapStatus" class="status">手動設定位置を確認中…</p></section>`);
    document.getElementById('routeSelect').onchange = (event) => { routeState.routeId = event.target.value; routes(); };
    document.getElementById('systemSelect').onchange = (event) => { setSelectedCode(event.target.value); save(); routes(); };
    document.getElementById('manualSettings').onclick = () => { settingsTab = 'stops'; go('settings'); };
    drawManual(route, system, token).catch((error) => status(error instanceof Error ? error.message : 'ルートを表示できませんでした。', 'error'));
  };

  drawRoute = function manualDrawRouteV13(route, stops) {
    if (route?.id === ROUTE_ID) return;
    previousDrawRoute(route, stops);
  };

  stopEditor = function manualStopEditorV13() {
    prepareManualData();
    previousStopEditor();
    const hide = (id) => { const node = document.getElementById(id); if (node) node.hidden = true; };
    ['settingsRefreshRoute', 'sName', 'sNote', 'sAddress', 'sLat', 'sLng', 'sSearch', 'picker', 'sStatus', 'sAdd'].forEach(hide);
    const help = document.querySelector('.stop-list-help');
    if (help) help.textContent = '系統を選び、各停留所の「編集」から地図をクリックして位置を手動設定してください。';
  };

  new MutationObserver(() => {
    const dialog = document.getElementById('stopEditDialog');
    if (!dialog || dialog.dataset.manualPrepared) return;
    dialog.dataset.manualPrepared = '1';
    const name = document.getElementById('editStopName');
    const note = document.getElementById('editStopNote');
    const address = document.getElementById('editStopAddress');
    if (name) name.readOnly = true;
    if (note) note.readOnly = true;
    if (address) address.readOnly = true;
    const geocode = document.getElementById('editStopGeocode');
    if (geocode) geocode.hidden = true;
    const message = document.getElementById('editStopStatus');
    if (message) message.textContent = '地図上の正しいバス停位置をクリックするか、緯度・経度を入力してください。';
  }).observe(document.body, { childList: true, subtree: true });

  prepareManualData();
  setTimeout(prepareManualData, 4000);
})();