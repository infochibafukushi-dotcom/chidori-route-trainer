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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureSyncBar() {
    const main = document.querySelector('.main');
    if (!main) return null;
    let bar = document.getElementById('d1SyncBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'd1SyncBar';
      bar.className = 'd1-sync-bar';
      bar.innerHTML = `
        <div class="d1-sync-state">
          <span class="d1-sync-dot" aria-hidden="true"></span>
          <span id="d1SyncText" class="d1-sync-text">共通データを確認中…</span>
        </div>
        <button type="button" id="d1Reload" class="secondary">再読込</button>`;
      main.prepend(bar);
      document.getElementById('d1Reload').onclick = () => loadRemote(true);
    }
    return bar;
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

  function mountEditorPanel() {
    const section = document.querySelector('.tabs')?.parentElement;
    if (!section || document.getElementById('d1EditorPanel')) {
      applySettingsAccess();
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
      <p class="d1-editor-help">トークンはこのブラウザだけに保存され、閲覧者には表示されません。</p>
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
      const ok = await uploadRemote(true);
      if (ok) {
        editorVerified = true;
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
  }

  async function loadRemote(force = false) {
    setSyncStatus('D1の共通データを読込中…', 'working');
    try {
      const response = await apiFetch({ method: 'GET' });
      if (!response.ok) throw new Error(`読込エラー（${response.status}）`);
      const result = await response.json();
      if (result.data && typeof result.data === 'object') {
        applyingRemote = true;
        data = clone(result.data);
        originalSave();
        render();
        applyingRemote = false;
        setSyncStatus('D1共通データを表示中', 'ok');
        if (editToken && !editorVerified) {
          editorVerified = await uploadRemote(true);
          if (page === 'settings') {
            mountEditorPanel();
            applySettingsAccess();
          }
        }
        return;
      }
      setSyncStatus('D1は空です。編集トークン登録後に現在のデータを初期保存します', 'working');
      if (editToken) {
        editorVerified = await uploadRemote(true);
        if (editorVerified) setSyncStatus('現在のデータをD1へ初期保存しました', 'ok');
      }
    } catch (error) {
      applyingRemote = false;
      console.error('D1 load failed', error);
      setSyncStatus(`${errorMessage(error)}｜端末内データを表示中`, 'error');
    }
  }

  async function uploadRemote(silent = false) {
    if (!editToken || applyingRemote) return false;
    if (!silent) setSyncStatus('D1へ保存中…', 'working');
    try {
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
        if (!silent) setSyncStatus('編集トークンが一致しません', 'error');
        return false;
      }
      if (!response.ok) throw new Error(`保存エラー（${response.status}）`);
      editorVerified = true;
      setSyncStatus('D1へ保存済み｜全端末で共有されます', 'ok');
      return true;
    } catch (error) {
      console.error('D1 save failed', error);
      if (!silent) setSyncStatus(errorMessage(error), 'error');
      return false;
    }
  }

  function scheduleUpload() {
    if (!editorVerified || applyingRemote) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => uploadRemote(false), 500);
  }

  save = function saveWithD1() {
    originalSave();
    scheduleUpload();
  };

  shell = function shellWithD1(body) {
    originalShell(body);
    ensureSyncBar();
  };

  settings = function settingsWithD1() {
    originalSettings();
    mountEditorPanel();
  };

  ensureSyncBar();
  loadRemote();
})();