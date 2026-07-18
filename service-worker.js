const CACHE_NAME = 'chidori-route-map-v21';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=21',
  './app-icon.svg',
  './styles.css?v=21',
  './hokuei-route.css?v=21',
  './stop-editor-v8.css?v=21',
  './d1-sync.css?v=21',
  './hokuei-authoritative-v12.css?v=21',
  './hokuei-manual-override-v13.css?v=21',
  './hokuei-driving-v14.css?v=21',
  './hokuei-guidance-v21.css?v=21',
  './data.js?v=21',
  './app.js?v=21',
  './route-map-link.js?v=21',
  './d1-sync.js?v=21',
  './hokuei-authoritative-v12.js?v=21',
  './hokuei-manual-override-v13.js?v=21',
  './hokuei-shared-coordinates-v15.js?v=21',
  './hokuei-no-uturn-v17.js?v=21',
  './hokuei-guidance-v21.js?v=21',
  './pwa-install.js?v=21'
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