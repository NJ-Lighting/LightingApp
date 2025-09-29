(function () {
  if (!('serviceWorker' in navigator)) {
    console.info('[SW] Niet ondersteund in deze browser');
    return;
  }

  // Wacht tot de pagina geladen is (zeker op iOS/Safari)
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js'); // relatieve path → submap-proof
      console.info('[SW] Geregistreerd:', reg.scope);

      if (reg.waiting) {
        console.info('[SW] Nieuwe versie beschikbaar (waiting)');
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.info('[SW] Nieuwe versie geïnstalleerd – ververs om te updaten');
          }
        });
      });
    } catch (err) {
      console.error('[SW] Registratie mislukt:', err);
    }
  });
})();
