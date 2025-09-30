const CH = ('BroadcastChannel' in window) ? new BroadcastChannel('lightingapp') : null;
const LS = window.localStorage;

const KEYS = {
  addr: 'lightingapp.addr.params',
  lib:  'lightingapp.library.v1',
  dip:  'lightingapp.dip.address',
};

export const state = {
  // --- Address plan ---
  getAddr() {
    try {
      return JSON.parse(LS.getItem(KEYS.addr) || '{}');
    } catch {
      return {};
    }
  },
  setAddr(obj) {
    LS.setItem(KEYS.addr, JSON.stringify(obj || {}));
    CH?.postMessage({ type: 'addr:update', payload: obj });
  },
  clearAddr() {
    LS.removeItem(KEYS.addr);
    CH?.postMessage({ type: 'addr:clear' });
  },

  // --- Fixture library ---
  getLibrary() {
    try {
      const raw = LS.getItem(KEYS.lib);
      if (raw) return JSON.parse(raw);

      // seed library on first run
      const seed = [
        {
          id: crypto.randomUUID(),
          brand: 'Ayrton',
          model: 'Perseo Profile',
          mode: '30ch Standard',
          footprint: 30,
          links: 'https://gdtf-share.com/,https://ofl.de/',
          notes: 'IP65 profile',
        },
        {
          id: crypto.randomUUID(),
          brand: 'Robe',
          model: 'Spiider',
          mode: '21ch',
          footprint: 21,
          links: 'https://gdtf-share.com/',
          notes: 'Wash/FX',
        },
        {
          id: crypto.randomUUID(),
          brand: 'Chroma-Q',
          model: 'Color Force II 72',
          mode: '12ch HSI',
          footprint: 12,
          links: '',
          notes: '',
        },
      ];
      LS.setItem(KEYS.lib, JSON.stringify(seed));
      return seed;
    } catch {
      return [];
    }
  },
  setLibrary(arr) {
    LS.setItem(KEYS.lib, JSON.stringify(arr || []));
    CH?.postMessage({ type: 'lib:update', payload: arr });
  },
  addFixture(rec) {
    const arr = state.getLibrary();
    arr.push({
      id: rec.id || crypto.randomUUID(),
      ...rec,
    });
    state.setLibrary(arr);
  },
  clearLibrary() {
    LS.removeItem(KEYS.lib);
    CH?.postMessage({ type: 'lib:clear' });
  },

  // --- DIP switch ---
  getDip() {
    const v = Number(LS.getItem(KEYS.dip));
    return v >= 1 && v <= 512 ? v : 1;
  },
  setDip(v) {
    const a = Math.max(1, Math.min(512, Number(v) || 1));
    LS.setItem(KEYS.dip, String(a));
    CH?.postMessage({ type: 'dip:update', payload: a });
  },
  clearDip() {
    LS.removeItem(KEYS.dip);
    CH?.postMessage({ type: 'dip:clear' });
  },

  // --- Cross-tab messaging ---
  onMessage(fn) {
    if (!CH) return;
    CH.addEventListener('message', (e) => fn(e.data));
  },
};

export default state;
