const CACHE = 'spese-v8';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  evento.respondWith(
    fetch(req)
      .then(risposta => {
        const copia = risposta.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        return risposta;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
  );
});
