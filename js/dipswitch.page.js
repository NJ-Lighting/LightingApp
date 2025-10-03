// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

// 9 bits voor adres (1..511) → DIP-gewichten 1..256 (bit 0..8)
const DIP_VALUES = [1,2,4,8,16,32,64,128,256];
const MAX_ADDR = 511;

const LS_KEY_ORIENT = 'lightingapp.dip.orient'; // 'up' | 'down'  (ON-richting = huidige toestand)
const LS_KEY_HFLIP  = 'lightingapp.dip.hflip';  // 'ltr' | 'rtl' (links/rechts)

function getOrient(){ return (localStorage.getItem(LS_KEY_ORIENT) === 'down') ? 'down' : 'up'; }
function setOrient(v){ localStorage.setItem(LS_KEY_ORIENT, v === 'down' ? 'down' : 'up'); }

function getHFlip(){ return (localStorage.getItem(LS_KEY_HFLIP) === 'rtl') ? 'rtl' : 'ltr'; }
function setHFlip(v){ localStorage.setItem(LS_KEY_HFLIP, v === 'rtl' ? 'rtl' : 'ltr'); }

let els = null;
let _boundChangeHandler = null;

/* ---------- Helpers voor nummerlabels ---------- */
function numberLabelForIndex(i){
  const h = getHFlip();
  return (h === 'rtl') ? (9 - i) : (i + 1);
}
function updateNumbers(){
  if(!els?.toggles) return;
  const dips = els.toggles.querySelectorAll('.dip');
  dips.forEach((dip, i)=>{
    const numEl = dip.querySelector('.num');
    if(numEl) numEl.textContent = String(numberLabelForIndex(i));
    const inp = dip.querySelector('input[type="checkbox"]');
    if(inp) inp.setAttribute('aria-label', `Switch ${numberLabelForIndex(i)}`);
  });
}

/* ---------- DOM volgorde omkeren (echte reorder) ---------- */
function reorderDips(direction /* 'ltr' | 'rtl' */){
  if(!els?.toggles) return;
  const wrap = els.toggles;
  const keepScroll = wrap.scrollLeft ?? 0;

  const nodes = Array.from(wrap.children).filter(n => n.classList?.contains('dip'));
  nodes.sort((a,b)=>{
    const ia = parseInt(a.dataset.idx, 10);
    const ib = parseInt(b.dataset.idx, 10);
    return direction === 'rtl' ? (ib - ia) : (ia - ib);
  });
  nodes.forEach(n => wrap.appendChild(n));

  // herstel scroll zonder te springen
  if (Number.isFinite(keepScroll)) wrap.scrollLeft = keepScroll;
  updateNumbers();
}

/* ---------- Render ---------- */
function renderDIPs(container){
  if(!container) return;
  container.innerHTML = '';

  DIP_VALUES.forEach((bitVal, i)=>{
    const id = `sw-${bitVal}`;
    const el = document.createElement('div');
    el.className = 'dip';
    el.dataset.idx = String(i);
    el.innerHTML = `
      <div class="num">${numberLabelForIndex(i)}</div>
      <label class="toggle" for="${id}">
        <input type="checkbox" id="${id}" data-val="${bitVal}" aria-label="Switch ${numberLabelForIndex(i)}" />
        <span class="knob" aria-hidden="true"></span>
        <span class="legend on" aria-hidden="true">ON</span>
        <span class="legend off" aria-hidden="true">OFF</span>
      </label>
      <div class="value" id="lbl-${id}">OFF</div>
    `;
    container.appendChild(el);
  });

  // Eén change-listener op de container
  if (_boundChangeHandler) {
    container.removeEventListener('change', _boundChangeHandler);
  }
  _boundChangeHandler = ()=> syncFromSwitches();
  container.addEventListener('change', _boundChangeHandler);

  updateNumbers();
}

/* ---------- DMX mapping: som(gewichten) = adres ---------- */
// Zet switches naar adres (1..511)
function setSwitchesFor(addr, container){
  if(!container) return;
  const a = clampAddr(addr);
  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    if(!input) return;
    const on = (a & v) === v;
    input.checked = on;
    const lbl = container.querySelector(`#lbl-sw-${v}`);
    if(lbl) lbl.textContent = on ? 'ON' : 'OFF';
  });
}

function switchesValue(container){
  if(!container) return 1;
  let mask = 0;
  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    if(input?.checked) mask |= v;
  });
  return clampAddr(mask || 1);
}

function clampAddr(v){
  const n = Number(v) || 1;
  return Math.max(1, Math.min(MAX_ADDR, n));
}

function syncFromAddress(){
  if(!els?.address || !els?.toggles) return;
  const a = clampAddr(els.address.value);
  setSwitchesFor(a, els.toggles);
  // aria-live announce
  els.addrLive && (els.addrLive.textContent = `Adres ${a}`);
  state.setDip?.(a);
}

function syncFromSwitches(){
  if(!els?.toggles) return;
  const addr1 = switchesValue(els.toggles);
  if(els.address) els.address.value = addr1;

  // Labels bijwerken
  const inputs = els.toggles.querySelectorAll('input[type="checkbox"]');
  inputs.forEach(inp=>{
    const id = inp.id;
    const lbl = els.toggles.querySelector(`#lbl-${id}`);
    if(lbl) lbl.textContent = inp.checked ? 'ON' : 'OFF';
  });

  // aria-live announce
  els.addrLive && (els.addrLive.textContent = `Adres ${addr1}`);
  state.setDip?.(addr1);
}

/* ---------- UI ---------- */
function applyOrientationUI(){
  if(!els?.toggles || !els?.orientBtn) return;
  const orient = getOrient(); // huidige toestand: 'up' | 'down'
  const next   = orient === 'down' ? 'up' : 'down'; // wat er gebeurt bij klik

  // CSS voor ON-positie (visual van de schakelaars)
  els.toggles.classList.toggle('on-down', orient === 'down');

  // Pijl toont ACTIE (volgende richting)
  const arrowEl = els.orientBtn.querySelector('.arrow');
  if (arrowEl){
    arrowEl.classList.remove('up','down');
    arrowEl.classList.add(next === 'down' ? 'down' : 'up');
  }

  // Knoptekst + title beschrijven ook de ACTIE
  els.orientBtn.setAttribute('aria-pressed', String(orient === 'down'));
  const lab = els.orientBtn.querySelector('.arrow-label');
  if(lab) lab.textContent = next === 'down' ? 'ON beneden' : 'ON boven';
  els.orientBtn.title = next === 'down' ? 'Zet ON naar beneden' : 'Zet ON naar boven';
}

function applyHFlipUI(){
  if(!els?.hflipBtn) return;
  const h = getHFlip(); // 'ltr' | 'rtl'
  reorderDips(h); // echte omkering van de volgorde

  const toRTL = h === 'rtl';
  els.hflipBtn.setAttribute('aria-pressed', String(toRTL));
  const ah = els.hflipBtn.querySelector('.arrow-h');
  if(ah){
    ah.classList.toggle('left', toRTL); // ▶ of ◀
  }
  const lab = els.hflipBtn.querySelector('.arrow-h-label');
  if(lab) lab.textContent = toRTL ? 'Rechts → Links' : 'Links → Rechts';
  els.hflipBtn.title = toRTL ? 'Spiegel naar Links' : 'Spiegel naar Rechts';
}

function toggleOrientation(){
  setOrient(getOrient() === 'down' ? 'up' : 'down');
  applyOrientationUI();
}

function toggleHFlip(){
  setHFlip(getHFlip() === 'rtl' ? 'ltr' : 'rtl');
  applyHFlipUI();
}

export function initDipswitch(){
  els = {
    address:   $('#addr'),
    addrLive:  $('#addr-live'), // aria-live element (optioneel in HTML)
    toggles:   $('#dipwrap'),
    orientBtn: $('#dip-orient'),
    hflipBtn:  $('#dip-hflip'),
  };

  // default 1e keer expliciet op 'up' zetten als er niets in LS staat
  if (!localStorage.getItem(LS_KEY_ORIENT)) setOrient('up');
  if (!localStorage.getItem(LS_KEY_HFLIP)) setHFlip('ltr');

  renderDIPs(els.toggles);

  // Init UI
  applyOrientationUI(); // pijl & on-down
  applyHFlipUI();       // labels & DOM-volgorde

  // Live sync adres ↔ switches
  els.address?.addEventListener('input', ()=>{
    // alleen cijfers toelaten tijdens typen
    const v = String(els.address.value || '').replace(/[^0-9]/g,'');
    if(v !== els.address.value) els.address.value = v;
    // niet elke toetsaanslag forceren; set pas nadat waarde geldig wordt
    if(v.length) syncFromAddress();
  });
  els.address?.addEventListener('change', ()=>{
    els.address.value = clampAddr(els.address.value);
    syncFromAddress();
  });
  els.address?.addEventListener('blur', ()=>{
    els.address.value = clampAddr(els.address.value);
    syncFromAddress();
  });

  // Startwaarde uit state
  if(els.address){
    const start = clampAddr(state.getDip ? state.getDip() : 1);
    els.address.value = start;
    syncFromAddress();
  }

  // Toggle knoppen
  els.orientBtn?.addEventListener('click', toggleOrientation);
  els.hflipBtn?.addEventListener('click', toggleHFlip);

  // Cross-tab sync
  state.onMessage?.(msg=>{
    if(msg?.type==='dip:update'){
      const v = clampAddr(msg.payload);
      if(els.address) els.address.value = v;
      setSwitchesFor(v, els.toggles);
      els.addrLive && (els.addrLive.textContent = `Adres ${v}`);
    }
  });
}

/* ---------- start de pagina ---------- */
initDipswitch();
