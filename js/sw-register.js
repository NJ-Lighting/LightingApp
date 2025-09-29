(function () {
  if (!('serviceWorker' in navigator)) {
    console.info('[SW] Niet ondersteund in deze browser');
    return;
  }

  // Registreer altijd op root-pad, zodat SW alle routes kan controleren
  const SW_URL = '/service-worker.js';

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      console.info('[SW] Geregistreerd:', reg.scope);

      if (reg.waiting) {
        console.info('[SW] Nieuwe versie beschikbaar (waiting)');
      }

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.info('[SW] Nieuwe versie geïnstalleerd – ververs om te updaten');
          }
        });
      });
    } catch (err) {
      console.error('[SW] Registratie mislukt:', err);
    }
  });
})();
