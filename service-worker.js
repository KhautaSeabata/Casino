const CACHE_NAME = 'trading-signals-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/chart.html',
  '/signals.html',
  '/settings.html',
  '/styles.css',
  '/auth.js',
  '/data.js',
  '/smc.js',
  '/news.js',
  '/tracker.js',
  '/chart.js',
  '/trendlines.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
