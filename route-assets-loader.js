/**
 * On-demand per-route asset loader.
 * Never auto-loads on home. Fail-safe timeouts. No swallowed rejections.
 */
(() => {
  const LOAD_TIMEOUT_MS = 5000;
  const loadedCss = new Map();
  const loadedJs = new Map();
  const packReady = new Map();
  const packInflight = new Map();

  const SHARED = {
    css: ['./stop-editor-v8.css?v=32'],
    js: []
  };

  const PACKS = {
    'route-1': {
      css: [
        './hokuei-route.css?v=33',
        './hokuei-authoritative-v12.css?v=32',
        './hokuei-manual-override-v13.css?v=33',
        './hokuei-driving-v14.css?v=32',
        './hokuei-guidance-v22.css?v=34',
        './hokuei-stop-images-v25.css?v=32'
      ],
      js: [
        './hokuei-authoritative-v12.js?v=33',
        './hokuei-manual-override-v13.js?v=33',
        './hokuei-shared-coordinates-v15.js?v=32',
        './hokuei-no-uturn-v17.js?v=74',
        './imagawa-directions-compat-v2.js?v=56',
        './hokuei-streetview-stops-v26.js?v=32',
        './hokuei-guidance-v22.js?v=57',
        './hokuei-stop-images-v25.js?v=32'
      ]
    },
    'route-2': {
      css: [],
      js: [
        './imagawa-directions-compat-v2.js?v=56',
        './imagawa-urayasu-maihama-path-v1o.js?v=56',
        './imagawa-chidori-garage-path-v1.js?v=58',
        './imagawa-route-v1.js?v=58',
        './imagawa-path-policy-v3.js?v=56'
      ]
    },
    'route-3': {
      css: ['./urayasu-higashi-danchi-stop-images-v1.css?v=63'],
      js: [
        './urayasu-higashi-danchi-platforms-v1.js?v=63',
        './urayasu-higashi-danchi-path-v1.js?v=63',
        './urayasu-higashi-danchi-path-policy-v1.js?v=63',
        './urayasu-higashi-danchi-route-v1.js?v=63'
      ]
    },
    'route-4': {
      css: ['./tomioka-stop-images-v1.css?v=65'],
      js: [
        './tomioka-platforms-v1.js?v=65',
        './tomioka-path-v1.js?v=65',
        './tomioka-path-policy-v1.js?v=65',
        './tomioka-stop-images-v1.js?v=65',
        './tomioka-route-v1.js?v=65'
      ]
    },
    'route-5': {
      css: ['./horie-stop-images-v1.css?v=66'],
      js: [
        './horie-platforms-v1.js?v=66',
        './horie-path-v1.js?v=66',
        './horie-path-policy-v1.js?v=66',
        './horie-stop-images-v1.js?v=66',
        './horie-route-v1.js?v=66'
      ]
    },
    'route-6': {
      css: ['./shiyakusho-stop-images-v1.css?v=67'],
      js: [
        './shiyakusho-platforms-v1.js?v=67',
        './shiyakusho-path-v1.js?v=67',
        './shiyakusho-path-policy-v1.js?v=67',
        './shiyakusho-stop-images-v1.js?v=67',
        './shiyakusho-route-v1.js?v=67'
      ]
    },
    'route-9': {
      css: ['./maihama-line-stop-images-v1.css?v=69'],
      js: [
        './maihama-line-platforms-v1.js?v=69',
        './maihama-line-path-v1.js?v=69',
        './maihama-line-path-policy-v1.js?v=69',
        './maihama-line-stop-images-v1.js?v=69',
        './maihama-line-route-v1.js?v=69'
      ]
    },
    'route-10': {
      css: ['./takasu-line-stop-images-v1.css?v=72'],
      js: [
        './takasu-line-platforms-v1.js?v=72',
        './takasu-line-path-v1.js?v=72',
        './takasu-line-path-policy-v1.js?v=72',
        './takasu-line-stop-images-v1.js?v=72',
        './takasu-line-route-v1.js?v=72'
      ]
    },
    'route-11': {
      css: ['./symbol-road-line-stop-images-v1.css?v=73'],
      js: [
        './symbol-road-line-platforms-v1.js?v=73',
        './symbol-road-line-path-v1.js?v=73',
        './symbol-road-line-path-policy-v1.js?v=73',
        './symbol-road-line-stop-images-v1.js?v=73',
        './symbol-road-line-route-v1.js?v=73'
      ]
    },
    'route-12': {
      css: ['./maihama-resort-line-stop-images-v1.css?v=74'],
      js: [
        './maihama-resort-line-platforms-v1.js?v=74',
        './maihama-resort-line-path-v1.js?v=74',
        './maihama-resort-line-path-policy-v1.js?v=74',
        './maihama-resort-line-stop-images-v1.js?v=74',
        './maihama-resort-line-route-v1.js?v=74'
      ]
    },
    'route-14': {
      css: ['./benten-tomioka-line-stop-images-v1.css?v=106'],
      js: [
        './benten-tomioka-line-platforms-v1.js?v=106',
        './benten-tomioka-line-path-v1.js?v=106',
        './benten-tomioka-line-path-policy-v1.js?v=106',
        './benten-tomioka-line-stop-images-v1.js?v=106',
        './benten-tomioka-line-route-v1.js?v=106'
      ]
    },
    'route-15': {
      css: ['./shione-no-machi-line-stop-images-v1.css?v=107'],
      js: [
        './shione-no-machi-line-platforms-v1.js?v=107',
        './shione-no-machi-line-path-v1.js?v=107',
        './shione-no-machi-line-path-policy-v1.js?v=107',
        './shione-no-machi-line-stop-images-v1.js?v=107',
        './shione-no-machi-line-route-v1.js?v=107'
      ]
    },
    'route-16': {
      css: ['./hinode-line-stop-images-v1.css?v=108'],
      js: [
        './hinode-line-platforms-v1.js?v=108',
        './hinode-line-path-v1.js?v=108',
        './hinode-line-path-policy-v1.js?v=108',
        './hinode-line-stop-images-v1.js?v=108',
        './hinode-line-route-v1.js?v=108'
      ]
    },
    // route-17 は route-16 と同じ「日の出線」だが別系統。資産名・グローバル名とも別系統で分離する。
    'route-17': {
      css: ['./hinode-line-17-stop-images-v1.css?v=109'],
      js: [
        './hinode-line-17-platforms-v1.js?v=109',
        './hinode-line-17-path-v1.js?v=109',
        './hinode-line-17-path-policy-v1.js?v=109',
        './hinode-line-17-stop-images-v1.js?v=109',
        './hinode-line-17-route-v1.js?v=109'
      ]
    },
    // route-18 明海・高洲線。新浦安駅のりばEと高洲海浜公園のりば03を route-15 と共有するが別系統。
    // 資産名・グローバル名とも AKEMI_TAKASU_LINE_* で分離する。
    'route-18': {
      css: ['./akemi-takasu-line-stop-images-v1.css?v=110'],
      js: [
        './akemi-takasu-line-platforms-v1.js?v=110',
        './akemi-takasu-line-path-v1.js?v=110',
        './akemi-takasu-line-path-policy-v1.js?v=110',
        './akemi-takasu-line-stop-images-v1.js?v=110',
        './akemi-takasu-line-route-v1.js?v=110'
      ]
    }
  };

  if (typeof stopEditor === 'function') {
    window.__chidoriBaseStopEditor = stopEditor;
  }
  window.__chidoriStopEditors = window.__chidoriStopEditors || {
    base: window.__chidoriBaseStopEditor
  };

  function mark(name, extra) {
    try {
      window.__chidoriBoot && window.__chidoriBoot.mark(name, extra);
    } catch (e) {}
  }

  function loadCss(href) {
    if (loadedCss.has(href)) return loadedCss.get(href);
    const promise = new Promise((resolve, reject) => {
      try {
        const existing = document.querySelector('link[data-chidori-href="' + href + '"]');
        if (existing && existing.dataset.chidoriLoaded === '1') {
          resolve();
          return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-chidori-href', href);
        const timer = setTimeout(() => {
          link.onload = link.onerror = null;
          if (link.parentNode) link.parentNode.removeChild(link);
          reject(new Error('CSS timeout: ' + href));
        }, LOAD_TIMEOUT_MS);
        link.onload = () => {
          clearTimeout(timer);
          link.dataset.chidoriLoaded = '1';
          resolve();
        };
        link.onerror = () => {
          clearTimeout(timer);
          if (link.parentNode) link.parentNode.removeChild(link);
          reject(new Error('CSS failed: ' + href));
        };
        document.head.appendChild(link);
      } catch (error) {
        reject(error);
      }
    });
    loadedCss.set(href, promise);
    promise.catch(() => {
      loadedCss.delete(href);
    });
    return promise;
  }

  function loadJs(src) {
    if (loadedJs.has(src)) return loadedJs.get(src);
    const promise = new Promise((resolve, reject) => {
      try {
        const existing = document.querySelector('script[data-chidori-src="' + src + '"]');
        if (existing && existing.dataset.chidoriLoaded === '1') {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.setAttribute('data-chidori-src', src);
        const timer = setTimeout(() => {
          script.onload = script.onerror = null;
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('JS timeout: ' + src));
        }, LOAD_TIMEOUT_MS);
        script.onload = () => {
          clearTimeout(timer);
          script.dataset.chidoriLoaded = '1';
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('JS failed: ' + src));
        };
        document.body.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
    loadedJs.set(src, promise);
    promise.catch(() => {
      loadedJs.delete(src);
    });
    return promise;
  }

  async function loadAssetGroup(group) {
    for (let i = 0; i < group.css.length; i += 1) {
      await loadCss(group.css[i]);
    }
    for (let i = 0; i < group.js.length; i += 1) {
      await loadJs(group.js[i]);
    }
  }

  async function ensurePack(packId, group) {
    if (packReady.get(packId)) return;
    if (packInflight.has(packId)) return packInflight.get(packId);
    const task = (async () => {
      mark('pack-load-start', packId);
      await loadAssetGroup(group);
      packReady.set(packId, true);
      mark('pack-load-ready', packId);
    })();
    packInflight.set(packId, task);
    try {
      await task;
    } catch (error) {
      packReady.delete(packId);
      throw error;
    } finally {
      packInflight.delete(packId);
    }
  }

  function installStopEditorBridge() {
    stopEditor = function stopEditorRouteBridge() {
      const editors = window.__chidoriStopEditors || {};
      const id = routeState && routeState.routeId;
      if (id && typeof editors[id] === 'function') return editors[id]();
      if (typeof editors.base === 'function') return editors.base();
      if (typeof window.__chidoriBaseStopEditor === 'function') return window.__chidoriBaseStopEditor();
    };
  }

  async function ensureRoute(routeId) {
    const id = routeId || (typeof routeState !== 'undefined' && routeState.routeId) || 'route-1';
    mark('ensure-route', id);
    await ensurePack('shared', SHARED);
    const pack = PACKS[id];
    if (pack) {
      await ensurePack(id, pack);
      window.__chidoriStopEditors[id] = stopEditor;
    }
    installStopEditorBridge();
    return id;
  }

  function isRouteReady(routeId) {
    const id = routeId || (typeof routeState !== 'undefined' && routeState.routeId) || 'route-1';
    if (!packReady.get('shared')) return false;
    if (!PACKS[id]) return true;
    return !!packReady.get(id);
  }

  // Capture-phase so we can load the newly selected pack before route handlers run.
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (!target || (target.id !== 'routeSelect' && target.id !== 'sRoute')) return;
      const nextId = target.value;
      if (!nextId) return;
      event.stopImmediatePropagation();
      routeState.routeId = nextId;
      const stayOn = page;
      ensureRoute(nextId)
        .then(() => {
          if (page !== stayOn) return;
          if (stayOn === 'routes' && typeof routes === 'function') routes();
          if (stayOn === 'settings' && settingsTab === 'stops' && typeof stopEditor === 'function') stopEditor();
        })
        .catch((error) => {
          console.error('[chidori] route pack load failed', nextId, error);
          mark('pack-load-error', String(error && error.message || error));
          if (typeof window.__chidoriShowRouteLoadError === 'function') {
            window.__chidoriShowRouteLoadError(error, () => {
              ensureRoute(nextId)
                .then(() => {
                  if (page === 'routes') routes();
                  if (page === 'settings') settings();
                })
                .catch((err) => console.error('[chidori] retry failed', err));
            });
          }
        });
    },
    true
  );

  window.__chidoriRouteAssets = {
    ensureRoute,
    isRouteReady,
    // Back-compat no-ops: never auto-load everything.
    ensure() {
      return ensureRoute(routeState && routeState.routeId);
    },
    isReady() {
      return isRouteReady(routeState && routeState.routeId);
    },
    packs: Object.keys(PACKS)
  };

  mark('route-loader-ready');
})();
