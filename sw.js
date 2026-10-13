const VERSION = 'v8.1';
const CACHE = 'workout-tracker-' + VERSION;
const ASSETS = ['./', './index.html', './styles.css?v=8.1', './templates.js?v=8.1', './app.js?v=8.1', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache: 'no-store'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first (bypassing the HTTP cache) for same-origin GETs; cache is only the offline fallback.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, {cache: 'no-store'}).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match(req, {ignoreSearch: true})).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
