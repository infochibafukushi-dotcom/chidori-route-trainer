(() => {
  const scripts = [
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  ];

  function showFallback(message) {
    const main = document.querySelector('.main');
    if (!main || document.getElementById('cloudLoadFallback')) return;
    const notice = document.createElement('div');
    notice.id = 'cloudLoadFallback';
    notice.className = 'cloud-sync-bar';
    notice.dataset.state = 'error';
    notice.innerHTML = `
      <div class="cloud-sync-state">
        <span class="cloud-sync-dot" aria-hidden="true"></span>
        <span class="cloud-sync-text">${message}</span>
      </div>`;
    main.prepend(notice);
  }

  function loadScript(src, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        script.remove();
        reject(new Error(`読み込み時間超過: ${src}`));
      }, timeoutMs);

      script.src = src;
      script.async = false;
      script.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`読み込み失敗: ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  async function startCloudSync() {
    try {
      for (const src of scripts) await loadScript(src);
      await loadScript('./cloud-sync.js', 5000);
    } catch (error) {
      console.error('Firebase cloud sync loader failed', error);
      showFallback('アプリは閲覧できます。クラウド同期のみ現在利用できません。');
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startCloudSync, { once: true });
  } else {
    startCloudSync();
  }
})();