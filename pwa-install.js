(() => {
  const SW_VERSION = '105';
  const SW_RELOAD_FLAG = 'chidori-sw-reloaded';
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
    if (button.dataset.installState === 'installed') return;

    button.dataset.installState = 'installed';
    button.classList.add('is-installed');
    button.disabled = true;

    const label = button.querySelector('.home-shortcut-label');
    const installedHtml =
      '<span>ショートカット</span><span>作成済み</span>';

    if (label) {
      if (label.innerHTML !== installedHtml) {
        label.innerHTML = installedHtml;
      }
    } else if (button.textContent !== '作成済み') {
      button.textContent = '作成済み';
    }
  }

  function bindInstallButton() {
    setAppName();

    const button = document.querySelector('[data-pwa-install]');
    if (!button) return;

    if (button.dataset.installState === 'installed') return;

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

  function clearSwReloadFlagSoon() {
    setTimeout(() => {
      try {
        sessionStorage.removeItem(SW_RELOAD_FLAG);
      } catch (error) {}
    }, 3000);
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
    new MutationObserver(() => {
      const button = document.querySelector('[data-pwa-install]');
      if (!button) return;

      if (
        isInstalled() &&
        button.dataset.installState !== 'installed'
      ) {
        markInstalled(button);
        return;
      }

      if (!isInstalled() && button.dataset.bound !== '1') {
        bindInstallButton();
      }
    }).observe(appRoot, {
      childList: true,
      subtree: true,
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        if (sessionStorage.getItem(SW_RELOAD_FLAG) === '1') {
          window.__chidoriBoot && window.__chidoriBoot.mark('sw-controllerchange-skip');
          return;
        }
        sessionStorage.setItem(SW_RELOAD_FLAG, '1');
        window.__chidoriBoot && window.__chidoriBoot.mark('sw-controllerchange-reload');
        location.reload();
      } catch (error) {
        location.reload();
      }
    });

    const registerOnce = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${SW_VERSION}`, {
          updateViaCache: 'none',
        });
        try {
          window.__chidoriBoot && window.__chidoriBoot.mark('sw-registered', registration.scope);
        } catch (error) {}

        registration.update().catch((error) => {
          console.warn('SW update check failed', error);
        });
        clearSwReloadFlagSoon();
      } catch (error) {
        console.error('Service Worker登録失敗', error);
      }
    };

    if (document.readyState === 'complete') {
      registerOnce();
    } else {
      window.addEventListener('load', registerOnce, { once: true });
    }
  }

  bindInstallButton();
})();
