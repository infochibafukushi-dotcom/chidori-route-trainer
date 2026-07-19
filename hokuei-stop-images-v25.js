(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const MAX_DATA_URL_CHARS = 70000;
  const mountedDialogs = new WeakSet();
  const states = new WeakMap();
  let routeOverlay = null;
  let shownKey = '';

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\s　・･「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  function occurrenceKeys(stops = []) {
    const counts = new Map();
    return stops.map((stop) => {
      const name = normalize(stop.name);
      const occurrence = (counts.get(name) || 0) + 1;
      counts.set(name, occurrence);
      return `${name}#${occurrence}`;
    });
  }

  function selectedSystemCode() {
    const code = localStorage.getItem(SYSTEM_KEY) || '1-1';
    return code === '1-5' ? '1' : code;
  }

  function getRoute() {
    return data?.routes?.find((route) => route.id === ROUTE_ID) || null;
  }

  function ensureImageBank(route) {
    if (!route.sharedStopImages || typeof route.sharedStopImages !== 'object') route.sharedStopImages = {};
    return route.sharedStopImages;
  }

  function sharedKey(system, stop, index) {
    if (stop?.sharedStopKey) return stop.sharedStopKey;
    const key = occurrenceKeys(system?.stops || [])[index] || '';
    if (key) stop.sharedStopKey = key;
    return key;
  }

  function editorContext(dialog) {
    const route = getRoute();
    if (!route) return null;
    const code = document.getElementById('sMode')?.value || selectedSystemCode();
    const system = route.systems?.[code];
    if (!system) return null;
    const text = dialog.querySelector('.stop-edit-header p')?.textContent || '';
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return null;
    const index = Number(match[1]) - 1;
    const stop = system.stops?.[index];
    if (!stop) return null;
    return { route, system, stop, index, key: sharedKey(system, stop, index) };
  }

  function imageSizeLabel(dataUrl = '') {
    const comma = dataUrl.indexOf(',');
    const bytes = Math.max(0, Math.round((dataUrl.length - comma - 1) * 0.75));
    return bytes >= 1024 ? `${Math.round(bytes / 1024)}KB` : `${bytes}B`;
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('画像形式を確認してください。'));
        image.onload = () => resolve(image);
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function canvasDataUrl(image, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/webp', quality);
    if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', quality);
    return result;
  }

  async function compressImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
    const image = await readImage(file);
    const scale = Math.min(1, 960 / image.naturalWidth, 540 / image.naturalHeight);
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    let quality = 0.78;
    let dataUrl = canvasDataUrl(image, width, height, quality);

    for (let attempt = 0; attempt < 14 && dataUrl.length > MAX_DATA_URL_CHARS; attempt += 1) {
      if (quality > 0.42) quality -= 0.07;
      else {
        width = Math.max(420, Math.round(width * 0.86));
        height = Math.max(236, Math.round(height * 0.86));
      }
      dataUrl = canvasDataUrl(image, width, height, quality);
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('画像を小さく切り取ってから登録してください。');
    return { dataUrl, width, height };
  }

  function renderPreview(dialog) {
    const state = states.get(dialog);
    if (!state) return;
    const preview = dialog.querySelector('[data-stop-image-preview]');
    const empty = dialog.querySelector('[data-stop-image-empty]');
    const remove = dialog.querySelector('[data-stop-image-remove]');
    const status = dialog.querySelector('[data-stop-image-status]');
    const dataUrl = state.removed ? '' : state.dataUrl;
    if (dataUrl) {
      preview.src = dataUrl;
      preview.hidden = false;
      empty.hidden = true;
      remove.disabled = false;
      if (!state.processing) status.textContent = `登録画像あり｜${imageSizeLabel(dataUrl)}｜「変更を保存」で確定します。`;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
      empty.hidden = false;
      remove.disabled = true;
      if (!state.processing) status.textContent = '画像を選択・ドロップ、またはスクリーンショットをCtrl＋Vで貼り付けできます。';
    }
  }

  async function acceptFile(dialog, file) {
    const state = states.get(dialog);
    if (!state || !file || state.processing) return;
    const status = dialog.querySelector('[data-stop-image-status]');
    state.processing = true;
    status.textContent = '画像を圧縮しています…';
    try {
      const result = await compressImage(file);
      state.dataUrl = result.dataUrl;
      state.removed = false;
      state.dirty = true;
      status.textContent = `${result.width}×${result.height}pxに準備しました。変更を保存してください。`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '画像を処理できませんでした。';
    } finally {
      state.processing = false;
      renderPreview(dialog);
    }
  }

  function applyImage(state) {
    if (!state?.dirty || !state.context?.key) return false;
    const { route, system, stop, key } = state.context;
    const bank = ensureImageBank(route);
    if (state.removed) delete bank[key];
    else if (state.dataUrl) {
      bank[key] = {
        dataUrl: state.dataUrl,
        updatedAt: new Date().toISOString(),
        sourceSystem: system.code,
        sourceStopId: stop.id,
      };
    }

    Object.values(route.systems || {}).forEach((targetSystem) => {
      const keys = occurrenceKeys(targetSystem.stops || []);
      (targetSystem.stops || []).forEach((targetStop, index) => {
        if (keys[index] !== key) return;
        targetStop.sharedStopKey = key;
        targetStop.stopImageKey = state.removed ? null : key;
        targetStop.stopImageUpdatedAt = state.removed ? null : bank[key]?.updatedAt || null;
      });
    });
    route.sharedStopImageVersion = '2026-07-19-stop-images-v25';
    route.sharedStopImageUpdatedAt = new Date().toISOString();
    state.dirty = false;
    return true;
  }

  function mountEditor(dialog) {
    if (mountedDialogs.has(dialog)) return;
    const context = editorContext(dialog);
    if (!context?.key) return;
    mountedDialogs.add(dialog);
    const current = ensureImageBank(context.route)[context.key]?.dataUrl || '';
    const state = { context, dataUrl: current, removed: false, dirty: false, processing: false };
    states.set(dialog, state);

    const section = document.createElement('section');
    section.className = 'stop-image-editor-v25';
    section.innerHTML = `
      <div class="stop-image-editor-heading-v25">
        <div><strong>停留所の停止画像</strong><span>停車中の3秒間に表示します。同じ停留所・同じ方向の全系統で共通です。</span></div>
        <button type="button" class="secondary" data-stop-image-remove>画像を削除</button>
      </div>
      <label class="stop-image-drop-v25" tabindex="0">
        <input type="file" accept="image/*" data-stop-image-file hidden>
        <img data-stop-image-preview alt="停留所の停止画像プレビュー" hidden>
        <span data-stop-image-empty><b>画像を選択</b><br>ドラッグ＆ドロップ<br>スクリーンショットはCtrl＋V</span>
      </label>
      <p class="status stop-image-status-v25" data-stop-image-status></p>`;
    dialog.querySelector('.stop-edit-footer')?.insertAdjacentElement('beforebegin', section);

    const drop = section.querySelector('.stop-image-drop-v25');
    const input = section.querySelector('[data-stop-image-file]');
    const remove = section.querySelector('[data-stop-image-remove]');
    input.addEventListener('change', () => acceptFile(dialog, input.files?.[0]));
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('dragging');
      const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/'));
      acceptFile(dialog, file);
    });
    remove.addEventListener('click', () => {
      state.dataUrl = '';
      state.removed = true;
      state.dirty = true;
      renderPreview(dialog);
    });

    ['saveStopEdit', 'previousStopEdit', 'nextStopEdit'].forEach((id) => {
      dialog.querySelector(`#${id}`)?.addEventListener('click', (event) => {
        if (state.processing) {
          event.preventDefault();
          event.stopImmediatePropagation();
          dialog.querySelector('[data-stop-image-status]').textContent = '画像処理が終わるまでお待ちください。';
          return;
        }
        if (applyImage(state)) save();
      }, true);
    });
    renderPreview(dialog);
  }

  document.addEventListener('paste', (event) => {
    const dialog = document.getElementById('stopEditDialog');
    if (!dialog || !states.has(dialog)) return;
    const file = [...(event.clipboardData?.items || [])]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    acceptFile(dialog, file);
  }, true);

  function activeStopImage() {
    const route = getRoute();
    const system = route?.systems?.[selectedSystemCode()];
    if (!route || !system) return null;
    const activeStops = (system.stops || []).filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    const button = document.querySelector('.route-sequence-stop.active[data-guidance-stop]');
    const activeIndex = Number(button?.dataset.guidanceStop);
    const stop = Number.isInteger(activeIndex) ? activeStops[activeIndex] : null;
    if (!stop) return null;
    const index = system.stops.indexOf(stop);
    const key = sharedKey(system, stop, index);
    const entry = route.sharedStopImages?.[key];
    return entry?.dataUrl ? { key: `${system.code}|${key}`, dataUrl: entry.dataUrl } : null;
  }

  function ensureOverlay() {
    const street = document.getElementById('street');
    if (!street) return null;
    if (routeOverlay?.isConnected && routeOverlay.parentElement === street) return routeOverlay;
    routeOverlay = document.createElement('div');
    routeOverlay.className = 'stop-image-display-v25';
    routeOverlay.hidden = true;
    routeOverlay.innerHTML = '<img alt="停留所の停止画像">';
    street.appendChild(routeOverlay);
    return routeOverlay;
  }

  let hideTimer = 0;
  let dismissedKey = '';
  const OVERLAY_VISIBLE_MS = 1600;

  function refreshRouteImage() {
    const telop = document.querySelector('.station-name-telop.show');
    if (!telop) {
      shownKey = '';
      dismissedKey = '';
      clearTimeout(hideTimer);
      if (routeOverlay?.isConnected && !routeOverlay.hidden) routeOverlay.hidden = true;
      return;
    }
    const info = activeStopImage();
    if (!info) {
      shownKey = '';
      dismissedKey = '';
      clearTimeout(hideTimer);
      if (routeOverlay?.isConnected && !routeOverlay.hidden) routeOverlay.hidden = true;
      return;
    }
    const overlay = ensureOverlay();
    if (!overlay) return;

    // 同じ停留所で一度自動非表示にしたら、テロップ中は再表示しない
    if (dismissedKey === info.key) {
      if (!overlay.hidden) overlay.hidden = true;
      return;
    }

    if (shownKey !== info.key) {
      overlay.querySelector('img').src = info.dataUrl;
      overlay.hidden = false;
      shownKey = info.key;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (overlay.isConnected) overlay.hidden = true;
        dismissedKey = info.key;
      }, OVERLAY_VISIBLE_MS);
    }
  }

  const dialogObserver = new MutationObserver(() => {
    document.querySelectorAll('#stopEditDialog').forEach(mountEditor);
  });
  dialogObserver.observe(document.body, { childList: true, subtree: true });

  setInterval(refreshRouteImage, 120);
  setTimeout(() => document.querySelectorAll('#stopEditDialog').forEach(mountEditor), 0);

  window.HOKUEI_STOP_IMAGES_V25 = {
    version: '25',
    maxDataUrlChars: MAX_DATA_URL_CHARS,
    displaySeconds: 3,
  };
})();