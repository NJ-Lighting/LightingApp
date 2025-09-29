// js/dipswitch.page.js
import { $ } from './core.js';
import state from './state.js';

const DIP_VALUES = [1,2,4,8,16,32,64,128,256];

function renderDIPs(container){
  container.innerHTML='';
  DIP_VALUES.forEach((v)=>{
    const id = `sw-${v}`;
    const el = document.createElement('div');
    el.className='dip';
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
  container.addEventListener('change', syncFromSwitches);
}

function setSwitchesFor(addr, container){
  const bitsTarget = Math.max(1, Math.min(512, addr)) - 1;
  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    const on = (bitsTarget & v) === v;
    input.checked = on;
    container.querySelector(`#lbl-sw-${v}`).textContent = on ? 'ON' : 'OFF';
  });
}

function switchesValue(container){
  let mask = 0;
  DIP_VALUES.forEach(v=>{
    const input = container.querySelector(`#sw-${v}`);
    if(input.checked) mask |= v;
  });
  return (mask & 0x1FF) + 1;
}

let els;

function syncFromAddress(){
  const a = Math.max(1, Math.min(512, +els.address.value||1));
  setSwitchesFor(a, els.toggles);
  state.setDip(a);
}

function syncFromSwitches(){
  const addr1 = switchesValue(els.toggles);
  els.address.value = addr1;
  DIP_VALUES.forEach(v=>{
    const input = els.toggles.querySelector(`#sw-${v}`);
    els.toggles.querySelector(`#lbl-sw-${v}`).textContent = input.checked ? 'ON' : 'OFF';
  });
  state.setDip(addr1);
}

export function initDipswitch(){
  els = {
    // ⬇️ Aansluiten op jouw pages/dipswitch.html
    address: $('#addr'),
    toggles: $('#dipwrap'),
    apply: $('#calc'),
    clear: $('#fromDip'),
  };

  renderDIPs(els.toggles);

  els.apply.addEventListener('click', syncFromAddress);
  els.clear.addEventListener('click', ()=>{
    els.address.value = 1;
    DIP_VALUES.forEach(v=>{
      const input = els.toggles.querySelector(`#sw-${v}`);
      input.checked=false;
      els.toggles.querySelector(`#lbl-sw-${v}`).textContent = 'OFF';
    });
    state.setDip(1);
  });
  els.address.addEventListener('input', syncFromAddress);

  els.address.value = state.getDip();
  syncFromAddress();

  state.onMessage(msg=>{
    if(msg?.type==='dip:update'){
      const v = msg.payload;
      els.address.value = v;
      setSwitchesFor(v, els.toggles);
    }
  });
}
