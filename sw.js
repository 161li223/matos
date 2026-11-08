// Service worker : permet d'ouvrir l'appli sans réseau sur le téléphone.
// Stratégie "réseau d'abord" : on prend toujours la dernière version en ligne,
// et on retombe sur la copie en cache si pas de connexion.
const CACHE = 'matos-v1';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'icon.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/api.js',
  'js/ui.js',
  'js/actions.js',
  'js/components.js',
  'js/demo.js',
  'js/core/model.js',
  'js/views/dashboard.js',
  'js/views/inventory.js',
  'js/views/item.js',
  'js/views/loans.js',
  'js/views/people.js',
  'js/views/person.js',
  'js/views/repairs.js',
  'js/views/orders.js',
  'js/views/history.js',
  'js/views/settings.js',
  'js/views/connect.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // seulement nos propres fichiers (pas Google, pas les POST)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
