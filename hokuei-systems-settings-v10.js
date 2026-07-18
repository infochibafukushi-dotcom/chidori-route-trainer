(() => {
  let selectedRouteId = HOKUEI_SYSTEMS_API.ROUTE_ID;
  let selectedMode = HOKUEI_SYSTEMS_API.currentCode();
  let editMapCleanup = null;

  const parseNumber = (value) => {
    const number = Number(String(value).trim());
    return Number.isFinite(number) ? number : null;
  };
  const coordinateText = (value) => Number.isFinite(value) ? value.toFixed(6) : '未設定';
  const routeById = (id) => data.routes.find((route) => route.id === id);
  const isHokuei = (route) => route?.id === HOKUEI_SYSTEMS_API.ROUTE_ID;
  const modesFor = (route) => isHokuei(route)
    ? Object.values(route.systems || {}).map((item) => ({ value: item.code, label: `${item.code}｜${item.title}` }))
    : [{ value: 'outbound', label: '行き' }, { value: 'inbound', label: '戻り' }];
  const stopsFor = (route, mode) => isHokuei(route) ? (route.systems?.[mode]?.stops || []) : (route?.[mode] || []);
  const modeLabel = (route, mode) => isHokuei(route) ? `系統${mode}` : (mode === 'outbound' ? '行き' : '戻り');
  const stopName = (stop) => HOKUEI_SYSTEMS_API.displayName(stop);

  function closeEdit() {
    editMapCleanup?.();
    editMapCleanup = null;
    document.getElementById('stopEditDialog')?.remove();
  }

  async function mountMap(containerId, latId, lngId, statusId, initial, track = false) {
    if (track) editMapCleanup?.();
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const googleApi = await loadMaps();
      const fallback = { lat: 35.653, lng: 139.901 };
      const start = Number.isFinite(initial?.lat) && Number.isFinite(initial?.lng) ? initial : fallback;
      const map = new googleApi.maps.Map(container, { center: start, zoom: initial ? 17 : 13, mapTypeControl: false, streetViewControl: false });
      const marker = new googleApi.maps.Marker({ map, position: start, draggable: true });
      const update = (position) => {
        const lat = position.lat();
        const lng = position.lng();
        const latInput = document.getElementById(latId);
        const lngInput = document.getElementById(lngId);
        if (latInput) latInput.value = lat.toFixed(7);
        if (lngInput) lngInput.value = lng.toFixed(7);
        const status = document.getElementById(statusId);
        if (status) status.textContent = `位置：${lat.toFixed(7)}, ${lng.toFixed(7)}`;
      };
      const click = map.addListener('click', (event) => { marker.setPosition(event.latLng); update(event.latLng); });
      const drag = marker.addListener('dragend', () => { const position = marker.getPosition(); if (position) update(position); });
      const sync = () => {
        const lat = parseNumber(document.getElementById(latId)?.value);
        const lng = parseNumber(document.getElementById(lngId)?.value);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
      };
      document.getElementById(latId)?.addEventListener('change', sync);
      document.getElementById(lngId)?.addEventListener('change', sync);
      if (track) editMapCleanup = () => { click.remove(); drag.remove(); };
    } catch (error) {
      const status = document.getElementById(statusId);
      if (status) status.textContent = error instanceof Error ? error.message : '地図を読み込めませんでした。';
    }
  }

  function openEdit(routeId, mode, stopId) {
    closeEdit();
    const route = routeById(routeId);
    const stops = stopsFor(route, mode);
    const index = stops.findIndex((stop) => stop.id === stopId);
    const stop = stops[index];
    if (!route || !stop || index < 0) return;
    const previous = stops[index - 1];
    const next = stops[index + 1];
    const dialog = document.createElement('div');
    dialog.id = 'stopEditDialog';
    dialog.className = 'stop-edit-backdrop';
    dialog.innerHTML = `
      <section class="stop-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="stopEditTitle">
        <div class="stop-edit-header">
          <div><h2 id="stopEditTitle">停留所を編集</h2><p>${esc(label(route))}・${esc(modeLabel(route, mode))}・${index + 1} / ${stops.length}</p></div>
          <button type="button" id="closeStopEditor" class="stop-edit-close" aria-label="閉じる">×</button>
        </div>
        <div class="stop-edit-grid">
          <label>停留所名<input id="editStopName" value="${esc(stop.name)}"></label>
          <label>補足<input id="editStopNote" value="${esc(stop.note || '')}" placeholder="例：2回目・新浦安駅方向"></label>
          <label>住所・場所<input id="editStopAddress" value="${esc(stop.address || '')}"></label>
          <label>緯度<input id="editStopLat" inputmode="decimal" value="${Number.isFinite(stop.lat) ? stop.lat.toFixed(7) : ''}"></label>
          <label>経度<input id="editStopLng" inputmode="decimal" value="${Number.isFinite(stop.lng) ? stop.lng.toFixed(7) : ''}"></label>
        </div>
        <div class="stop-edit-actions-inline"><button type="button" id="editStopGeocode" class="secondary">住所から位置を取得</button><span id="editStopStatus" class="status">地図、ピン、緯度・経度から位置を修正できます。</span></div>
        <div id="editStopMap" class="stop-edit-map"></div>
        <div class="stop-edit-footer">
          <button type="button" id="cancelStopEdit" class="secondary">キャンセル</button>
          <button type="button" id="previousStopEdit" class="secondary" ${previous ? '' : 'disabled'}>← 前の停留所</button>
          <button type="button" id="nextStopEdit" class="secondary" ${next ? '' : 'disabled'}>次の停留所 →</button>
          <button type="button" id="saveStopEdit" class="primary">変更を保存</button>
        </div>
      </section>`;
    document.body.appendChild(dialog);
    document.getElementById('closeStopEditor').onclick = closeEdit;
    document.getElementById('cancelStopEdit').onclick = closeEdit;
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeEdit(); });

    const saveCurrent = () => {
      const name = document.getElementById('editStopName').value.trim();
      const note = document.getElementById('editStopNote').value.trim();
      const address = document.getElementById('editStopAddress').value.trim();
      const lat = parseNumber(document.getElementById('editStopLat').value);
      const lng = parseNumber(document.getElementById('editStopLng').value);
      const status = document.getElementById('editStopStatus');
      if (!name) { status.textContent = '停留所名を入力してください。'; return false; }
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { status.textContent = '正しい緯度・経度を入力してください。'; return false; }
      stop.name = name;
      stop.note = note;
      stop.address = address;
      stop.lat = lat;
      stop.lng = lng;
      stop.manualPosition = true;
      stop.positionSource = `manual:${mode}:${index}`;
      stop.updatedAt = new Date().toISOString();
      save();
      return true;
    };

    document.getElementById('editStopGeocode').onclick = async () => {
      const status = document.getElementById('editStopStatus');
      try {
        const position = await geocode(document.getElementById('editStopAddress').value.trim());
        document.getElementById('editStopLat').value = position.lat.toFixed(7);
        document.getElementById('editStopLng').value = position.lng.toFixed(7);
        await mountMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', position, true);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };
    document.getElementById('previousStopEdit').onclick = () => { if (previous && saveCurrent()) openEdit(routeId, mode, previous.id); };
    document.getElementById('nextStopEdit').onclick = () => { if (next && saveCurrent()) openEdit(routeId, mode, next.id); };
    document.getElementById('saveStopEdit').onclick = () => { if (!saveCurrent()) return; closeEdit(); settings(); };
    mountMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', { lat: stop.lat, lng: stop.lng }, true);
  }

  function renderModeOptions() {
    const route = routeById(document.getElementById('sRoute')?.value || selectedRouteId);
    const select = document.getElementById('sMode');
    const labelNode = document.getElementById('sModeLabel');
    if (!route || !select) return;
    const available = modesFor(route);
    if (!available.some((item) => item.value === selectedMode)) selectedMode = available[0]?.value || 'outbound';
    if (labelNode) labelNode.firstChild.textContent = isHokuei(route) ? '系統' : '方向';
    select.innerHTML = available.map((item) => `<option value="${item.value}" ${item.value === selectedMode ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
  }

  function renderList() {
    const box = document.getElementById('stopList');
    if (!box) return;
    const route = routeById(document.getElementById('sRoute')?.value || selectedRouteId);
    const mode = document.getElementById('sMode')?.value || selectedMode;
    selectedRouteId = route?.id || selectedRouteId;
    selectedMode = mode;
    const stops = stopsFor(route, mode);
    const title = document.getElementById('stopListTitle');
    if (title) title.textContent = `登録済み停留所｜${modeLabel(route, mode)}｜${stops.length}件`;
    box.innerHTML = stops.map((stop,index) => `
      <div class="item stop-coordinate-item">
        <div class="stop-coordinate-main"><strong>${index + 1}. ${esc(stopName(stop))}</strong><span>${esc(stop.address || '住所未設定')}</span><code>緯度 ${coordinateText(stop.lat)} ／ 経度 ${coordinateText(stop.lng)}</code></div>
        <button type="button" class="stop-edit-button" data-system-edit="${route.id}|${mode}|${stop.id}">編集</button>
      </div>`).join('') || '<p>この系統の停留所は未登録です。</p>';
    box.querySelectorAll('[data-system-edit]').forEach((button) => {
      button.onclick = () => {
        const [routeId, targetMode, stopId] = button.dataset.systemEdit.split('|');
        openEdit(routeId, targetMode, stopId);
      };
    });
  }

  stopEditor = function stopEditorBySystem() {
    HOKUEI_SYSTEMS_API.ensureSystems();
    const route = routeById(selectedRouteId) || data.routes[0];
    selectedRouteId = route?.id || '';
    document.getElementById('settingsBody').innerHTML = `
      <div class="grid">
        <div class="card">
          <label>路線<select id="sRoute">${data.routes.map((item) => `<option value="${item.id}" ${item.id === selectedRouteId ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}</select></label>
          <label id="sModeLabel">系統<select id="sMode"></select></label>
          <label>停留所名<input id="sName"></label>
          <label>補足<input id="sNote" placeholder="例：2回目・新浦安駅方向"></label>
          <label>住所・施設名<input id="sAddress"></label>
          <div class="coordinate-inputs"><label>緯度<input id="sLat" inputmode="decimal" placeholder="35.0000000"></label><label>経度<input id="sLng" inputmode="decimal" placeholder="139.0000000"></label></div>
          <button class="secondary" id="sSearch">住所から位置を取得</button>
          <div id="picker" class="picker"></div>
          <p id="sStatus" class="status">地図をクリック、または緯度・経度を直接入力できます。</p>
          <button class="primary" id="sAdd">停留所を追加</button>
        </div>
        <div class="card"><strong id="stopListTitle">登録済み停留所</strong><p class="stop-list-help">選択中の系統だけを表示します。</p><div id="stopList"></div></div>
      </div>`;
    renderModeOptions();
    renderList();
    mountMap('picker', 'sLat', 'sLng', 'sStatus', null);

    document.getElementById('sRoute').onchange = (event) => {
      selectedRouteId = event.target.value;
      selectedMode = isHokuei(routeById(selectedRouteId)) ? HOKUEI_SYSTEMS_API.currentCode() : 'outbound';
      renderModeOptions();
      renderList();
    };
    document.getElementById('sMode').onchange = (event) => {
      selectedMode = event.target.value;
      if (isHokuei(routeById(selectedRouteId))) HOKUEI_SYSTEMS_API.setCurrentCode(selectedMode);
      renderList();
    };
    document.getElementById('sSearch').onclick = async () => {
      const status = document.getElementById('sStatus');
      try {
        const position = await geocode(document.getElementById('sAddress').value.trim());
        document.getElementById('sLat').value = position.lat.toFixed(7);
        document.getElementById('sLng').value = position.lng.toFixed(7);
        status.textContent = `位置：${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };
    document.getElementById('sAdd').onclick = () => {
      const route = routeById(document.getElementById('sRoute').value);
      const mode = document.getElementById('sMode').value;
      const stops = stopsFor(route, mode);
      const name = document.getElementById('sName').value.trim();
      const lat = parseNumber(document.getElementById('sLat').value);
      const lng = parseNumber(document.getElementById('sLng').value);
      if (!route || !name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { alert('停留所名と正しい緯度・経度を入力してください。'); return; }
      stops.push({ id: `stop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name, note: document.getElementById('sNote').value.trim(), address: document.getElementById('sAddress').value.trim(), lat, lng, manualPosition: true });
      save();
      settings();
    };
  };
})();