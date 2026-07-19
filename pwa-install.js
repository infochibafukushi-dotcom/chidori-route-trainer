(() => {
  const SW_VERSION = '28';
  const RELOAD_KEY = `chidori-sw-reloaded-${SW_VERSION}`;
  let installPrompt = null;

  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function setAppName() {
    const heading = document.querySelector('.header h1');
    if (heading && heading.textContent !== '千鳥路線図') heading.textContent = '千鳥路線図';
  }

  function installButton() {
    setAppName();
    const home = document.querySelector('.home');
    if (!home || home.querySelector('[data-pwa-install]') || isInstalled()) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu';
    button.dataset.pwaInstall = '';
    button.innerHTML = '<strong>千鳥路線図をインストール</strong><span>バスのアイコンでホーム画面に追加</span>';
    button.onclick = async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        button.remove();
        return;
      }
      alert('Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」を押してください。');
    };
    home.prepend(button);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.querySelector('[data-pwa-install]')?.remove();
  });

  new MutationObserver(installButton).observe(document.getElementById('app'), {
    childList: true,
    subtree: true,
  });

  if ('serviceWorker' in navigator) {
    let controllerChanged = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controllerChanged) return;
      controllerChanged = true;
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
      location.reload();
    });

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${SW_VERSION}`, {
          updateViaCache: 'none',
        });
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        console.error('Service Worker登録失敗', error);
      }
    });
  }

  installButton();
})();
