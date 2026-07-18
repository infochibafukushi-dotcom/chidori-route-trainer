(() => {
  const COLLECTION = 'chidoriRouteTrainer';
  const DOCUMENT_ID = 'shared';
  const config = window.FIREBASE_CONFIG || {};
  const editorEmail = String(window.FIREBASE_EDITOR_EMAIL || '').trim().toLowerCase();
  const configured = Boolean(
    config.apiKey && config.authDomain && config.projectId && config.appId &&
    !Object.values(config).some((value) => String(value || '').includes('__FIREBASE_'))
  );

  let db = null;
  let auth = null;
  let documentRef = null;
  let applyingRemote = false;
  let saveTimer = null;
  let currentUser = null;
  let lastCloudLoadAt = 0;
  const originalSave = save;

  function cleanData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isEditor(user = currentUser) {
    if (!user?.email || !user.emailVerified) return false;
    if (!editorEmail) return true;
    return user.email.toLowerCase() === editorEmail;
  }

  function errorText(error) {
    const code = error?.code || '';
    if (code.includes('permission-denied')) return 'Firestoreの権限設定が必要です';
    if (code.includes('unauthorized-domain')) return 'FirebaseでGitHub Pagesのドメイン許可が必要です';
    if (code.includes('popup-closed')) return 'ログインを中止しました';
    return error instanceof Error ? error.message : 'クラウド同期でエラーが発生しました';
  }

  function ensureBar() {
    const main = document.querySelector('.main');
    if (!main) return null;
    let bar = document.getElementById('cloudSyncBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cloudSyncBar';
      bar.className = 'cloud-sync-bar';
      bar.innerHTML = `
        <div class="cloud-sync-state">
          <span class="cloud-sync-dot" aria-hidden="true"></span>
          <span id="cloudSyncText" class="cloud-sync-text">同期状態を確認中…</span>
        </div>
        <div class="cloud-sync-actions">
          <button type="button" id="cloudReload" class="secondary">クラウド再読込</button>
          <button type="button" id="cloudAuth" class="secondary">Googleで編集ログイン</button>
        </div>`;
      main.prepend(bar);
      document.getElementById('cloudReload').onclick = () => loadCloud(true);
      document.getElementById('cloudAuth').onclick = () => toggleAuth();
    }
    return bar;
  }

  function setStatus(text, state = '') {
    const bar = ensureBar();
    if (!bar) return;
    bar.dataset.state = state;
    const label = document.getElementById('cloudSyncText');
    if (label) label.textContent = text;
  }

  function updateAuthButton() {
    const button = document.getElementById('cloudAuth');
    if (!button) return;
    if (isEditor()) {
      button.textContent = '編集ログアウト';
      button.title = currentUser.email;
    } else {
      button.textContent = 'Googleで編集ログイン';
      button.title = editorEmail ? `${editorEmail}でログイン` : '';
    }
  }

  function applySettingsLock() {
    const body = document.getElementById('settingsBody');
    const existingNotice = document.getElementById('cloudReadonlyNotice');
    if (!body) {
      existingNotice?.remove();
      return;
    }
    const locked = configured && !isEditor();
    body.classList.toggle('cloud-readonly', locked);
    if (!locked) {
      existingNotice?.remove();
      return;
    }
    if (!existingNotice) {
      const notice = document.createElement('div');
      notice.id = 'cloudReadonlyNotice';
      notice.className = 'cloud-readonly-notice';
      notice.textContent = '閲覧は共通データです。編集する場合は上の「Googleで編集ログイン」を押してください。';
      body.insertAdjacentElement('beforebegin', notice);
    }
  }

  function refreshUi() {
    ensureBar();
    updateAuthButton();
    applySettingsLock();
  }

  async function writeCloud() {
    if (!configured || !documentRef || !isEditor() || applyingRemote) return;
    clearTimeout(saveTimer);
    setStatus('クラウドへ保存中…', 'working');
    try {
      await documentRef.set({
        appData: cleanData(data),
        schemaVersion: 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.email,
      }, { merge: true });
      setStatus(`クラウド同期済み｜${currentUser.email}`, 'ok');
    } catch (error) {
      console.error('Firestore save failed', error);
      setStatus(errorText(error), 'error');
    }
  }

  function scheduleCloudSave() {
    if (!configured || !isEditor() || applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeCloud, 450);
  }

  save = function saveWithCloudSync() {
    originalSave();
    scheduleCloudSave();
  };

  async function loadCloud(force = false) {
    if (!configured || !documentRef) {
      setStatus('端末内保存中｜Firebase設定が未完了です', 'error');
      return;
    }
    if (!force && Date.now() - lastCloudLoadAt < 1500) return;
    lastCloudLoadAt = Date.now();
    setStatus('クラウドデータを読込中…', 'working');
    try {
      const snapshot = await documentRef.get();
      const remote = snapshot.data()?.appData;
      if (remote && typeof remote === 'object') {
        applyingRemote = true;
        data = cleanData(remote);
        originalSave();
        render();
        applyingRemote = false;
        setStatus(
          isEditor() ? `クラウド同期済み｜${currentUser.email}` : 'クラウド共通データを表示中',
          'ok',
        );
        refreshUi();
        return;
      }
      if (isEditor()) {
        setStatus('初期データをクラウドへ登録中…', 'working');
        await writeCloud();
      } else {
        setStatus('クラウド初期データが未登録です｜編集ログインが必要です', 'error');
      }
    } catch (error) {
      applyingRemote = false;
      console.error('Firestore load failed', error);
      setStatus(errorText(error), 'error');
    }
  }

  async function toggleAuth() {
    if (!configured || !auth) {
      setStatus('Firebase設定が未完了です', 'error');
      return;
    }
    try {
      if (currentUser) {
        await auth.signOut();
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await auth.signInWithPopup(provider);
      if (!isEditor(result.user)) {
        const signedEmail = result.user?.email || 'このアカウント';
        await auth.signOut();
        throw new Error(`${signedEmail}には編集権限がありません`);
      }
    } catch (error) {
      setStatus(errorText(error), 'error');
    }
  }

  function initialize() {
    ensureBar();
    if (!configured || !window.firebase) {
      setStatus('端末内保存中｜Firebase設定が未完了です', 'error');
      applySettingsLock();
      return;
    }
    try {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      db = app.firestore();
      auth = app.auth();
      documentRef = db.collection(COLLECTION).doc(DOCUMENT_ID);
      auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        refreshUi();
        await loadCloud(true);
      });
    } catch (error) {
      console.error('Firebase initialize failed', error);
      setStatus(errorText(error), 'error');
    }
  }

  const appObserver = new MutationObserver(() => refreshUi());
  appObserver.observe(document.getElementById('app'), { childList: true, subtree: true });
  initialize();
})();