(() => {
  const ROUTE_ID = 'route-1';
  const SYSTEM_KEY = 'chidori-hokuei-system-v12';
  const MAX_DATA_URL_CHARS = 70000;
  const DISPLAY_MS = 3000;
  const LOAD_TIMEOUT_MS = 5000;
  const mountedDialogs = new WeakSet();
  const states = new WeakMap();
  const prefetchCache = new Map();

  let routeOverlay = null;
  let shownKey = '';
  let dismissedKey = '';
  let hideTimer = 0;
  let loadWatch = 0;
  let dwellRemainingMs = 0;
  let dwellPaused = false;
  let dwellDeadline = 0;
  let presentToken = 0;

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
    if (key && stop) stop.sharedStopKey = key;
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

  function readImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('画像形式を確認してください。'));
      image.onload = () => resolve(image);
      image.src = src;
    });
  }

  async function readOrientedSource(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) {
        /* fallback below */
      }
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    return readImageElement(dataUrl);
  }

  function sourceSize(source) {
    return {
      width: source.naturalWidth || source.width || 1,
      height: source.naturalHeight || source.height || 1,
    };
  }

  function canvasDataUrl(source, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/webp', quality);
    if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', quality);
    return result;
  }

  async function compressImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
    if (!/image\/(jpeg|jpg|png|webp)/i.test(file.type) && file.type !== 'image/jpg') {
      // allow generic image/* from camera; still try
    }
    const source = await readOrientedSource(file);
    const size = sourceSize(source);
    const scale = Math.min(1, 1280 / size.width, 720 / size.height);
    let width = Math.max(1, Math.round(size.width * scale));
    let height = Math.max(1, Math.round(size.height * scale));
    let quality = 0.78;
    let dataUrl = canvasDataUrl(source, width, height, quality);

    for (let attempt = 0; attempt < 14 && dataUrl.length > MAX_DATA_URL_CHARS; attempt += 1) {
      if (quality > 0.42) quality -= 0.07;
      else {
        width = Math.max(420, Math.round(width * 0.86));
        height = Math.max(236, Math.round(height * 0.86));
      }
      dataUrl = canvasDataUrl(source, width, height, quality);
    }
    if (typeof source.close === 'function') source.close();
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('画像を十分に圧縮できませんでした。別の写真を試してください。');
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
      if (!state.processing) status.textContent = 'JPEG / PNG / WebP を選択・ドロップ、または Ctrl＋V で貼り付けできます。';
    }
  }

  async function acceptFile(dialog, file) {
    const state = states.get(dialog);
    if (!state || !file || state.processing) return;
    const status = dialog.querySelector('[data-stop-image-status]');
    state.processing = true;
    status.textContent = '画像を向き補正・圧縮しています…';
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
    route.sharedStopImageVersion = '2026-07-19-stop-images-v25c';
    route.sharedStopImageUpdatedAt = new Date().toISOString();
    state.dirty = false;
    prefetchCache.delete(key);
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
        <div><strong>停留所の停止画像</strong><span>停車時に Street View 領域へ自動表示します。停留所名は自動で重ねます。同じ停留所・同じ方向の全系統で共通です。</span></div>
        <button type="button" class="secondary" data-stop-image-remove>画像を削除</button>
      </div>
      <label class="stop-image-drop-v25" tabindex="0">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" data-stop-image-file hidden>
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

  function resolveImage(stop, system, index) {
    const route = getRoute();
    if (!route || !stop) return null;
    const sys = system || route.systems?.[selectedSystemCode()];
    if (!sys) return null;
    const stopIndex = Number.isInteger(index) ? index : sys.stops.indexOf(stop);
    const key = sharedKey(sys, stop, stopIndex >= 0 ? stopIndex : 0);
    if (!key) return null;
    const entry = ensureImageBank(route)[key];
    if (!entry?.dataUrl) return null;
    return {
      key,
      displayKey: `${sys.code || selectedSystemCode()}|${key}`,
      dataUrl: entry.dataUrl,
      stop,
      system: sys,
    };
  }

  function ensureOverlay() {
    const street = document.getElementById('street');
    if (!street) return null;
    if (routeOverlay?.isConnected && routeOverlay.parentElement === street) return routeOverlay;
    routeOverlay = document.createElement('div');
    routeOverlay.className = 'stop-image-display-v25';
    routeOverlay.hidden = true;
    routeOverlay.setAttribute('aria-hidden', 'true');
    routeOverlay.innerHTML = '<img alt="停留所の停止画像">';
    street.appendChild(routeOverlay);
    return routeOverlay;
  }

  function clearDwellTimer() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    clearTimeout(loadWatch);
    loadWatch = 0;
    dwellDeadline = 0;
    dwellRemainingMs = 0;
    dwellPaused = false;
  }

  function hideOverlay() {
    clearDwellTimer();
    presentToken += 1;
    if (routeOverlay?.isConnected) {
      routeOverlay.hidden = true;
      const img = routeOverlay.querySelector('img');
      if (img) img.removeAttribute('src');
    }
    shownKey = '';
  }

  function prefetchImage(stop, system, index) {
    const info = resolveImage(stop, system, index);
    if (!info?.dataUrl) return;
    if (prefetchCache.has(info.key)) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => prefetchCache.set(info.key, true);
    image.onerror = () => prefetchCache.delete(info.key);
    prefetchCache.set(info.key, false);
    image.src = info.dataUrl;
  }

  function waitForImageElement(img, dataUrl, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      if (!dataUrl) {
        finish(false);
        return;
      }
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      if (img.src === dataUrl && img.complete && img.naturalWidth > 0) {
        finish(true);
        return;
      }
      img.src = dataUrl;
    });
  }

  /**
   * 停車画像を Street View 領域へ表示し、読込完了後 DISPLAY_MS 表示する。
   * 画像が無い／読込失敗時は usedImage:false（Street View フォールバック）。
   */
  async function presentAtStop(stop, system, index, options = {}) {
    const timeoutMs = Number.isFinite(options.loadTimeoutMs) ? options.loadTimeoutMs : LOAD_TIMEOUT_MS;
    const token = ++presentToken;
    clearDwellTimer();
    dismissedKey = '';

    const info = resolveImage(stop, system, index);
    if (!info) {
      hideOverlay();
      return { usedImage: false, durationMs: DISPLAY_MS };
    }

    const overlay = ensureOverlay();
    if (!overlay) return { usedImage: false, durationMs: DISPLAY_MS };
    const img = overlay.querySelector('img');
    overlay.hidden = false;
    shownKey = info.displayKey;

    const loaded = await waitForImageElement(img, info.dataUrl, timeoutMs);
    if (token !== presentToken) return { usedImage: false, durationMs: DISPLAY_MS, cancelled: true };

    if (!loaded) {
      hideOverlay();
      return { usedImage: false, durationMs: DISPLAY_MS, loadFailed: true };
    }

    return { usedImage: true, durationMs: DISPLAY_MS, key: info.displayKey };
  }

  function markDismissed(displayKey) {
    if (displayKey) dismissedKey = displayKey;
    if (routeOverlay?.isConnected) routeOverlay.hidden = true;
    shownKey = '';
  }

  function pauseDwell() {
    if (!dwellDeadline || dwellPaused) return;
    dwellRemainingMs = Math.max(0, dwellDeadline - performance.now());
    dwellPaused = true;
    clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function resumeDwell(onDone) {
    if (!dwellPaused) return;
    dwellPaused = false;
    const remaining = dwellRemainingMs || DISPLAY_MS;
    dwellDeadline = performance.now() + remaining;
    hideTimer = setTimeout(() => {
      markDismissed(shownKey || dismissedKey);
      if (typeof onDone === 'function') onDone();
    }, remaining);
  }

  function resetSession() {
    hideOverlay();
    dismissedKey = '';
    prefetchCache.clear();
  }

  // 旧ポーリング互換：テロップ非表示時はオーバーレイも消す
  function refreshRouteImage() {
    const telop = document.querySelector('.station-name-telop.show');
    if (!telop && routeOverlay && !routeOverlay.hidden && !dwellDeadline && !dwellPaused) {
      hideOverlay();
    }
  }

  const dialogObserver = new MutationObserver(() => {
    document.querySelectorAll('#stopEditDialog').forEach(mountEditor);
  });
  dialogObserver.observe(document.body, { childList: true, subtree: true });

  setInterval(refreshRouteImage, 250);
  setTimeout(() => document.querySelectorAll('#stopEditDialog').forEach(mountEditor), 0);

  window.HOKUEI_STOP_IMAGES_V25 = {
    version: '25c-fullpanel',
    displayMs: DISPLAY_MS,
    loadTimeoutMs: LOAD_TIMEOUT_MS,
    maxDataUrlChars: MAX_DATA_URL_CHARS,
    resolveImage,
    presentAtStop,
    prefetchImage,
    hideOverlay,
    markDismissed,
    pauseDwell,
    resumeDwell,
    resetSession,
    sharedKey,
  };
})();
