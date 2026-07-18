(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const DISPLAY_MS = 3000;
  const MAX_DATA_URL_CHARS = 80000;
  const mountedDialogs = new WeakSet();
  const dialogStates = new WeakMap();
  let routeOverlay = null;
  let overlayTimer = null;
  let lastVisibleKey = '';
  let telopWasVisible = false;

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

  function routeData() {
    return data?.routes?.find((route) => route.id === ROUTE_ID) || null;
  }

  function ensureImageBank(route) {
    if (!route.sharedStopImages || typeof route.sharedStopImages !== 'object') route.sharedStopImages = {};
    return route.sharedStopImages;
  }

  function sharedKeyForStop(system, stop, index = -1) {
    if (stop?.sharedStopKey) return stop.sharedStopKey;
    const actualIndex = index >= 0 ? index : system?.stops?.indexOf(stop);
    if (!system || actualIndex < 0) return '';
    const key = occurrenceKeys(system.stops)[actualIndex] || '';
    if (key) stop.sharedStopKey = key;
    return key;
  }

  function resolveEditorContext(dialog) {
    const route = data?.routes?.find((item) => item.id === document.getElementById('sRoute')?.value) || routeData();
    if (!route || route.id !== ROUTE_ID) return null;
    const mode = document.getElementById('sMode')?.value || selectedSystemCode();
    const system = route.systems?.[mode];
    if (!system) return null;
    const headerText = dialog.querySelector('.stop-edit-header p')?.textContent || '';
    const match = headerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return null;
    const index = Number(match[1]) - 1;
    const stop = system.stops?.[index];
    if (!stop) return null;
    const key = sharedKeyForStop(system, stop, index);
    return { route, system, stop, index, key };
  }

  function imageSizeLabel(dataUrl = '') {
    const bytes = Math.max(0, Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75));
    return bytes >= 1024 ? `${Math.round(bytes / 1024)}KB` : `${bytes}B`;
  }

  function fileToImage(file) {
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
    const image = await fileToImage(file);
    const initialScale = Math.min(1, 960 / image.naturalWidth, 540 / image.naturalHeight);
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let quality = 0.78;
    let dataUrl = canvasDataUrl(image, width, height, quality);

    for (let attempt = 0; attempt < 12 && dataUrl.length > MAX_DATA_URL_CHARS; attempt += 1) {
      if (quality > 0.48) quality -= 0.08;
      else {
        width = Math.max(480, Math.round(width * 0.86));
        height = Math.max(270, Math.round(height * 0.86));
      }
      dataUrl = canvasDataUrl(image, width, height, quality);
    }

    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('画像を十分に圧縮できませんでした。画像を小さく切り取ってください。');
    }
    return { dataUrl, width, height, sizeLabel: imageSizeLabel(dataUrl) };
  }

  function renderPreview(dialog, state) {
    const preview = dialog.querySelector('[data-stop-image-preview]');
    const empty = dialog.querySelector('[data-stop-image-empty]');
    const remove = dialog.querySelector('[data-stop-image-remove]');
    const status = dialog.querySelector('[data-stop-image-status]');
    const dataUrl = state.removed ? '' : state.pendingDataUrl;
    if (dataUrl) {
      preview.src = dataUrl;
      preview.hidden = false;
      empty.hidden = true;
      remove.disabled = false;
      if (!state.processing) status.textContent = `登録画像を使用します｜${imageSizeLabel(dataUrl)}｜保存すると同じ停留所の全系統へ共有`;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
      empty.hidden = false;
      remove.disabled = true;
      if (!state.processing) status.textContent = '画像を選択、ここへドロップ、またはスクリーンショットをCtrl＋Vで貼り付けできます。';
    }
  }

  async function acceptImageFile(dialog, file) {
    const state = dialogStates.get(dialog);
    if (!state || !file) return;
    const status = dialog.querySelector('[data-stop-image-status]');
    state.processing = true;
    status.textContent = '画像をスマホ向けに圧縮しています…';
    try {
      const result = await compressImage(file);
      state.pendingDataUrl = result.dataUrl;
      state.removed = false;
      state.dirty = true;
      status.textContent = `画像を準備しました｜${result.width}×${result.height}px・${result.sizeLabel}｜「変更を保存」で確定`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '画像を処理できませんでした。';
    } finally {
      state.processing = false;
      renderPreview(dialog, state);
    }
  }

  function applyPendingImage(state) {
    if (!state?.dirty || !state.context?.key) return false;
    const { route, system, stop, key } = state.context;
    const bank = ensureImageBank(route);
    if (state.removed) {
      delete bank[key];
    } else if (state.pendingDataUrl) {
      bank[key] = {
        dataUrl: state.pendingDataUrl,
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
    route.sharedStopImageVersion = '2026-07-19-stop-images-v24';
    route.sharedStopImageUpdatedAt = new Date().toISOString();
    return true;
  }

  function mountImageEditor(dialog) {
    if (mountedDialogs.has(dialog)) return;
    const context = resolveEditorContext(dialog);
    if (!context?.key) return;
    mountedDialogs.add(dialog);
    const bank = ensureImageBank(context.route);
    const current = bank[context.key]?.dataUrl || '';
    const state = {
      context,
      pendingDataUrl: current,
      removed: false,
      dirty: false,
      processing: false,
    };
    dialogStates.set(dialog, state);

    const section = document.createElement('section');
    section.className = 'stop-image-editor-v24';
    section.innerHTML = `
      <div class="stop-image-editor-heading">
        <div><strong>停留所の停止画像</strong><span>停車中の3秒間、Street Viewの代わりに表示します。同じ停留所・同じ方向の全系統で共通です。</span></div>
        <button type="button" class="secondary" data-stop-image-remove>画像を削除</button>
      </div>
      <label class="stop-image-drop-v24" tabindex="0">
        <input type="file" accept="image/*" data-stop-image-file hidden>
        <img data-stop-image-preview alt="停留所の停止画像プレビュー" hidden>
        <span data-stop-image-empty><b>画像を選択</b><br>ドラッグ＆ドロップ<br>スクリーンショットはCtrl＋V</span>
      </label>
      <p class="status stop-image-status-v24" data-stop-image-status></p>`;
    dialog.querySelector('.stop-edit-footer')?.insertAdjacentElement('beforebegin', section);

    const drop = section.querySelector('.stop-image-drop-v24');
    const input = section.querySelector('[data-stop-image-file]');
    const remove = section.querySelector('[data-stop-image-remove]');
    input.addEventListener('change', () => acceptImageFile(dialog, input.files?.[0]));
    drop.addEventListener('dragenter', (event) => { event.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('dragging');
      acceptImageFile(dialog, [...(event.dataTransfer?.files || [])].find((file) => file.type.startsWith('image/')));
    });
    remove.addEventListener('click', () => {
      state.pendingDataUrl = '';
      state.removed = true;
      state.dirty = true;
      renderPreview(dialog, state);
    });

    ['saveStopEdit', 'previousStopEdit', 'nextStopEdit'].forEach((id) => {
      dialog.querySelector(`#${id}`)?.addEventListener('click', () => {
        setTimeout(() => {
          if (!state.dirty || document.body.contains(dialog)) return;
          if (applyPendingImage(state)) save();
        }, 0);
      });
    });

    renderPreview(dialog, state);
  }

  document.addEventListener('paste', (event) => {
    const dialog = document.getElementById('stopEditDialog');
    if (!dialog || !dialogStates.has(dialog)) return;
    const file = [...(event.clipboardData?.items || [])]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    acceptImageFile(dialog, file);
  }, true);

  function stopImageForActiveRoute() {
    const route = routeData();
    const system = route?.systems?.[selectedSystemCode()];
    if (!route || !system) return null;
    const activeStops = (system.stops || []).filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    const activeButton = document.querySelector('.route-sequence-stop.active[data-guidance-stop]');
    const activeIndex = Number(activeButton?.dataset.guidanceStop);
    const stop = Number.isInteger(activeIndex) ? activeStops[activeIndex] : null;
    if (!stop) return null;
    const originalIndex = system.stops.indexOf(stop);
    const key = sharedKeyForStop(system, stop, originalIndex);
    const entry = route.sharedStopImages?.[key];
    if (!entry?.dataUrl) return null;
    return { key: `${system.code}|${key}`, dataUrl: entry.dataUrl, stop };
  }

  function ensureRouteOverlay() {
    const street = document.getElementById('street');
    if (!street) return null;
    if (routeOverlay?.isConnected && routeOverlay.parentElement === street) return routeOverlay;
    routeOverlay = document.createElement('div');
    routeOverlay.className = 'stop-image-display-v24';
    routeOverlay.hidden = true;
    routeOverlay.innerHTML = '<img alt="停留所の停止画像">';
    street.appendChild(routeOverlay);
    return routeOverlay;
  }

  function hideRouteImage(telop = null) {
    clearTimeout(overlayTimer);
    if (routeOverlay) routeOverlay.hidden = true;
    telop?.classList.remove('show');
  }

  function showRouteImage(info, telop) {
    const overlay = ensureRouteOverlay();
    if (!overlay || !info) return;
    overlay.querySelector('img').src = info.dataUrl;
    overlay.hidden = false;
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => hideRouteImage(telop), DISPLAY_MS);
  }

  function refreshRouteImage() {
    const telop = document.querySelector('.station-name-telop');
    const visible = Boolean(telop?.classList.contains('show'));
    if (!visible) {
      telopWasVisible = false;
      lastVisibleKey = '';
      if (routeOverlay) routeOverlay.hidden = true;
      return;
    }
    const info = stopImageForActiveRoute();
    if (!info) {
      telopWasVisible = true;
      lastVisibleKey = '';
      if (routeOverlay) routeOverlay.hidden = true;
      return;
    }
    if (!telopWasVisible || lastVisibleKey !== info.key) {
      lastVisibleKey = info.key;
      showRouteImage(info, telop);
    }
    telopWasVisible = true;
  }

  function refresh() {
    document.querySelectorAll('#stopEditDialog').forEach(mountImageEditor);
    refreshRouteImage();
  }

  new MutationObserver(refresh).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });

  setTimeout(refresh, 0);
  window.HOKUEI_STOP_IMAGES_V24 = {
    version: '24',
    maxDataUrlChars: MAX_DATA_URL_CHARS,
    displaySeconds: DISPLAY_MS / 1000,
  };
})();