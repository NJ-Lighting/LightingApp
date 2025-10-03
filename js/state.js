// state.js
// Veilige app-state met cross-tab sync (BroadcastChannel + storage fallback)

const HAS_BC = 'BroadcastChannel' in window;
const CH = HAS_BC ? new BroadcastChannel('lightingapp') : null;

// Storage fallback (bv. Safari private / third-party iframes)
const safeLS = (() => {
  try {
    const k = '__la_probe__' + Math.random();
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    // In-memory polyfill
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); }
    };
  }
})();

const KEYS = {
  addr: 'lightingapp.addr.params',
  lib:  'lightingapp.library.v1',
  dip:  'lightingapp.dip.address',
  // voor storage-event broadcast fallback
  bus:  'lightingapp.__bus__'
};

/* ---------------- Broadcasting (BC + storage fallback) ---------------- */
function publish(msg){
  // 1) BroadcastChannel als beschikbaar
  try { CH?.postMessage(msg); } catch {}
  // 2) storage-event fallback
  try {
    const payload = JSON.stringify({ msg, t: Date.now(), r: Math.random() });
    safeLS.setItem(KEYS.bus, payload);
  } catch {}
}

function subscribe(fn){
  // BC
  if (CH) {
    CH.addEventListener('message', (e) => {
      try { fn(e.data); } catch {}
    });
  }
  // storage fallback
  window.addEventListener('storage', (e) => {
    if (e.key !== KEYS.bus || !e.newValue) return;
    try {
      const { msg } = JSON.parse(e.newValue);
      fn(msg);
    } catch {}
  });
}

/* ---------------- Helpers ---------------- */
function jsonGet(key, fallback){
  try {
    const raw = safeLS.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function jsonSet(key, val){
  try { safeLS.setItem(key, JSON.stringify(val)); } catch {}
}
function strGetInt(key, def){
  try {
    const v = Number(safeLS.getItem(key));
    return Number.isFinite(v) ? v : def;
  } catch { return def; }
}
function strSet(key, val){
  try { safeLS.setItem(key, String(val)); } catch {}
}
function strDel(key){
  try { safeLS.removeItem(key); } catch {}
}

/* ---------------- Public API ---------------- */
export const state = {
  // --- Address plan ---
  getAddr() { return jsonGet(KEYS.addr, {}); },
  setAddr(obj) { jsonSet(KEYS.addr, obj || {}); publish({ type: 'addr:update', payload: obj || {} }); },
  clearAddr() { strDel(KEYS.addr); publish({ type: 'addr:clear' }); },

  // --- Fixture library ---
  getLibrary() {
    const cur = jsonGet(KEYS.lib, null);
    if (Array.isArray(cur)) return cur;
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
    jsonSet(KEYS.lib, seed);
    return seed;
  },
  setLibrary(arr) {
    const list = Array.isArray(arr) ? arr : [];
    jsonSet(KEYS.lib, list);
    publish({ type: 'lib:update', payload: list });
  },
  addFixture(rec) {
    const arr = state.getLibrary();
    const item = { id: rec?.id || crypto.randomUUID(), ...rec };
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    state.setLibrary(arr);
  },
  clearLibrary() { strDel(KEYS.lib); publish({ type: 'lib:clear' }); },

  // --- DIP switch ---
  // Let op: UI en bitmask gaan uit van 9 schakelaars → adresbereik 1..511.
  // Daarom hier ook 1..511 afdwingen (geen 512 wegschrijven).
  getDip() {
    const v = strGetInt(KEYS.dip, 1);
    return (v >= 1 && v <= 511) ? v : 1;
  },
  setDip(v) {
    const a = Math.max(1, Math.min(511, Number(v) || 1));
    strSet(KEYS.dip, a);
    publish({ type: 'dip:update', payload: a });
  },
  clearDip() {
    strDel(KEYS.dip);
    publish({ type: 'dip:clear' });
  },

  // --- Cross-tab messaging ---
  onMessage(fn) {
    if (typeof fn !== 'function') return;
    subscribe(fn);
  },
};

export default state;
