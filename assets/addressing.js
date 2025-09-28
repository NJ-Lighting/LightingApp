import { $, $$, clamp, UNIVERSE_SIZE, toast, dlBlob, copyText } from './core.js';
import state from './state.js';

function universeColor(u){
  const hue = (u * 47) % 360, sat = 68, light = 28;
  return {
    bg: `hsla(${hue} ${sat}% ${light}% / 0.22)`,
    border: `hsl(${hue} ${sat}% ${light}%)`,
    dot: `hsl(${hue} ${sat}% ${Math.min(light+10,60)}%)`,
  };
}

function calcAddressing({start, universe, footprint, quantity, gap, resetMode}){
  if(footprint > UNIVERSE_SIZE){
    throw new Error('Footprint groter dan 512 (universe size).');
  }
  const rows=[];
  let curA = clamp(start,1,UNIVERSE_SIZE);
  let curU = Math.max(1, universe);
  for(let i=1;i<=quantity;i++){
    if(curA + footprint - 1 > UNIVERSE_SIZE){
      curU += 1;
      if(resetMode==='reset'){
        curA = 1;
      }else{
        curA = (curA + footprint - 1) - UNIVERSE_SIZE + 1;
        if(curA + footprint - 1 > UNIVERSE_SIZE) curA = 1;
      }
    }
    const end = curA + footprint - 1;
    rows.push({ index:i, name:`Fixture ${i}`, universe:curU, address:curA, footprint, end, notes:'' });
    curA = end + 1 + gap;
  }
  return rows;
}

function renderAddressing(rows, tbody){
  tbody.innerHTML = '';
  for(const r of rows){
    const tr = document.createElement('tr');
    const col = universeColor(r.universe);
    tr.dataset.uni = r.universe;
    tr.style.setProperty('--uni-bg', col.bg);
    tr.style.setProperty('--uni-border', col.border);
    tr.style.setProperty('--uni-dot', col.dot);

    tr.innerHTML = `
      <td class="idx">${r.index}</td>
      <td class="name" contenteditable="plaintext-only" spellcheck="false">${r.name}</td>
      <td class="universe uni-cell" contenteditable="plaintext-only"><span class="uni-dot"></span><span>${r.universe}</span></td>
      <td class="address" contenteditable="plaintext-only">${r.address}</td>
      <td>${r.footprint}</td>
      <td>${r.end}</td>
      <td class="notes" contenteditable="plaintext-only">${r.notes}</td>
    `;
    tr.querySelector('.universe').addEventListener('input', e=>{ e.target.textContent = e.target.textContent.replace(/[^0-9]/g,''); });
    tr.querySelector('.address').addEventListener('input', e=>{ e.target.textContent = e.target.textContent.replace(/[^0-9]/g,''); });
    tbody.appendChild(tr);
  }
}

function getRowsFromTable(tbody){
  return [...tbody.querySelectorAll('tr')].map(tr=>{
    const toInt = (sel,def) => {
      const v = parseInt(tr.querySelector(sel)?.textContent.trim()||def,10);
      return Number.isFinite(v)?v:def;
    };
    return {
      index: toInt('.idx',0),
      name: tr.querySelector('.name')?.textContent.trim()||'',
      universe: toInt('.universe',1),
      address: toInt('.address',1),
      footprint: toInt('td:nth-child(5)',1),
      end: toInt('td:nth-child(6)',1),
      notes: tr.querySelector('.notes')?.textContent.trim()||'',
    };
  });
}

export function initAddressing(){
  const els = {
    start: $('#addr-start'),
    univ: $('#addr-universe'),
    foot: $('#addr-footprint'),
    qty: $('#addr-quantity'),
    gap: $('#addr-gap'),
    mode: $('#addr-mode'),
    tbody: $('#addr-table tbody'),
    gen: $('#addr-generate'),
    exp: $('#addr-export'),
    copy: $('#addr-copy'),
  };

  function generate(){
    try{
      const rows = calcAddressing({
        start: +els.start.value || 1,
        universe: +els.univ.value || 1,
        footprint: Math.max(1, +els.foot.value||1),
        quantity: Math.max(1, +els.qty.value||1),
        gap: Math.max(0, +els.gap.value||0),
        resetMode: els.mode.value
      });
      renderAddressing(rows, els.tbody);
      state.setAddr({
        start:+els.start.value, universe:+els.univ.value, footprint:+els.foot.value,
        quantity:+els.qty.value, gap:+els.gap.value, mode:els.mode.value
      });
    }catch(err){
      toast(err.message || 'Error generating','error');
    }
  }

  function exportCSV(){
    const rows = getRowsFromTable(els.tbody);
    const head = ['#','Name','Universe','Address','Footprint','End','Notes'];
    const csv = [head.join(',')].concat(
      rows.map(r=>[r.index,r.name,r.universe,r.address,r.footprint,r.end, `"${(r.notes||'').replace(/"/g,'""')}"`].join(','))
    ).join('\r\n');
    dlBlob('patch.csv', new Blob([csv], {type:'text/csv;charset=utf-8'}));
  }

  function copyTable(){
    const rows = getRowsFromTable(els.tbody);
    const txt = rows.map(r=>`${r.index}\t${r.name}\tU${r.universe}\t@${r.address}\t${r.footprint}ch\tend ${r.end}\t${r.notes}`).join('\n');
    copyText(txt).then(()=> toast('Copied table to clipboard','success')).catch(()=> alert('Copy failed'));
  }

  els.gen.addEventListener('click', generate);
  els.exp.addEventListener('click', exportCSV);
  els.copy.addEventListener('click', copyTable);

  const st = state.getAddr();
  if(st.start) els.start.value = st.start;
  if(st.universe) els.univ.value = st.universe;
  if(st.footprint) els.foot.value = st.footprint;
  if(st.quantity) els.qty.value = st.quantity;
  if(Number.isFinite(st.gap)) els.gap.value = st.gap;
  if(st.mode) els.mode.value = st.mode;

  generate();

  state.onMessage(msg=>{
    if(msg?.type==='addr:update'){
      const s = msg.payload||{};
      if(s.start) els.start.value = s.start;
      if(s.universe) els.univ.value = s.universe;
      if(s.footprint) els.foot.value = s.footprint;
      if(s.quantity) els.qty.value = s.quantity;
      if(Number.isFinite(s.gap)) els.gap.value = s.gap;
      if(s.mode) els.mode.value = s.mode;
      generate();
    }
  });

  window.addEventListener('keydown',(e)=>{
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if(e.key==='g' || e.key==='G') els.gen.click();
    if(e.key==='e' || e.key==='E') els.exp.click();
    if(e.key==='c' || e.key==='C') els.copy.click();
  });
}
