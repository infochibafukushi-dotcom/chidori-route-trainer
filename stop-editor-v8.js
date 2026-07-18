(() => {
  const MANUAL_POSITION_PREFIX = 'google-places-selected-direction-v5';
  let editorMapCleanup = null;

  const directionLabel = (direction) => direction === 'outbound' ? '行き' : '戻り';

  function parseCoordinate(value) {
    const number = Number(String(value).trim());
    return Number.isFinite(number) ? number : null;
  }

  function coordinateText(value) {
    return Number.isFinite(value) ? value.toFixed(6) : '未設定';
  }

  function findStop(routeId, direction, stopId) {
    const route = data.routes.find((item) => item.id === routeId);
    const stops = route?.[direction] || [];
    const index = stops.findIndex((item) => item.id === stopId);
    return { route, stops, index, stop: index >= 0 ? stops[index] : null };
  }

  function setCoordinateInputs(lat, lng) {
    const latInput = document.getElementById('editStopLat');
    const lngInput = document.getElementById('editStopLng');
    if (latInput) latInput.value = Number.isFinite(lat) ? lat.toFixed(7) : '';
    if (lngInput) lngInput.value = Number.isFinite(lng) ? lng.toFixed(7) : '';
  }

  async function mountCoordinateMap(containerId, latInputId, lngInputId, statusId, initial, trackCleanup = false) {
    if (trackCleanup) editorMapCleanup?.();
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const googleApi = await loadMaps();
      const fallback = { lat: 35.653, lng: 139.901 };
      const start = Number.isFinite(initial?.lat) && Number.isFinite(initial?.lng) ? initial : fallback;
      const map = new googleApi.maps.Map(container, {
        center: start,
        zoom: initial ? 17 : 13,
        mapTypeControl: false,
        streetViewControl: false,
      });
      const marker = new googleApi.maps.Marker({
        map,
        position: start,
        draggable: true,
      });

      const updatePosition = (position) => {
        const lat = position.lat();
        const lng = position.lng();
        const latInput = document.getElementById(latInputId);
        const lngInput = document.getElementById(lngInputId);
        if (latInput) latInput.value = lat.toFixed(7);
        if (lngInput) lngInput.value = lng.toFixed(7);
        const status = document.getElementById(statusId);
        if (status) status.textContent = `位置：${lat.toFixed(7)}, ${lng.toFixed(7)}`;
      };

      const clickListener = map.addListener('click', (event) => {
        marker.setPosition(event.latLng);
        updatePosition(event.latLng);
      });
      const dragListener = marker.addListener('dragend', () => {
        const position = marker.getPosition();
        if (position) updatePosition(position);
      });

      const syncFromInputs = () => {
        const lat = parseCoordinate(document.getElementById(latInputId)?.value);
        const lng = parseCoordinate(document.getElementById(lngInputId)?.value);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const position = { lat, lng };
        marker.setPosition(position);
        map.panTo(position);
      };
      document.getElementById(latInputId)?.addEventListener('change', syncFromInputs);
      document.getElementById(lngInputId)?.addEventListener('change', syncFromInputs);

      if (trackCleanup) {
        editorMapCleanup = () => {
          clickListener.remove();
          dragListener.remove();
        };
      }
    } catch (error) {
      const status = document.getElementById(statusId);
      if (status) status.textContent = error instanceof Error ? error.message : '地図を読み込めませんでした。';
    }
  }

  function closeEditor() {
    editorMapCleanup?.();
    editorMapCleanup = null;
    document.getElementById('stopEditDialog')?.remove();
  }

  function openEditor(routeId, direction, stopId) {
    closeEditor();
    const { route, stops, index, stop } = findStop(routeId, direction, stopId);
    if (!route || !stop || index < 0) return;

    const previousStop = stops[index - 1] || null;
    const nextStop = stops[index + 1] || null;
    const dialog = document.createElement('div');
    dialog.id = 'stopEditDialog';
    dialog.className = 'stop-edit-backdrop';
    dialog.innerHTML = `
      <section class="stop-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="stopEditTitle">
        <div class="stop-edit-header">
          <div>
            <h2 id="stopEditTitle">停留所を編集</h2>
            <p>${esc(label(route))}・${directionLabel(direction)}・${index + 1} / ${stops.length}</p>
          </div>
          <button type="button" id="closeStopEditor" class="stop-edit-close" aria-label="閉じる">×</button>
        </div>
        <div class="stop-edit-grid">
          <label>停留所名<input id="editStopName" value="${esc(stop.name)}"></label>
          <label>住所・場所<input id="editStopAddress" value="${esc(stop.address || '')}"></label>
          <label>緯度<input id="editStopLat" inputmode="decimal" value="${Number.isFinite(stop.lat) ? stop.lat.toFixed(7) : ''}" placeholder="35.0000000"></label>
          <label>経度<input id="editStopLng" inputmode="decimal" value="${Number.isFinite(stop.lng) ? stop.lng.toFixed(7) : ''}" placeholder="139.0000000"></label>
        </div>
        <div class="stop-edit-actions-inline">
          <button type="button" id="editStopGeocode" class="secondary">住所から位置を取得</button>
          <span id="editStopStatus" class="status">地図をクリック、ピンを移動、または緯度・経度を直接入力できます。</span>
        </div>
        <div id="editStopMap" class="stop-edit-map"></div>
        <div class="stop-edit-footer">
          <button type="button" id="cancelStopEdit" class="secondary">キャンセル</button>
          <button type="button" id="previousStopEdit" class="secondary" ${previousStop ? '' : 'disabled'}>← 前の停留所</button>
          <button type="button" id="nextStopEdit" class="secondary" ${nextStop ? '' : 'disabled'}>次の停留所 →</button>
          <button type="button" id="saveStopEdit" class="primary">変更を保存</button>
        </div>
      </section>`;
    document.body.appendChild(dialog);

    document.getElementById('closeStopEditor').onclick = closeEditor;
    document.getElementById('cancelStopEdit').onclick = closeEditor;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeEditor();
    });

    document.getElementById('editStopGeocode').onclick = async () => {
      const address = document.getElementById('editStopAddress').value.trim();
      const status = document.getElementById('editStopStatus');
      try {
        if (!address) throw new Error('住所・場所を入力してください。');
        status.textContent = '位置を検索しています…';
        const position = await geocode(address);
        setCoordinateInputs(position.lat, position.lng);
        await mountCoordinateMap('editStopMap', 'editStopLat', 'editStopLng', 'editStopStatus', position, true);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };

    const saveCurrentStop = () => {
      const name = document.getElementById('editStopName').value.trim();
      const address = document.getElementById('editStopAddress').value.trim();
      const lat = parseCoordinate(document.getElementById('editStopLat').value);
      const lng = parseCoordinate(document.getElementById('editStopLng').value);
      const status = document.getElementById('editStopStatus');

      if (!name) {
        status.textContent = '停留所名を入力してください。';
        return false;
      }
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        status.textContent = '正しい緯度・経度を入力してください。';
        return false;
      }

      stop.name = name;
      stop.address = address;
      stop.lat = lat;
      stop.lng = lng;
      stop.placeId = null;
      stop.googleMapsURI = null;
      stop.iconMaskURI = null;
      stop.iconBackgroundColor = '#1a73e8';
      stop.positionSource = `${MANUAL_POSITION_PREFIX}:${direction}:${index}`;
      stop.manualPosition = true;
      stop.updatedAt = new Date().toISOString();
      save();
      return true;
    };

    document.getElementById('previousStopEdit').onclick = () => {
      if (!previousStop || !saveCurrentStop()) return;
      openEditor(routeId, direction, previousStop.id);
    };

    document.getElementById('nextStopEdit').onclick = () => {
      if (!nextStop || !saveCurrentStop()) return;
      openEditor(routeId, direction, nextStop.id);
    };

    document.getElementById('saveStopEdit').onclick = () => {
      if (!saveCurrentStop()) return;
      closeEditor();
      settings();
    };

    mountCoordinateMap(
      'editStopMap',
      'editStopLat',
      'editStopLng',
      'editStopStatus',
      Number.isFinite(stop.lat) && Number.isFinite(stop.lng) ? { lat: stop.lat, lng: stop.lng } : null,
      true,
    );
  }

  stopEditor = function stopEditorWithCoordinates() {
    document.getElementById('settingsBody').innerHTML = `
      <div class="grid">
        <div class="card">
          <label>路線<select id="sRoute">${data.routes.map((route) => `<option value="${route.id}">${label(route)}</option>`).join('')}</select></label>
          <label>方向<select id="sDir"><option value="outbound">行き</option><option value="inbound">戻り</option></select></label>
          <label>停留所名<input id="sName"></label>
          <label>住所・施設名<input id="sAddress"></label>
          <div class="coordinate-inputs">
            <label>緯度<input id="sLat" inputmode="decimal" placeholder="35.0000000"></label>
            <label>経度<input id="sLng" inputmode="decimal" placeholder="139.0000000"></label>
          </div>
          <button class="secondary" id="sSearch">住所から位置を取得</button>
          <div id="picker" class="picker"></div>
          <p id="sStatus" class="status">地図をクリック、または緯度・経度を直接入力できます。</p>
          <button class="primary" id="sAdd">停留所を追加</button>
        </div>
        <div class="card">
          <strong>登録済み停留所</strong>
          <p class="stop-list-help">緯度・経度を確認し、「編集」から位置を修正できます。</p>
          <div id="stopList"></div>
        </div>
      </div>`;

    mountCoordinateMap('picker', 'sLat', 'sLng', 'sStatus', null);

    document.getElementById('sSearch').onclick = async () => {
      const status = document.getElementById('sStatus');
      try {
        const position = await geocode(document.getElementById('sAddress').value);
        document.getElementById('sLat').value = position.lat.toFixed(7);
        document.getElementById('sLng').value = position.lng.toFixed(7);
        status.textContent = `位置：${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '位置を取得できませんでした。';
      }
    };

    document.getElementById('sAdd').onclick = () => {
      const lat = parseCoordinate(document.getElementById('sLat').value);
      const lng = parseCoordinate(document.getElementById('sLng').value);
      const position = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
      const route = data.routes.find((item) => item.id === document.getElementById('sRoute').value);
      const direction = document.getElementById('sDir').value;
      const name = document.getElementById('sName').value.trim();
      if (!route || !name || !position) {
        alert('停留所名と緯度・経度を設定してください。');
        return;
      }
      route[direction].push({
        id: id('stop'),
        name,
        address: document.getElementById('sAddress').value.trim(),
        lat: position.lat,
        lng: position.lng,
        manualPosition: true,
      });
      save();
      settings();
    };

    renderStopList();
  };

  renderStopList = function renderEditableStopList() {
    const box = document.getElementById('stopList');
    if (!box) return;
    const rows = [];
    data.routes.forEach((route) => {
      ['outbound', 'inbound'].forEach((direction) => {
        (route[direction] || []).forEach((stop, index) => {
          rows.push(`
            <div class="item stop-coordinate-item">
              <div class="stop-coordinate-main">
                <strong>${esc(label(route))}・${directionLabel(direction)}・${index + 1}. ${esc(stop.name)}</strong>
                <span>${esc(stop.address || '住所未設定')}</span>
                <code>緯度 ${coordinateText(stop.lat)} ／ 経度 ${coordinateText(stop.lng)}</code>
              </div>
              <button type="button" class="stop-edit-button" data-editstop="${route.id}|${direction}|${stop.id}">編集</button>
            </div>`);
        });
      });
    });
    box.innerHTML = rows.join('') || '<p>未登録</p>';
    document.querySelectorAll('[data-editstop]').forEach((button) => {
      button.onclick = () => {
        const [routeId, direction, stopId] = button.dataset.editstop.split('|');
        openEditor(routeId, direction, stopId);
      };
    });
  };
})();