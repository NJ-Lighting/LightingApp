/* ===== LightingApp Service Worker =====
   Strategie:
   - App Shell (precache): kernpagina's + kern-assets
   - HTML navigaties: stale-while-revalidate + offline fallback
   - Static assets: cache-first
   - Overig: stale-while-revalidate
*/

const SW_VERSION = 'la-v1.0.0';               // ← Verhoog bij elke release om clients te updaten
const PRECACHE = `precache-${SW_VERSION}`;
const RUNTIME  = `runtime-${SW_VERSION}`;

const APP_SHELL = [
  'index.html',
  'offline.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/state.js',
  'js/sw-register.js',
  'pages/addressing.html',
  'pages/dipswitch.html',
  'pages/gdtf.html',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png',
  'assets/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (!key.includes(SW_VERSION)) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // HTML navigaties (inclusief deep links)
  if (req.mode === 'navigate') {
    event.respondWith(htmlSWR(req));
    return;
  }

  const dest = req.destination;
  if (['style', 'script', 'image', 'font'].includes(dest)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Overige GET's (bijv. JSON van dezelfde origin): SWR
  event.respondWith(staleWhileRevalidate(req));
});

/* ==== Helpers ==== */

async function htmlSWR(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request).then((resp) => {
    if (resp && resp.status === 200) cache.put(request, resp.clone());
    return resp;
  }).catch(async () => {
    const offline = await caches.match('offline.html');
    return offline || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  });

  return cached || network;
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const resp = await fetch(request);
    if (resp && resp.status === 200) cache.put(request, resp.clone());
    return resp;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);

  const network = fetch(request).then((resp) => {
    if (resp && resp.status === 200) cache.put(request, resp.clone());
    return resp;
  }).catch(() => cached || Response.error());

  return cached || network;
}
