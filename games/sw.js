---
layout: null
---
/* Disc0 Games service worker. Cache name is stamped per Jekyll build. */
var CACHE = 'd0-games-{{ site.time | date: "%Y%m%d%H%M%S" }}';
var PRECACHE = [
  '/games/',
  '/games/games.css',
  '/games/pwa.js',
  '/games/manifest.webmanifest',
  '/games/icons/icon-192.png',
  '/games/icons/icon-512.png',
  '/games/icons/apple-touch-icon.png',
  '/games/arrows/',
  '/games/arrows/arrows.js',
  '/games/potions/',
  '/games/potions/potions.js',
  '/main.css',
  '/favicon.ico'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Add each file on its own so one miss does not block install.
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf('d0-games-') === 0 && key !== CACHE) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function inScope(url) {
  if (url.origin === self.location.origin) {
    return url.pathname.indexOf('/games/') === 0 || url.pathname === '/main.css' || url.pathname === '/favicon.ico';
  }
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (!inScope(url)) return;

  if (req.mode === 'navigate') {
    // Pages: try the network briefly, fall back to the cached copy.
    event.respondWith(
      new Promise(function (resolve) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          caches.match(req).then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
        }, 2500);
        fetch(req).then(function (res) {
          clearTimeout(timer);
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
          if (!done) { done = true; resolve(res); }
        }).catch(function () {
          clearTimeout(timer);
          caches.match(req).then(function (hit) {
            if (!done) { done = true; resolve(hit || caches.match('/games/')); }
          });
        });
      })
    );
    return;
  }

  // Assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var refresh = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || refresh;
      });
    })
  );
});
