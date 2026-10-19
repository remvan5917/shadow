// Garde Shadow disponible PARTOUT, même sans WiFi (aux courses, en voiture…).
// Deux réserves :
// - « shadow-app-vN » : les fichiers de l'appli (changent à chaque version) ;
// - « shadow-modeles » : les gros modèles des yeux, la police… (gardés d'une version à l'autre).
const CACHE = 'shadow-app-v29';
const MODELS = 'shadow-modeles';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'orthographe.js', 'cerveau.js', 'jeux.js', 'voix.js', 'oreilles.js', 'vision.js', 'corps.js', 'contenus.js', 'visage.js', 'activites.js', 'ecran.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
// fichiers qui ne changent jamais (version figée dans l'adresse) : la réserve d'abord, c'est plus rapide
const FIXED = /cdn\.jsdelivr\.net|storage\.googleapis\.com|fonts\.gstatic\.com/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MODELS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// réseau, mais pas plus de quelques secondes (en 4G faible, on n'attend pas : on prend la réserve)
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('lent')), ms);
  p.then(r => { clearTimeout(t); res(r); }, err => { clearTimeout(t); rej(err); });
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname === 'api.groq.com' || url.port === '11434') return;
  if (FIXED.test(url.hostname)) {
    e.respondWith(caches.open(MODELS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  const mine = url.origin === location.origin;
  if (!mine && !/fonts\.googleapis\.com/.test(url.hostname)) return;
  const store = mine ? CACHE : MODELS;
  e.respondWith(
    withTimeout(fetch(req), 3500).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(store).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: mine }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Promise.reject(new Error('hors-ligne')))))
  );
});
