// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

// 9 bits voor adres (1..512) → DIP-waarden 1..256 (bit 0..8)
const DIP_VALUES = [1,2,4,8,16,32,64,128,256];

const LS_KEY_ORIENT = 'lightingapp.dip.orient'; // 'up' | 'down'  (ON-richting)
const LS_KEY_HFLIP  = 'lightingapp.dip.hflip';  // 'ltr' | 'rtl' (links/rechts)

function getOrient(){ return (localStorage.getItem(LS_KEY_ORIENT) === 'down') ? 'down' : 'up'; }
function setOrient(v){ localStorage.setItem(LS_KEY_ORIENT, v === 'down' ? 'down' : 'up'); }

function getHFlip(){ return (localStorage.getItem(LS_KEY_HFLIP) === 'rtl') ? 'rtl' : 'ltr'; }
function setHFlip(v){ localStorage.setItem(LS_KEY_HFLIP, v === 'rtl' ? 'rtl' : 'ltr'); }

let els = null;
let _boundChangeHandler = null;

/* ---------- Helpers voor nummerlabels ---------- */
// Voor DOM-index i (0..8) bepalen wat er boven de switch moet staan:
// - ltr: 1..9
// - rtl: 9..1 (links is dan visueel de laatste DOM-node)
function numberLabelForIndex(i){
  const h = getHFlip();
  return (h === 'rtl') ? (9 - i) : (i + 1);
}

// Werk alleen de "1..9"/"9..1" labels bij zonder de DIP-markup opnieuw te bouwen
function updateNumbers(){
  if(!els?.toggles) return;
  const dips = els.toggles.querySelectorAll('.dip');
  dips.forEach((dip, i)=>{
    const numEl = dip.querySelector('.num');
    if(numEl) numEl.textContent = String(numberLabelForIndex(i));
    const inp = dip.querySelector('input[type="checkbox"]');
    if(inp){
      // aria-label ook updaten naar positie-nummer
      inp.setAttribute('aria-label', `Switch ${numberLabelForIndex(i)}`);
    }
  });
}

/* ---------- Render ---------- */
function renderDIPs(container){
  if(!container) return;

  // (Re)render markup in vaste DOM-orde (bitvolgorde). Visuele richting doet CSS.
  container.innerHTML = '';
  DIP_VALUES.forEach((bitVal, i)=>{
    const id = `sw-${bitVal}`;
    const el = document.createElement('div');
    el.className = 'dip';
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
}

// Zet switches naar adres (1..512)
function setSwitchesFor(addr, container){
  if(!container) return;
  const a = Math.max(1, Math.min(512, Number(addr)||1));
  const bitsTarget = a - 1; // 0..511

  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    if(!input) return;
    const on = (bitsTarget & v) === v;
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
  return (mask & 0x1FF) + 1; // 9 bits + offset 1
}

function syncFromAddress(){
  if(!els) return;
  const a = Math.max(1, Math.min(512, Number(els.address?.value)||1));
  setSwitchesFor(a, els.toggles);
  state.setDip(a);
}

function syncFromSwitches(){
  if(!els) return;
  const addr1 = switchesValue(els.toggles);
  if(els.address) els.address.value = addr1;

  // Labels bijwerken (onder elk knopje)
  const inputs = els.toggles?.querySelectorAll('input[type="checkbox"]') || [];
  inputs.forEach(inp=>{
    const id = inp.id;
    const lbl = els.toggles.querySelector(`#lbl-${id}`);
    if(lbl) lbl.textContent = inp.checked ? 'ON' : 'OFF';
  });

  state.setDip(addr1);
}

/* ---------- UI-toepassingen ---------- */
function applyOrientationUI(){
  const orient = getOrient(); // 'up' | 'down'
  els.toggles.classList.toggle('on-down', orient === 'down');

  // Knop status + pijl + titel
  const pressed = orient === 'down';
  els.orientBtn?.setAttribute('aria-pressed', String(pressed));
  els.orientBtn?.querySelector('.arrow')?.classList.toggle('down', pressed);
  const lab = els.orientBtn?.querySelector('.arrow-label');
  if(lab) lab.textContent = pressed ? 'ON beneden' : 'ON boven';
  if(els.orientBtn){
    els.orientBtn.title = pressed ? 'Zet ON naar boven' : 'Zet ON naar beneden';
  }
}

function applyHFlipUI(){
  const h = getHFlip(); // 'ltr' | 'rtl'
  els.toggles.classList.toggle('h-rtl', h === 'rtl');

  // Knop status + pijl + titel
  const pressed = h === 'rtl';
  els.hflipBtn?.setAttribute('aria-pressed', String(pressed));
  els.hflipBtn?.querySelector('.arrow-h')?.classList.toggle('left', pressed);
  const lab = els.hflipBtn?.querySelector('.arrow-h-label');
  if(lab) lab.textContent = pressed ? 'Rechts → Links' : 'Links → Rechts';
  if(els.hflipBtn){
    els.hflipBtn.title = pressed ? 'Spiegel naar Links' : 'Spiegel naar Rechts';
  }

  // Nummerlabels meteen updaten (1→9 of 9→1)
  updateNumbers();
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

  renderDIPs(els.toggles);

  // Init verticale ON-richting + horizontale spiegeling
  applyOrientationUI();
  applyHFlipUI();     // zet ook meteen de juiste 1→9 / 9→1 labels

  // Live sync adres ↔ switches
  els.address?.addEventListener('input', syncFromAddress);

  // Startwaarde uit state (adres)
  if(els.address){
    els.address.value = state.getDip();
    syncFromAddress();
  }

  // Toggle knoppen
  els.orientBtn?.addEventListener('click', toggleOrientation);
  els.hflipBtn?.addEventListener('click', toggleHFlip);

  // Cross-tab sync
  state.onMessage(msg=>{
    if(msg?.type==='dip:update'){
      const v = msg.payload;
      if(els.address) els.address.value = v;
      setSwitchesFor(v, els.toggles);
    }
  });
}

/* ---------- start de pagina ---------- */
initDipswitch();
// of, als je expliciet wilt wachten op DOM:
// document.addEventListener('DOMContentLoaded', initDipswitch);
