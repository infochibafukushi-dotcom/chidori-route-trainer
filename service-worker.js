const CACHE_NAME = 'chidori-route-map-v114';
const APP_INDEX_URL = new URL('./index.html', self.location).href;
const FETCH_TIMEOUT_MS = 7000;
const NAV_TIMEOUT_MS = 2500;

// Minimal shell for Android/WebAPK cold start. Route packs are cached on demand.
const CORE_SHELL = [
  APP_INDEX_URL,
  './manifest.webmanifest',
  './app-icon.svg',
  './app-icon-192.png',
  './app-icon-512.png',
  './styles.css?v=105',
  './study-materials.css?v=98',
  './d1-sync.css?v=32',
  './data.js?v=98',
  './app.js?v=105',
  './study-materials-data.js?v=98',
  './basic-training-quiz-data.js?v=103',
  './study-materials.js?v=99',
  './home-navigation-v25.js?v=32',
  './route-map-link.js?v=71',
  './route-assets-loader.js?v=114',
  './d1-sync.js?v=64',
  './pwa-install.js?v=105',
  './assets/study-materials/stroller/stroller-01-arrival.png',
  './assets/study-materials/stroller/stroller-02-after-boarding.png',
  './assets/study-materials/stroller/stroller-03-fare-payment.png',
  './assets/study-materials/stroller/stroller-04-departure.png',
  './assets/study-materials/stroller/stroller-05-alighting.png',
  './assets/study-materials/stroller/stroller-06-handling-rules.png',
  './assets/study-materials/wheelchair/wheelchair-01-departure-check.png',
  './assets/study-materials/wheelchair/wheelchair-02-boarding.png',
  './assets/study-materials/wheelchair/wheelchair-03-alighting.png',
  './assets/study-materials/mic-guide/mic-guide-01-start-terminal.png',
  './assets/study-materials/mic-guide/mic-guide-02-safety-guidance.png',
  './assets/study-materials/bicycle/bicycle-accident-prevention-three-principles.png',
  './assets/study-materials/driver-health/driver-health-emergency-response.png',
  './assets/study-materials/accident-response/accident-response-guide.png',
  './assets/study-materials/bus-hijacking/bus-hijacking-response-manual.png',
  './assets/study-materials/intersection-turning/intersection-turning-safety-guide.png',
  './assets/study-materials/passenger-injury-prevention/passenger-injury-prevention-guide.png',
  './assets/study-materials/start-end-roll-call/start-end-roll-call-guide.png',
  './assets/study-materials/pre-trip-inspection/pre-trip-inspection-01.png',
  './assets/study-materials/pre-trip-inspection/pre-trip-inspection-02.png',
  './assets/study-materials/pre-trip-inspection/pre-trip-inspection-03.png',
  './assets/study-materials/bus-stop-departure/bus-stop-departure-safety.png',
  './assets/study-materials/bus-stop-arrival/bus-stop-arrival-safety-01.png',
  './assets/study-materials/bus-stop-arrival/bus-stop-arrival-safety-02.png',
  './assets/study-materials/passenger-door-safety/passenger-door-safety-guide.png',
  './assets/study-materials/covers/default-document.png',
  './assets/study-materials/covers/01-baby-car.png',
  './assets/study-materials/covers/02-wheelchair-slope.png',
  './assets/study-materials/covers/03-microphone-guide.png',
  './assets/study-materials/covers/04-bicycle-accident.png',
  './assets/study-materials/door-lever-safety/door-lever-safety-operation.png'
];

function fetchWithTimeout(resource, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const init = Object.assign({}, options, { signal: controller.signal });
  return fetch(resource, init).finally(() => clearTimeout(timeoutId));
}

async function precache(cache, urls, { required }) {
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      const cacheKey = url === APP_INDEX_URL || String(url).endsWith('/index.html')
        ? APP_INDEX_URL
        : url;
      await cache.put(cacheKey, response);
    } catch (error) {
      if (required) {
        console.error('[sw] required precache failed', url, error && error.message ? error.message : error);
        throw error;
      }
      console.warn('[sw] optional precache skipped', url, error && error.message ? error.message : error);
    }
  }
}

function offlineNavigationFallback() {
  const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f5ea8" />
  <title>千鳥路線図</title>
  <style>
    body{font-family:sans-serif;margin:0;padding:24px;background:#f3f7fb;color:#17202a}
    main{max-width:420px;margin:15vh auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 24px rgba(15,94,168,.12)}
    h1{font-size:1.25rem;margin:0 0 12px}
    p{margin:0 0 12px;line-height:1.6}
    button{appearance:none;border:0;border-radius:999px;background:#0f5ea8;color:#fff;padding:12px 18px;font-size:1rem}
  </style>
</head>
<body>
  <main>
    <h1>千鳥路線図</h1>
    <p>オフラインのためアプリを表示できません。通信できる場所でもう一度開いてください。</p>
    <button type="button" id="retry">再読み込み</button>
  </main>
  <script>
    document.getElementById('retry').onclick = function () { location.reload(); };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) return reg.update();
      }).catch(function () {});
    }
    setTimeout(function () { location.reload(); }, 2500);
  </script>
</body>
</html>`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function matchAppIndex(cache) {
  const hit = await cache.match(APP_INDEX_URL);
  if (hit) return hit;
  const legacyKeys = [
    './index.html',
    './',
    new URL('./', self.location).href
  ];
  for (const key of legacyKeys) {
    const legacy = await cache.match(key);
    if (legacy) {
      try { await cache.put(APP_INDEX_URL, legacy.clone()); } catch (e) {}
      return legacy;
    }
  }
  return null;
}

async function handleNavigation(cachePromise) {
  const cache = await cachePromise;
  try {
    const response = await fetchWithTimeout(APP_INDEX_URL, { cache: 'no-store' }, NAV_TIMEOUT_MS);
    if (response.ok) {
      await cache.put(APP_INDEX_URL, response.clone());
      return response;
    }
    console.warn('[sw] navigation network HTTP', response.status);
  } catch (error) {
    console.warn('[sw] navigation network failed', error && error.message ? error.message : error);
  }
  const cached = await matchAppIndex(cache);
  if (cached) return cached;
  return offlineNavigationFallback();
}

function isVersionedCodeAsset(url) {
  return /\.(?:js|css|html)$/.test(url.pathname) || url.pathname.endsWith('webmanifest');
}

function isImageAsset(url) {
  return url.pathname.endsWith('.png') || url.pathname.endsWith('.svg');
}

async function handleCodeAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  // JS/CSS/HTML: exact cache key only — never ignoreSearch (avoids app.js?v=105 serving v=100).
  const cached = await cache.match(request);
  if (cached) {
    try {
      const response = await fetchWithTimeout(request, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(request, response.clone());
        return response;
      }
    } catch (error) {
      // stale-while-revalidate: network failed, use exact cached version
    }
    return cached;
  }
  try {
    const response = await fetchWithTimeout(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    console.warn('[sw] code asset fetch failed', request.url, error && error.message ? error.message : error);
    return Response.error();
  }
}

async function handleImageAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  try {
    const response = await fetchWithTimeout(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    console.warn('[sw] image asset fetch failed', request.url, error && error.message ? error.message : error);
    return Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await precache(cache, CORE_SHELL, { required: true });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const cachePromise = caches.open(CACHE_NAME);
    event.respondWith(
      handleNavigation(cachePromise).catch((error) => {
        console.warn('[sw] navigation handler rejected', error && error.message ? error.message : error);
        return offlineNavigationFallback();
      })
    );
    return;
  }

  if (isVersionedCodeAsset(url)) {
    event.respondWith(
      handleCodeAsset(request).catch((error) => {
        console.warn('[sw] code asset handler rejected', request.url, error && error.message ? error.message : error);
        return Response.error();
      })
    );
    return;
  }

  if (isImageAsset(url)) {
    event.respondWith(
      handleImageAsset(request).catch((error) => {
        console.warn('[sw] image asset handler rejected', request.url, error && error.message ? error.message : error);
        return Response.error();
      })
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetchWithTimeout(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return Response.error();
    }
  })().catch(() => Response.error()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
