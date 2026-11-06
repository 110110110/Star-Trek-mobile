/* Service worker: la app funciona sin conexión después de la primera visita.
   Al cambiar cualquier archivo, subir el número de VERSION para que los celulares se actualicen. */
const VERSION = 'startrek-v5';
const SHELL = ['./', 'index.html', 'style.css', 'engine.js', 'ui.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  // tipografías de Google: se guardan al verlas por primera vez (si no hay red, la app usa la tipografía monoespaciada del sistema)
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if(url.origin !== location.origin) return;
  // la app: primero la red si responde (así se actualiza), y si no, la copia guardada
  e.respondWith(fetch(req).then(r => {
    if(r && r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
