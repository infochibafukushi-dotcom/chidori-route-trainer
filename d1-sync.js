(() => {
  const API_URL = 'https://chidori-route-api.info-chibafukushi.workers.dev/data';
  const TOKEN_KEY = 'chidori-route-edit-token-v1';
  const originalSave = save;
  const originalShell = shell;
  const originalSettings = settings;

  let editToken = localStorage.getItem(TOKEN_KEY) || '';
  let editorVerified = false;
  let applyingRemote = false;
  let uploadTimer = null;
  let uploadInFlight = null;
  // ローカル変更世代。遅延GETが編集中・保存中の data を巻き戻さないためのガード。
  // 注意: カード順変更でも全データをPUTしているため、複数端末競合の根本解決には
  // 部分更新APIまたはrevision制御が必要。
  let localMutationVersion = 0;
  let hasUnsharedLocalData = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function bumpLocalMutation() {
    localMutationVersion += 1;
  }

  window.__chidoriIsEditorVerified = () => editorVerified;
  window.__chidoriGetLocalMutationVersion = () => localMutationVersion;
  window.__chidoriHasUnsharedLocalData = () => hasUnsharedLocalData;

  function ensureSyncBar() {
    // 利用者向け画面では同期バーを出さない（D1取得・保存処理自体は維持）
    document.getElementById('d1SyncBar')?.remove();
    return null;
  }

  function setSyncStatus(text, state = '') {
    const bar = ensureSyncBar();
    if (!bar) return;
    bar.dataset.state = state;
    const target = document.getElementById('d1SyncText');
    if (target) target.textContent = text;
  }

  function errorMessage(error) {
    if (error?.name === 'AbortError') return '通信が時間切れになりました';
    return error instanceof Error ? error.message : '共通データへ接続できませんでした';
  }

  async function apiFetch(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      return await fetch(API_URL, {
        cache: 'no-store',
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function applySettingsAccess() {
    const body = document.getElementById('settingsBody');
    document.getElementById('d1LockNotice')?.remove();
    if (!body) return;
    body.classList.toggle('d1-settings-locked', !editorVerified);
    if (!editorVerified) {
      const notice = document.createElement('div');
      notice.id = 'd1LockNotice';
      notice.className = 'd1-lock-notice';
      notice.textContent = '閲覧専用です。停留所や設定を変更するには、編集トークンを登録してください。';
      body.insertAdjacentElement('beforebegin', notice);
    }
  }

  function updateEditorTokenStatus() {
    const status = document.getElementById('d1EditorStatus');
    if (!status) return;
    if (editorVerified) return;
    if (editToken) {
      status.textContent =
        '編集トークンは保存されていますが、この起動では未確認です。「登録して確認」を押してください。';
    }
  }

  function migrateHomeCardOrderIfNeeded() {
    if (!editorVerified || Array.isArray(data?.uiSettings?.homeCardOrder)) return false;
    const migratedOrder = loadHomeCardOrder();
    data.uiSettings = data.uiSettings || {};
    data.uiSettings.homeCardOrder = migratedOrder;
    try {
      localStorage.setItem(HOME_CARD_ORDER_STORAGE_KEY, JSON.stringify(migratedOrder));
      localStorage.removeItem(HOME_CARD_ORDER_LEGACY_KEY);
    } catch (error) {
      console.warn('ホームカード順の端末内バックアップに失敗しました', error);
    }
    currentHomeCardOrder = migratedOrder.slice();
    save();
    return true;
  }

  function mountEditorPanel() {
    const section = document.querySelector('.tabs')?.parentElement;
    if (!section || document.getElementById('d1EditorPanel')) {
      applySettingsAccess();
      updateEditorTokenStatus();
      return;
    }
    const panel = document.createElement('div');
    panel.id = 'd1EditorPanel';
    panel.className = 'd1-editor-panel';
    panel.innerHTML = `
      <h3>共通データの編集権限</h3>
      <div class="d1-editor-row">
        <label>編集トークン
          <input id="d1EditToken" type="password" autocomplete="off" placeholder="Cloudflareで設定したEDIT_TOKEN">
        </label>
        <div class="d1-editor-actions">
          <button type="button" id="d1TokenSave" class="primary">登録して確認</button>
          <button type="button" id="d1TokenClear" class="secondary">解除</button>
        </div>
      </div>
      <p class="d1-editor-help">トークンはこのブラウザだけに保存され、閲覧者には表示されません。起動時の自動確認は行いません。</p>
      <p id="d1EditorStatus" class="d1-editor-status"></p>`;
    section.insertBefore(panel, section.querySelector('.tabs'));

    const input = document.getElementById('d1EditToken');
    if (editToken) input.value = editToken;

    document.getElementById('d1TokenSave').onclick = async () => {
      const token = input.value.trim();
      const status = document.getElementById('d1EditorStatus');
      if (!token) {
        status.textContent = '編集トークンを入力してください。';
        return;
      }
      editToken = token;
      localStorage.setItem(TOKEN_KEY, token);
      status.textContent = 'トークンを確認しています…';
      const result = await uploadRemoteDetailed(true);
      if (result.ok) {
        editorVerified = true;
        migrateHomeCardOrderIfNeeded();
        status.textContent = '編集可能です。現在のデータをD1へ保存しました。';
      } else {
        editorVerified = false;
        status.textContent = 'トークンが一致しないか、APIへ接続できません。';
      }
      applySettingsAccess();
    };

    document.getElementById('d1TokenClear').onclick = () => {
      editToken = '';
      editorVerified = false;
      localStorage.removeItem(TOKEN_KEY);
      input.value = '';
      document.getElementById('d1EditorStatus').textContent = '編集権限を解除しました。';
      applySettingsAccess();
    };

    applySettingsAccess();
    updateEditorTokenStatus();
  }

  function shouldSkipRemoteApply(versionAtLoadStart) {
    if (versionAtLoadStart !== localMutationVersion) return true;
    if (hasUnsharedLocalData) return true;
    if (uploadTimer) return true;
    if (uploadInFlight) return true;
    if (page === 'settings' && settingsTab === 'home-order' && homeCardOrderDraft) {
      const committed = loadHomeCardOrder();
      if (JSON.stringify(homeCardOrderDraft) !== JSON.stringify(committed)) return true;
    }
    return false;
  }

  async function loadRemote(force = false) {
    setSyncStatus('D1の共通データを読込中…', 'working');
    const versionAtLoadStart = localMutationVersion;
    try {
      const response = await apiFetch({ method: 'GET' });
      if (!response.ok) throw new Error(`読込エラー（${response.status}）`);
      const result = await response.json();
      if (result.data && typeof result.data === 'object') {
        if (shouldSkipRemoteApply(versionAtLoadStart)) {
          console.info('[chidori] skipped stale D1 response because local data changed');
          setSyncStatus('端末内の最新データを優先中', 'working');
          if (page === 'settings') {
            mountEditorPanel();
            applySettingsAccess();
          }
          return;
        }
        applyingRemote = true;
        data = clone(result.data);
        originalSave();
        const studyPopOpen =
          page === 'materials' &&
          window.__chidoriStudyMaterialsPop &&
          typeof window.__chidoriStudyMaterialsPop.isOpen === 'function' &&
          window.__chidoriStudyMaterialsPop.isOpen();
        if (studyPopOpen) {
          console.info('[chidori] D1 data applied while study material POP is open');
        }
        // home() は loadHomeCardOrder() 経由で data.uiSettings.homeCardOrder を反映
        render();
        applyingRemote = false;
        setSyncStatus('D1共通データを表示中', 'ok');
        // 起動時の自動PUTは行わない（無効トークンによる401・データ上書きを防ぐ）
        // 編集権限は設定画面の「登録して確認」でのみ確立する
        if (page === 'settings') {
          mountEditorPanel();
          applySettingsAccess();
        }
        return;
      }
      setSyncStatus('D1は空です。編集トークン登録後に現在のデータを初期保存します', 'working');
      // 空の場合も起動時自動PUTはしない
    } catch (error) {
      applyingRemote = false;
      console.error('D1 load failed', error);
      setSyncStatus(`${errorMessage(error)}｜端末内データを表示中`, 'error');
    }
  }

  async function uploadRemoteDetailed(silent = false) {
    if (!editToken) {
      return {
        ok: false,
        reason: 'unauthorized',
        message: '編集トークンが未設定です',
      };
    }
    if (applyingRemote) {
      return {
        ok: false,
        reason: 'conflict',
        message: 'D1データの反映中のため保存できません',
      };
    }
    if (!silent) setSyncStatus('D1へ保存中…', 'working');

    const run = async () => {
      try {
        // カード順変更でも routes / studyMaterialsOrder 等を含む全データをPUTしている。
        // 複数端末競合の根本解決には部分更新APIまたはrevision制御が必要。
        const response = await apiFetch({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${editToken}`,
          },
          body: JSON.stringify({ data: clone(data) }),
        });
        if (response.status === 401) {
          editorVerified = false;
          editToken = '';
          hasUnsharedLocalData = true;
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch (error) {
            console.warn('無効な編集トークンを削除できませんでした', error);
          }
          if (!silent) {
            setSyncStatus(
              '編集トークンが無効です。設定画面から再登録してください',
              'error'
            );
          }
          if (page === 'settings') {
            const input = document.getElementById('d1EditToken');
            if (input) input.value = '';
            const status = document.getElementById('d1EditorStatus');
            if (status) status.textContent = '編集トークンが無効です。再登録してください。';
            applySettingsAccess();
          }
          return {
            ok: false,
            reason: 'unauthorized',
            message: '編集トークンが無効です',
          };
        }
        if (!response.ok) {
          hasUnsharedLocalData = true;
          throw new Error(`保存エラー（${response.status}）`);
        }
        editorVerified = true;
        hasUnsharedLocalData = false;
        setSyncStatus('D1へ保存済み｜全端末で共有されます', 'ok');
        return { ok: true };
      } catch (error) {
        console.error('D1 save failed', error);
        hasUnsharedLocalData = true;
        const message = errorMessage(error);
        if (!silent) setSyncStatus(message, 'error');
        const reason = error?.name === 'AbortError' ? 'network' : 'unknown';
        return { ok: false, reason, message };
      }
    };

    if (uploadInFlight) {
      return uploadInFlight;
    }
    uploadInFlight = run().finally(() => {
      uploadInFlight = null;
    });
    return uploadInFlight;
  }

  async function uploadRemote(silent = false) {
    const result = await uploadRemoteDetailed(silent);
    return !!result.ok;
  }

  function scheduleUpload() {
    if (!editorVerified || applyingRemote) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => {
      uploadTimer = null;
      uploadRemote(false);
    }, 500);
  }

  window.__chidoriFlushD1Save = async function __chidoriFlushD1Save() {
    clearTimeout(uploadTimer);
    uploadTimer = null;
    return uploadRemoteDetailed(false);
  };

  save = function saveWithD1() {
    bumpLocalMutation();
    hasUnsharedLocalData = true;
    originalSave();
    scheduleUpload();
  };

  shell = function shellWithD1(body, backTo) {
    originalShell(body, backTo);
    ensureSyncBar();
  };

  settings = function settingsWithD1() {
    originalSettings();
    mountEditorPanel();
  };

  ensureSyncBar();
  if (window.__chidoriDeferD1) {
    window.__chidoriStartD1 = () => {
      if (window.__chidoriD1Started) return;
      window.__chidoriD1Started = true;
      loadRemote();
    };
  } else {
    loadRemote();
  }
})();
