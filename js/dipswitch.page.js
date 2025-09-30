// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

// 9 bits voor adres (1..512) → DIP-waarden 1..256 (bit 0..8)
const DIP_VALUES = [1,2,4,8,16,32,64,128,256];

function renderDIPs(container){
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

  // Live sync: elke wijziging aan de switches → adres bijwerken
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

  // Labels bijwerken voor alle zichtbare toggles
  const inputs = els.toggles?.querySelectorAll('input[type="checkbox"]') || [];
  inputs.forEach(inp=>{
    const id = inp.id;
    const lbl = els.toggles.querySelector(`#lbl-${id}`);
    if(lbl) lbl.textContent = inp.checked ? 'ON' : 'OFF';
  });

  state.setDip(addr1);
}

export function initDipswitch(){
  els = {
    address: $('#addr'),
    toggles: $('#dipwrap'),
  };

  renderDIPs(els.toggles);

  // Live sync beide kanten op
  els.address?.addEventListener('input', syncFromAddress);

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
