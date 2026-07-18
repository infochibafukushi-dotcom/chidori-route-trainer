const CACHE_NAME = 'chidori-route-map-v20';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=20',
  './app-icon.svg',
  './styles.css?v=20',
  './hokuei-route.css?v=20',
  './stop-editor-v8.css?v=20',
  './d1-sync.css?v=20',
  './hokuei-authoritative-v12.css?v=20',
  './hokuei-manual-override-v13.css?v=20',
  './hokuei-driving-v14.css?v=20',
  './hokuei-guidance-v20.css?v=20',
  './data.js?v=20',
  './app.js?v=20',
  './route-map-link.js?v=20',
  './d1-sync.js?v=20',
  './hokuei-authoritative-v12.js?v=20',
  './hokuei-manual-override-v13.js?v=20',
  './hokuei-shared-coordinates-v15.js?v=20',
  './hokuei-no-uturn-v17.js?v=20',
  './hokuei-guidance-v20.js?v=20',
  './pwa-install.js?v=20'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function networkFirst(request, fallbackKey = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (fallbackKey ? await cache.match(fallbackKey) : null) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (/\.(?:js|css|html)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});