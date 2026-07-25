const CACHE_NAME = 'chidori-route-map-v75';

// Core shell must succeed for install. Route packs are best-effort so one 404
// cannot block Service Worker updates for already-installed PWAs.
const CORE_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=75',
  './app-icon.svg',
  './app-icon-192.png',
  './app-icon-512.png',
  './styles.css?v=71',
  './hokuei-route.css?v=33',
  './stop-editor-v8.css?v=32',
  './d1-sync.css?v=32',
  './hokuei-authoritative-v12.css?v=32',
  './hokuei-manual-override-v13.css?v=33',
  './hokuei-driving-v14.css?v=32',
  './hokuei-guidance-v22.css?v=34',
  './hokuei-stop-images-v25.css?v=32',
  './study-materials.css?v=71',
  './data.js?v=32',
  './app.js?v=71',
  './study-materials-data.js?v=71',
  './study-materials.js?v=71',
  './home-navigation-v25.js?v=32',
  './route-map-link.js?v=71',
  './d1-sync.js?v=61',
  './hokuei-authoritative-v12.js?v=33',
  './hokuei-manual-override-v13.js?v=33',
  './hokuei-shared-coordinates-v15.js?v=32',
  './hokuei-no-uturn-v17.js?v=74',
  './imagawa-directions-compat-v2.js?v=56',
  './hokuei-streetview-stops-v26.js?v=32',
  './hokuei-guidance-v22.js?v=57',
  './hokuei-stop-images-v25.js?v=32',
  './imagawa-urayasu-maihama-path-v1o.js?v=56',
  './imagawa-chidori-garage-path-v1.js?v=58',
  './imagawa-route-v1.js?v=58',
  './imagawa-path-policy-v3.js?v=56',
  './pwa-install.js?v=75'
];

const ROUTE_SHELL = [
  './urayasu-higashi-danchi-stop-images-v1.css?v=63',
  './tomioka-stop-images-v1.css?v=65',
  './horie-stop-images-v1.css?v=66',
  './shiyakusho-stop-images-v1.css?v=67',
  './maihama-line-stop-images-v1.css?v=69',
  './takasu-line-stop-images-v1.css?v=72',
  './symbol-road-line-stop-images-v1.css?v=73',
  './maihama-resort-line-stop-images-v1.css?v=74',
  './urayasu-higashi-danchi-platforms-v1.js?v=63',
  './urayasu-higashi-danchi-path-v1.js?v=63',
  './urayasu-higashi-danchi-path-policy-v1.js?v=63',
  './urayasu-higashi-danchi-route-v1.js?v=63',
  './tomioka-platforms-v1.js?v=65',
  './tomioka-path-v1.js?v=65',
  './tomioka-path-policy-v1.js?v=65',
  './tomioka-stop-images-v1.js?v=65',
  './tomioka-route-v1.js?v=65',
  './horie-platforms-v1.js?v=66',
  './horie-path-v1.js?v=66',
  './horie-path-policy-v1.js?v=66',
  './horie-stop-images-v1.js?v=66',
  './horie-route-v1.js?v=66',
  './shiyakusho-platforms-v1.js?v=67',
  './shiyakusho-path-v1.js?v=67',
  './shiyakusho-path-policy-v1.js?v=67',
  './shiyakusho-stop-images-v1.js?v=67',
  './shiyakusho-route-v1.js?v=67',
  './maihama-line-platforms-v1.js?v=69',
  './maihama-line-path-v1.js?v=69',
  './maihama-line-path-policy-v1.js?v=69',
  './maihama-line-stop-images-v1.js?v=69',
  './maihama-line-route-v1.js?v=69',
  './takasu-line-platforms-v1.js?v=72',
  './takasu-line-path-v1.js?v=72',
  './takasu-line-path-policy-v1.js?v=72',
  './takasu-line-stop-images-v1.js?v=72',
  './takasu-line-route-v1.js?v=72',
  './symbol-road-line-platforms-v1.js?v=73',
  './symbol-road-line-path-v1.js?v=73',
  './symbol-road-line-path-policy-v1.js?v=73',
  './symbol-road-line-stop-images-v1.js?v=73',
  './symbol-road-line-route-v1.js?v=73',
  './maihama-resort-line-platforms-v1.js?v=74',
  './maihama-resort-line-path-v1.js?v=74',
  './maihama-resort-line-path-policy-v1.js?v=74',
  './maihama-resort-line-stop-images-v1.js?v=74',
  './maihama-resort-line-route-v1.js?v=74'
];

async function precache(cache, urls, { required }) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      await cache.put(url, response);
    } catch (error) {
      if (required) throw error;
      console.warn('[sw] optional precache skipped', url, error);
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
    <p>オフラインのためアプリを表示できません。通信できる場所でもう一度開くと、自動的に最新版へ更新されます。</p>
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

async function matchNavigationFallback(cache, request) {
  const candidates = [
    request,
    './index.html',
    './',
    new URL('./index.html', self.location).href,
    new URL('./', self.location).href
  ];
  for (const key of candidates) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
  }
  return offlineNavigationFallback();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await precache(cache, CORE_SHELL, { required: true });
    await precache(cache, ROUTE_SHELL, { required: false });
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

async function networkFirst(request, isNavigation = false) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (isNavigation) return matchNavigationFallback(cache, request);
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true));
    return;
  }

  if (/\.(?:js|css|html)$/.test(url.pathname) || url.pathname.endsWith('webmanifest') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')) {
    event.respondWith(networkFirst(request, false));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
