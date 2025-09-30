(function () {
  // SW niet beschikbaar of lokale file-preview → netjes stoppen
  if (!('serviceWorker' in navigator)) {
    console.info('[SW] Niet ondersteund in deze browser');
    return;
  }
  if (location.protocol === 'file:') {
    console.info('[SW] Niet registreren in file:// context');
    return;
  }

  // Registreer altijd op root-pad, zodat SW alle routes kan controleren
  const SW_URL = '/service-worker.js';

  // Utility: veilige update call
  async function safeUpdate(reg) {
    try {
      await reg.update();
      console.info('[SW] Update-check uitgevoerd');
    } catch (e) {
      console.debug('[SW] Update-check niet gelukt (niet fataal):', e);
    }
  }

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      console.info('[SW] Geregistreerd op scope:', reg.scope);

      // Eerste update-check kort na load (geeft builds op Vercel snel door)
      setTimeout(() => safeUpdate(reg), 1500);

      // Status: waiting = er staat al een nieuwe versie klaar
      if (reg.waiting) {
        console.info('[SW] Nieuwe versie beschikbaar (waiting)');
      }

      // Nieuwe installaties bijwerken
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        console.info('[SW] Update gevonden, status:', nw.state);
        nw.addEventListener('statechange', () => {
          console.info('[SW] Install state:', nw.state);
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.info('[SW] Nieuwe versie geïnstalleerd – ververs om te updaten');
          }
        });
      });

      // Handig bij debuggen: wanneer de actieve controller wisselt (na refresh / skipWaiting)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.info('[SW] Controller gewijzigd (nieuwe SW actief)');
      });

      // Wanneer het tabblad weer actief wordt, even updaten
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          safeUpdate(reg);
        }
      });
    } catch (err) {
      console.error('[SW] Registratie mislukt:', err);
    }
  });
})();
