// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

// 9 bits voor adres (1..511) → DIP-gewichten 1..256 (bit 0..8)
const DIP_VALUES = [1,2,4,8,16,32,64,128,256];
const MAX_ADDR = 511;

const LS_KEY_ORIENT = 'lightingapp.dip.orient'; // 'up' | 'down'  (ON-richting)
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
  const keepScroll = wrap.scrollLeft;

  const nodes = Array.from(wrap.children).filter(n => n.classList?.contains('dip'));
  nodes.sort((a,b)=>{
    const ia = parseInt(a.dataset.idx, 10);
    const ib = parseInt(b.dataset.idx, 10);
    return direction === 'rtl' ? (ib - ia) : (ia - ib);
  });
  nodes.forEach(n => wrap.appendChild(n));

  wrap.scrollLeft = keepScroll;
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

  if (_boundChangeHandler) {
    container.removeEventListener('change', _boundChangeHandler);
  }
  _boundChangeHandler = ()=> syncFromSwitches();
  container.addEventListener('change', _boundChangeHandler);
}

/* ---------- DMX mapping: som(gewichten) = adres ---------- */
// Zet switches naar adres (1..511)
function setSwitchesFor(addr, container){
  if(!container) return;
  const a = Math.max(1, Math.min(MAX_ADDR, Number(addr)||1));
  let mask = a; // adres == bitmask som

  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    if(!input) return;
    const on = (mask & v) === v;
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
  return Math.max(1, Math.min(MAX_ADDR, mask || 1));
}

function syncFromAddress(){
  if(!els) return;
  const a = Math.max(1, Math.min(MAX_ADDR, Number(els.address?.value)||1));
  setSwitchesFor(a, els.toggles);
  state.setDip(a);
}

function syncFromSwitches(){
  if(!els) return;
  const addr1 = switchesValue(els.toggles);
  if(els.address) els.address.value = addr1;

  const inputs = els.toggles?.querySelectorAll('input[type="checkbox"]') || [];
  inputs.forEach(inp=>{
    const id = inp.id;
    const lbl = els.toggles.querySelector(`#lbl-${id}`);
    if(lbl) lbl.textContent = inp.checked ? 'ON' : 'OFF';
  });

  state.setDip(addr1);
}

/* ---------- UI ---------- */
function applyOrientationUI(){
  const orient = getOrient(); // 'up' | 'down'
  const isDown = orient === 'down';

  // switch-visuals
  els.toggles.classList.toggle('on-down', isDown);

  // pijltje toont HUIDIGE richting: up => ▲, down => ▼
  const arrowEl = els.orientBtn?.querySelector('.arrow');
  if (arrowEl){
    arrowEl.classList.remove('up','down');
    arrowEl.classList.add(isDown ? 'down' : 'up');
  }

  // knoptekst + title
  els.orientBtn?.setAttribute('aria-pressed', String(isDown));
  const lab = els.orientBtn?.querySelector('.arrow-label');
  if(lab) lab.textContent = isDown ? 'ON beneden' : 'ON boven';
  if(els.orientBtn){
    els.orientBtn.title = isDown ? 'Zet ON naar boven' : 'Zet ON naar beneden';
  }
}

function applyHFlipUI(){
  const h = getHFlip(); // 'ltr' | 'rtl'
  reorderDips(h); // echte omkering van de volgorde

  const pressed = h === 'rtl';
  els.hflipBtn?.setAttribute('aria-pressed', String(pressed));
  const ah = els.hflipBtn?.querySelector('.arrow-h');
  if(ah){
    ah.classList.toggle('left', pressed); // ▶ of ◀
  }
  const lab = els.hflipBtn?.querySelector('.arrow-h-label');
  if(lab) lab.textContent = pressed ? 'Rechts → Links' : 'Links → Rechts';
  if(els.hflipBtn){
    els.hflipBtn.title = pressed ? 'Spiegel naar Links' : 'Spiegel naar Rechts';
  }
}

function toggleOrientation(){
  const next = getOrient() === 'down' ? 'up' : 'down';
  setOrient(next);
  applyOrientationUI();
}

function toggleHFlip(){
  const next = getHFlip() === 'rtl' ? 'ltr' : 'rtl';
  setHFlip(next);
  applyHFlipUI();
}

export function initDipswitch(){
  els = {
    address:   $('#addr'),
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
  els.address?.addEventListener('input', syncFromAddress);

  // Startwaarde uit state
  if(els.address){
    const start = Math.max(1, Math.min(MAX_ADDR, state.getDip ? state.getDip() : 1));
    els.address.value = start;
    syncFromAddress();
  }

  // Toggle knoppen
  els.orientBtn?.addEventListener('click', toggleOrientation);
  els.hflipBtn?.addEventListener('click', toggleHFlip);

  // Cross-tab sync
  state.onMessage?.(msg=>{
    if(msg?.type==='dip:update'){
      const v = Math.max(1, Math.min(MAX_ADDR, msg.payload));
      if(els.address) els.address.value = v;
      setSwitchesFor(v, els.toggles);
    }
  });
}

/* ---------- start de pagina ---------- */
initDipswitch();
