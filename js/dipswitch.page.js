// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

// 9 bits voor adres (1..512) → 1..256 zijn de DIP-waarden (bit 0..8)
// Terminator is een 10e schakelaar (geen invloed op adres), wordt apart gerenderd als optie.
const DIP_VALUES = [1,2,4,8,16,32,64,128,256];

function renderDIPs(container, withTerminator = false){
  if(!container) return;
  container.innerHTML = '';

  // Adres-switches 1..9
  DIP_VALUES.forEach((v)=>{
    const id = `sw-${v}`;
    const el = document.createElement('div');
    el.className = 'dip';
    el.innerHTML = `
      <div class="num">${v}</div>
      <label class="toggle" for="${id}">
        <input type="checkbox" id="${id}" data-val="${v}" aria-label="Switch ${v}" />
        <span class="knob" aria-hidden="true"></span>
        <span class="legend on" aria-hidden="true">ON</span>
        <span class="legend off" aria-hidden="true">OFF</span>
      </label>
      <div class="value" id="lbl-${id}">OFF</div>
    `;
    container.appendChild(el);
  });

  // Optionele Terminator (10) – geen invloed op adresberekening
  if(withTerminator){
    const id = `sw-term`;
    const el = document.createElement('div');
    el.className = 'dip';
    el.innerHTML = `
      <div class="num">T</div>
      <label class="toggle" for="${id}">
        <input type="checkbox" id="${id}" data-val="term" aria-label="Terminator (10)" />
        <span class="knob" aria-hidden="true"></span>
        <span class="legend on" aria-hidden="true">ON</span>
        <span class="legend off" aria-hidden="true">OFF</span>
      </label>
      <div class="value" id="lbl-${id}">OFF</div>
    `;
    container.appendChild(el);
  }

  container.addEventListener('change', syncFromSwitches);
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

  // Terminator wordt niet automatisch gezet door adres
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

let els = null;

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

  // Labels bijwerken voor alle zichtbare toggles (incl. terminator indien aanwezig)
  const inputs = els.toggles?.querySelectorAll('input[type="checkbox"]') || [];
  inputs.forEach(inp=>{
    const id = inp.id;
    const lbl = els.toggles.querySelector(`#lbl-${id}`);
    if(lbl) lbl.textContent = inp.checked ? 'ON' : 'OFF';
  });

  state.setDip(addr1);
}

// Terminator UI tonen/verbergen en waarde toepassen
function applyTerminatorMode(){
  if(!els) return;
  const mode = els.terminator?.value || 'ignore'; // 'ignore' | 'on' | 'off'

  // Herteken DIP UI met/zonder terminator switch
  renderDIPs(els.toggles, mode !== 'ignore');

  // Adres opnieuw naar switches pushen
  syncFromAddress();

  // Als terminator zichtbaar is, zet hem aan/uit volgens mode
  if(mode !== 'ignore'){
    const term = $('#sw-term');
    const lbl = $('#lbl-sw-term');
    if(term){
      term.checked = (mode === 'on');
      if(lbl) lbl.textContent = term.checked ? 'ON' : 'OFF';
    }
  }
}

export function initDipswitch(){
  els = {
    // Aansluiten op pages/dipswitch.html
    address: $('#addr'),
    toggles: $('#dipwrap'),
    apply: $('#calc'),
    clear: $('#fromDip'),
    terminator: $('#terminator'),
  };

  // Eerste render: respecteer huidige terminator select (default 'ignore')
  applyTerminatorMode();

  // Knoppen
  els.apply?.addEventListener('click', syncFromAddress);
  els.clear?.addEventListener('click', ()=>{
    if(els.address) els.address.value = 1;

    // Zet alle adres-switches uit
    DIP_VALUES.forEach(v=>{
      const input = els.toggles?.querySelector?.(`#sw-${v}`);
      if(input){ input.checked = false; }
      const lbl = els.toggles?.querySelector?.(`#lbl-sw-${v}`);
      if(lbl){ lbl.textContent = 'OFF'; }
    });

    // Terminator respecteert de huidige select-keuze (aan/uit of verborgen)
    if(els.terminator?.value !== 'ignore'){
      const term = $('#sw-term');
      const lblt = $('#lbl-sw-term');
      if(term){ term.checked = (els.terminator.value === 'on'); }
      if(lblt){ lblt.textContent = term?.checked ? 'ON' : 'OFF'; }
    }

    state.setDip(1);
  });

  // Numerieke input
  els.address?.addEventListener('input', syncFromAddress);

  // Terminator-modus (Negeer/Aan/Uit)
  els.terminator?.addEventListener('change', applyTerminatorMode);

  // Startwaarde uit state (adres)
  if(els.address){
    els.address.value = state.getDip();
    syncFromAddress();
  }

  // Cross-tab sync
  state.onMessage(msg=>{
    if(msg?.type==='dip:update'){
      const v = msg.payload;
      if(els.address) els.address.value = v;
      setSwitchesFor(v, els.toggles);
    }
  });
}
