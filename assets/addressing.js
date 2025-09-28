import { $, $$, clamp, UNIVERSE_SIZE, toast, dlBlob, copyText, escapeHTML } from './core.js';
import state from './state.js';

/* ---------- UI helpers ---------- */
function universeColor(u){
  const hue = (u * 47) % 360, sat = 68, light = 28;
  return {
    bg: `hsla(${hue} ${sat}% ${light}% / 0.22)`,
    border: `hsl(${hue} ${sat}% ${light}%)`,
    dot: `hsl(${hue} ${sat}% ${Math.min(light+10,60)}%)`,
  };
}

/* ---------- New: library selection (typeahead) ---------- */
function makeTypeahead({input, listEl, getItems, onChoose, renderItem, placeholder}){
  let items=[]; let open=false; let activeIndex=-1; const MAX=20;
  input.setAttribute('autocomplete','off');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-expanded','false');
  if(placeholder) input.placeholder = placeholder;

  function close(){ open=false; listEl.style.display='none'; input.setAttribute('aria-expanded','false'); activeIndex=-1; }
  function openList(){ open=true; listEl.style.display='block'; input.setAttribute('aria-expanded','true'); }
  function render(){
    listEl.innerHTML='';
    if(items.length===0){ const d=document.createElement('div'); d.className='ta-empty'; d.textContent='No matches'; listEl.appendChild(d); return; }
    items.forEach((it,i)=>{
      const div=document.createElement('div');
      div.className='ta-item'; div.setAttribute('role','option'); div.dataset.index=i;
      div.innerHTML = renderItem? renderItem(it) : `<span>${escapeHTML(String(it))}</span>`;
      if(i===activeIndex) div.setAttribute('aria-selected','true');
      div.addEventListener('mouseenter', ()=> { activeIndex=i; updateActive(); });
      div.addEventListener('mousedown', (e)=> e.preventDefault());
      div.addEventListener('click', ()=> choose(i));
      listEl.appendChild(div);
    });
  }
  function updateActive(){
    $$('.ta-item', listEl).forEach((n,ix)=> n.setAttribute('aria-selected', ix===activeIndex ? 'true':'false'));
    const el = listEl.querySelector(`.ta-item[data-index="${activeIndex}"]`);
    if(el){ const r = el.getBoundingClientRect(); const p = listEl.getBoundingClientRect();
      if(r.bottom > p.bottom) listEl.scrollTop += (r.bottom - p.bottom);
      if(r.top < p.top) listEl.scrollTop -= (p.top - r.top);
    }
  }
  function choose(i){ const val = items[i]; if(!val) return; onChoose(val, input, close); }
  function toStr(it){ return typeof it==='string' ? it : (it.label || it.value || ''); }
  function doFilter(){
    const q = input.value.trim().toLowerCase();
    const src = getItems();
    const starts = src.filter(s=> toStr(s).toLowerCase().startsWith(q));
    const rest   = src.filter(s=> !toStr(s).toLowerCase().startsWith(q) && toStr(s).toLowerCase().includes(q));
    items = (q? starts.concat(rest) : src).slice(0, MAX);
    openList(); activeIndex = items.length ? 0 : -1; render();
  }
  input.addEventListener('input', doFilter);
  input.addEventListener('focus', ()=> { doFilter(); });
  input.addEventListener('keydown', (e)=>{
    if(!open){ if(e.key==='ArrowDown'){ doFilter(); e.preventDefault(); } return; }
    if(e.key==='ArrowDown'){ activeIndex = Math.min(activeIndex+1, items.length-1); updateActive(); e.preventDefault(); }
    else if(e.key==='ArrowUp'){ activeIndex = Math.max(activeIndex-1, 0); updateActive(); e.preventDefault(); }
    else if(e.key==='Enter'){ if(activeIndex>=0){ choose(activeIndex); e.preventDefault(); } }
    else if(e.key==='Escape'){ close(); }
  });
  document.addEventListener('click', (e)=>{ if(!listEl.parentElement.contains(e.target)) close(); });
  return { refresh: doFilter, close };
}

/* ---------- Addressing core ---------- */
function calcAddressing({start, universe, footprint, quantity, gap, resetMode, nameTemplate}){
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
    const name = typeof nameTemplate==='function' ? nameTemplate(i) : `Fixture ${i}`;
    rows.push({ index:i, name, universe:curU, address:curA, footprint, end, notes:'' });
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

/* ---------- Init ---------- */
export function initAddressing(){
  const els = {
    // nieuw (fixture selection)
    fxInput: $('#addr-fixture-input'),
    fxList:  $('#addr-fixture-list'),
    fxHint:  $('#addr-fixture-hint'),
    fxClear: $('#addr-fixture-clear'),
    fxChip:  $('#addr-fixture-chip'),

    // bestaande controls
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

  // --- Library data
  let fixtures = state.getLibrary();
  // selectie (optioneel)
  let selected = null; // { brand, model, mode, footprint }

  function selectionLabel(x){
    const brand = x.brand?.trim()||'';
    const model = x.model?.trim()||'';
    const mode  = x.mode?.trim()||'';
    const fp    = x.footprint ?? '?';
    const left  = `${brand} ${model}`.trim();
    const right = mode ? `${mode} • ${fp}ch` : `${fp}ch`;
    return { left, right };
  }

  // typeahead list items
  const getItems = ()=> fixtures
    .slice()
    .sort((a,b)=> (a.brand+a.model+a.mode).localeCompare(b.brand+b.model+b.mode))
    .map(x=>{
      const { left, right } = selectionLabel(x);
      return {
        value: `${x.brand} ${x.model}`,
        meta: { mode: x.mode||'', footprint: x.footprint||null, brand:x.brand||'', model:x.model||'' },
        label: `${left} — ${right}`,
        raw: x
      };
    });

  const ta = makeTypeahead({
    input: els.fxInput,
    listEl: els.fxList,
    getItems,
    renderItem: (it)=> {
      const left = escapeHTML(it.value);
      const right= escapeHTML(`${it.meta.mode||'–'} • ${it.meta.footprint??'?'}ch`);
      return `<span>${left}</span><span class="ta-tag">${right}</span>`;
    },
    onChoose: (it, input, close)=>{
      selected = {
        brand: it.raw.brand||'',
        model: it.raw.model||'',
        mode:  it.raw.mode||'',
        footprint: Number(it.raw.footprint)||null
      };
      input.value = `${selected.brand} ${selected.model}`;
      const { left, right } = selectionLabel(selected);
      els.fxHint.textContent = `${left} — ${right}`;
      els.fxChip.hidden = false;

      // footprint overschrijven vanuit keuze (gebruikers kunnen daarna nog aanpassen)
      if(selected.footprint){ els.foot.value = selected.footprint; }

      // opslaan in addr-state (extra keys toegestaan)
      const st = state.getAddr();
      st.selectedFixture = selected;
      state.setAddr(st);

      close();
    },
    placeholder: 'Search brand, model, mode…'
  });

  els.fxClear.addEventListener('click', ()=>{
    selected = null;
    els.fxInput.value = '';
    els.fxHint.textContent = 'No selection';
    els.fxChip.hidden = true;

    const st = state.getAddr();
    delete st.selectedFixture;
    state.setAddr(st);
  });

  // --- Generator
  function generate(){
    try{
      const footprint = Math.max(1, +els.foot.value||1);
      const useSel = !!selected && Number(selected?.footprint)||footprint;

      const nameTemplate = (i)=>{
        if(selected){
          const base = `${selected.brand} ${selected.model}`.trim();
          const mode = selected.mode ? ` (${selected.mode})` : '';
          return `${base}${mode} #${i}`;
        }
        return `Fixture ${i}`;
      };

      const rows = calcAddressing({
        start: +els.start.value || 1,
        universe: +els.univ.value || 1,
        footprint: selected?.footprint ? selected.footprint : footprint,
        quantity: Math.max(1, +els.qty.value||1),
        gap: Math.max(0, +els.gap.value||0),
        resetMode: els.mode.value,
        nameTemplate
      });
      renderAddressing(rows, els.tbody);

      // state bewaren, incl. selectie
      state.setAddr({
        start:+els.start.value, universe:+els.univ.value, footprint: selected?.footprint || +els.foot.value,
        quantity:+els.qty.value, gap:+els.gap.value, mode:els.mode.value,
        selectedFixture: selected || null
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

  // events
  els.gen.addEventListener('click', generate);
  els.exp.addEventListener('click', exportCSV);
  els.copy.addEventListener('click', copyTable);

  // restore state (incl. fixture selection)
  const st = state.getAddr() || {};
  if(st.start) els.start.value = st.start;
  if(st.universe) els.univ.value = st.universe;
  if(st.footprint) els.foot.value = st.footprint;
  if(st.quantity) els.qty.value = st.quantity;
  if(Number.isFinite(st.gap)) els.gap.value = st.gap;
  if(st.mode) els.mode.value = st.mode;

  if(st.selectedFixture){
    selected = st.selectedFixture;
    els.fxInput.value = `${selected.brand||''} ${selected.model||''}`.trim();
    const { left, right } = selectionLabel(selected);
    els.fxHint.textContent = `${left} — ${right}`;
    els.fxChip.hidden = false;
    if(selected.footprint){ els.foot.value = selected.footprint; }
  }

  generate();

  // luister naar updates (multi-tab)
  state.onMessage(msg=>{
    if(msg?.type==='addr:update'){
      const s = msg.payload||{};
      if(s.start) els.start.value = s.start;
      if(s.universe) els.univ.value = s.universe;
      if(s.footprint) els.foot.value = s.footprint;
      if(s.quantity) els.qty.value = s.quantity;
      if(Number.isFinite(s.gap)) els.gap.value = s.gap;
      if(s.mode) els.mode.value = s.mode;
      if(s.selectedFixture){
        selected = s.selectedFixture;
        els.fxInput.value = `${selected.brand||''} ${selected.model||''}`.trim();
        const { left, right } = selectionLabel(selected);
        els.fxHint.textContent = `${left} — ${right}`;
        els.fxChip.hidden = false;
      }
      generate();
    }
  });

  // shortcuts
  window.addEventListener('keydown',(e)=>{
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if(e.key==='g' || e.key==='G') els.gen.click();
    if(e.key==='e' || e.key==='E') els.exp.click();
    if(e.key==='c' || e.key==='C') els.copy.click();
  });
}
