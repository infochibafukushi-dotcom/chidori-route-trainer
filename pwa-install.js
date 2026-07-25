(() => {
  const SW_VERSION = '77';
  const RELOAD_KEY = `chidori-sw-reloaded-${SW_VERSION}`;
  let installPrompt = null;

  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  function setAppName() {
    const heading = document.querySelector('.header h1');
    if (heading && heading.textContent !== '千鳥路線図' && document.querySelector('.app--home')) {
      heading.textContent = '千鳥路線図';
    }
  }

  function markInstalled(button) {
    if (!button) return;
    button.classList.add('is-installed');
    button.disabled = true;
    const label = button.querySelector('.home-shortcut-label');
    if (label) {
      label.innerHTML = '<span>ショートカット</span><span>作成済み</span>';
    } else {
      button.textContent = '作成済み';
    }
  }

  function bindInstallButton() {
    setAppName();
    const button = document.querySelector('[data-pwa-install]');
    if (!button) return;

    if (isInstalled()) {
      markInstalled(button);
      return;
    }

    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';

    button.addEventListener('click', async () => {
      if (isInstalled()) {
        markInstalled(button);
        return;
      }

      if (installPrompt) {
        installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        installPrompt = null;
        if (choice?.outcome === 'accepted') {
          markInstalled(button);
        }
        return;
      }

      if (isIos()) {
        alert('Safariの共有ボタンから「ホーム画面に追加」を選んでください。');
        return;
      }

      alert('ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を押してください。');
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    bindInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    markInstalled(document.querySelector('[data-pwa-install]'));
  });

  const appRoot = document.getElementById('app');
  if (appRoot) {
    new MutationObserver(bindInstallButton).observe(appRoot, {
      childList: true,
      subtree: true,
    });
  }

  if ('serviceWorker' in navigator) {
    let controllerChanged = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controllerChanged) return;
      controllerChanged = true;
      try {
        if (sessionStorage.getItem(RELOAD_KEY)) return;
        sessionStorage.setItem(RELOAD_KEY, '1');
      } catch (error) {
        console.warn('SW reload key unavailable', error);
      }
      location.reload();
    });

    const registerAndUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${SW_VERSION}`, {
          updateViaCache: 'none',
        });
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      } catch (error) {
        console.error('Service Worker登録失敗', error);
      }
    };

    window.addEventListener('load', registerAndUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registerAndUpdate();
    });
  }

  bindInstallButton();
})();
