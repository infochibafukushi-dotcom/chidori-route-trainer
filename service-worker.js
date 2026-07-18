const CACHE_NAME = 'chidori-route-map-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './styles.css',
  './hokuei-route.css',
  './stop-editor-v8.css',
  './d1-sync.css',
  './hokuei-authoritative-v12.css',
  './hokuei-manual-override-v13.css',
  './hokuei-driving-v14.css',
  './data.js',
  './app.js',
  './route-map-link.js',
  './d1-sync.js',
  './hokuei-authoritative-v12.js',
  './hokuei-manual-override-v13.js',
  './hokuei-driving-v14.js',
  './hokuei-shared-coordinates-v15.js',
  './hokuei-guidance-v16.js',
  './hokuei-no-uturn-v17.js',
  './pwa-install.js'
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});