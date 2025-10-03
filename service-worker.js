// ---- LightingApp Service Worker (app-shell + offline) ----

// ✏️ Verhoog deze bij elke wijziging aan APP_SHELL (mag handmatig of via CI)
const APP_VERSION = 'la-v3';

// Alles wat je app nodig heeft om op te starten + belangrijkste pagina’s.
// (Let op: bestandsnamen komen 1-op-1 uit je repo.)
const APP_SHELL = [
  // basis
  '/index.html',
  '/offline.html',

  // pages
  '/pages/about.html',
  '/pages/addressing.html',
  '/pages/dipswitch.html',
  '/pages/gdtf.html',
  '/pages/mylibrary.html',

  // PWA config
  '/manifest.json',

  // styles
  '/css/style.css',
  '/css/nav.css',

  // js
  '/js/core.js',
  '/js/state.js',
  '/js/nav.js',
  '/js/sw-register.js',
  '/js/addressing.page.js',
  '/js/dipswitch.page.js',
  '/js/gdtf.page.js',
  '/js/library.js',
  '/js/mylibrary.pages.js',

  // icons (zorg dat deze bestaan in /icons/)
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/monochrome-192.png',
  '/icons/shortcut-addressing.png',
  '/icons/shortcut-dip.png',
  '/icons/shortcut-gdtf.png',
];

const CACHE_NAME = `la-shell-${APP_VERSION}`;
const SHELL_SET = new Set(APP_SHELL);

// -- Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Gebruik Request(..., {cache:'reload'}) zodat we geen oude CDN-versies krijgen
    const addAllSafe = APP_SHELL.map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {
        // Niet fataal: sla over als een optioneel icoon (nog) niet bestaat
        // console.debug('[SW] Skip missing during install:', u);
      })
    );
    await Promise.all(addAllSafe);
    // Directe activatie toegestaan; UI triggert 'SKIP_WAITING' wanneer gewenst
    self.skipWaiting();
  })());
});

// -- Activate: opruimen oude caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('la-shell-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// -- Helper: HTML detectie
function wantsHTML(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

// -- Fetch strategie:
// * Navigaties: network-first → fallback offline
// * Shell-assets: cache-first
// * Overige same-origin GET: stale-while-revalidate light
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Alleen same-origin cachen
  const sameOrigin = url.origin === self.location.origin;

  if (wantsHTML(request)) {
    // Navigatie: network-first met offline fallback
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // Optioneel: update cache van HTML-pagina’s
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        // Probeer cache, anders offline.html
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) ||
               (await cache.match('/offline.html')) ||
               new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Alleen GET en same-origin behandelen
  if (request.method === 'GET' && sameOrigin) {
    // Shell-assets: cache-first
    if (SHELL_SET.has(url.pathname)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const resp = await fetch(request);
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        } catch {
          return cached || new Response('Offline', { status: 503 });
        }
      })());
      return;
    }

    // Overige same-origin GET: SWR-light
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((resp) => {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || fetchPromise || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // Extern of non-GET: laat de browser het doen
});

// -- Messages (update flow via sw-register.js)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
