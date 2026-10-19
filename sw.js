// Garde Shadow disponible hors-ligne (seuls le grand cerveau et la voix de Chrome ont besoin d'Internet)
const CACHE = 'shadow-v21';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'orthographe.js', 'cerveau.js', 'jeux.js', 'voix.js', 'oreilles.js', 'vision.js', 'corps.js', 'contenus.js', 'activites.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.groq.com' || url.port === '11434') return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours.
  // Les yeux (modèles de reconnaissance des visages) sont gardés pour marcher sans WiFi.
  const keep = url.origin === location.origin || /gstatic|googleapis|cdn\.jsdelivr\.net/.test(url.hostname);
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && keep) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
