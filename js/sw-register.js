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
  const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 min

  // Kleine helper: safe update call met throttle per registration instance
  const lastUpdate = new WeakMap();
  async function safeUpdate(reg) {
    try {
      const now = Date.now();
      const last = lastUpdate.get(reg) || 0;
      if (now - last < 15 * 1000) return; // throttle 15s
      lastUpdate.set(reg, now);
      await reg.update();
      console.info('[SW] Update-check uitgevoerd');
    } catch (e) {
      console.debug('[SW] Update-check niet gelukt (niet fataal):', e);
    }
  }

  // UI: bescheiden update-banner (DOM-only, geen CSS vereist)
  let bannerEl = null;
  function showUpdateBanner(onApply) {
    if (bannerEl) return;
    const el = document.createElement('div');
    el.id = 'la-sw-update';
    el.setAttribute('role', 'status');
    el.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 10000; background:#0e1a2c; color:#e7eaf0;
      border:1px solid #60a5fa; padding:10px 14px; border-radius:12px;
      box-shadow: 0 6px 20px rgba(0,0,0,.35); display:flex; gap:10px; align-items:center;
    `;
    el.innerHTML = `
      <span>Nieuwe versie beschikbaar.</span>
      <button type="button" id="la-sw-apply" style="
        background:#22d3ee; color:#001014; border:none; border-radius:10px; padding:6px 10px; cursor:pointer;
      ">Updaten</button>
      <button type="button" id="la-sw-dismiss" aria-label="Sluiten" style="
        background:transparent; color:#9aa4b2; border:1px solid #1f2a3a; border-radius:10px; padding:6px 8px; cursor:pointer;
      ">✕</button>
    `;
    document.body.appendChild(el);
    bannerEl = el;

    const applyBtn = el.querySelector('#la-sw-apply');
    const dismissBtn = el.querySelector('#la-sw-dismiss');
    applyBtn?.addEventListener('click', onApply);
    dismissBtn?.addEventListener('click', hideUpdateBanner);
    document.addEventListener('keydown', escToClose, { once: true });
    applyBtn?.focus?.();
  }
  function hideUpdateBanner() {
    document.removeEventListener('keydown', escToClose);
    bannerEl?.remove();
    bannerEl = null;
  }
  function escToClose(e){ if(e.key === 'Escape') hideUpdateBanner(); }

  async function registerSW() {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      console.info('[SW] Geregistreerd op scope:', reg.scope);

      // Eerste update-check kort na load (geeft builds op Vercel snel door)
      setTimeout(() => safeUpdate(reg), 1500);

      // Als er al een waiting worker staat, toon banner
      if (reg.waiting) {
        console.info('[SW] Nieuwe versie beschikbaar (waiting)');
        showUpdateBanner(() => {
          reg.waiting?.postMessage?.({ type: 'SKIP_WAITING' });
        });
      }

      // Nieuwe installaties bijwerken
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        console.info('[SW] Update gevonden, status:', nw.state);
        nw.addEventListener('statechange', () => {
          console.info('[SW] Install state:', nw.state);
          // Zodra de nieuwe SW klaar staat (installed) en er al een controller is,
          // betekent dit: er is een update die wacht op activering.
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.info('[SW] Nieuwe versie geïnstalleerd – klaar om te activeren');
            showUpdateBanner(() => nw.postMessage?.({ type: 'SKIP_WAITING' }));
          }
        });
      });

      // Wanneer de actieve controller wisselt (na skipWaiting + refresh)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.info('[SW] Controller gewijzigd (nieuwe SW actief) – herladen');
        // Verberg banner en ververs om de nieuwe assets/regels te krijgen
        hideUpdateBanner();
        // Klein uitstel zodat de controller echt actief is
        setTimeout(() => location.reload(), 100);
      });

      // Wanneer het tabblad weer actief wordt, even updaten
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') safeUpdate(reg);
      });

      // Periodieke checks (als pagina lang open staat)
      setInterval(() => safeUpdate(reg), UPDATE_INTERVAL_MS);

    } catch (err) {
      console.error('[SW] Registratie mislukt:', err);
    }
  }

  // Registreer na load voor maximale compat met statische hosts
  window.addEventListener('load', registerSW);
})();
