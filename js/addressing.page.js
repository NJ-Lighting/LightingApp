import { $, $$, clamp, UNIVERSE_SIZE, toast, dlBlob, copyText, escapeHTML } from './core.js';
import state from './state.js';

/* ---------- Helpers ---------- */
function universeColor(u){
  const hue = (u * 47) % 360, sat = 68, light = 28;
  return {
    bg: `hsla(${hue} ${sat}% ${light}% / 0.22)`,
    border: `hsl(${hue} ${sat}% ${light}%)`,
    dot: `hsl(${hue} ${sat}% ${Math.min(light+10,60)}%)`,
  };
}

function makeTypeahead({input, listEl, getItems, onChoose, renderItem, placeholder}){
  if(!input || !listEl) return { refresh: ()=>{}, close: ()=>{} };
  let items=[]; let open=false; let activeIndex=-1; const MAX=20;
  input.setAttribute('autocomplete','off');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-expanded','false');
  if(placeholder) input.placeholder = placeholder;

  function close(){ open=false; listEl.style.display='none'; input.setAttribute('aria-expanded','false'); activeIndex=-1; }
  function openList(){ open=true; listEl.style.display='block'; input.setAttribute('aria-expanded','true'); }
  function render(){
    listEl.innerHTML='';
    if(items.length===0){
      const d=document.createElement('div');
      d.className='ta-empty';
      d.textContent='No matches';
      listEl.appendChild(d);
      return;
    }
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
    if(el){
      const r = el.getBoundingClientRect(); const p = listEl.getBoundingClientRect();
      if(r.bottom > p.bottom) listEl.scrollTop += (r.bottom - p.bottom);
      if(r.top < p.top) listEl.scrollTop -= (p.top - r.top);
    }
  }
  function choose(i){ const val = items[i]; if(!val) return; onChoose?.(val, input, close); }
  function toStr(it){ return typeof it==='string' ? it : (it.label || it.value || ''); }
  function doFilter(){
    const q = input.value.trim().toLowerCase();
    const src = (getItems?.() || []);
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

/* ---------- Address calculation ---------- */
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
    rows.push({ index:0, name, universe:curU, address:curA, footprint, end, notes:'' });
    curA = end + 1 + gap;
  }
  return rows;
}

/* ---------- Main ---------- */
export function initAddressing(){
  const els = {
    fxInput: $('#addr-fixture-input'),
    fxList:  $('#addr-fixture-list'),
    fxQty:   $('#addr-fixture-qty'),
    fxAdd:   $('#addr-fixture-add'),
    planWrap:$('#addr-plan-wrap'),
    planTable:$('#addr-plan-table tbody'),
    planClear:$('#addr-plan-clear'),

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

  if(!els.tbody){
    console.warn('[Addressing] Missing required table body #addr-table tbody');
    return;
  }

  // --- library dataset for typeahead
  const fixturesLib = () => {
    try { return state.getLibrary() || []; } catch { return []; }
  };

  // selection buffer (what’s in the typeahead input right now)
  let selectedBuf = null; // {brand, model, mode, footprint}

  function planFromState(){
    const st = state.getAddr() || {};
    return Array.isArray(st.plan) ? st.plan : [];
  }
  function savePlan(plan){
    const st = state.getAddr() || {};
    st.plan = plan;
    state.setAddr(st);
  }

  // Build typeahead items
  const getItems = ()=> fixturesLib()
    .slice()
    .sort((a,b)=> (a.brand+a.model+a.mode).localeCompare(b.brand+b.model+b.mode))
    .map(x=>{
      const labelLeft = `${(x.brand||'').trim()} ${(x.model||'').trim()}`.trim();
      const labelRight = `${x.mode||'–'} • ${x.footprint??'?'}ch`;
      return {
        value: `${x.brand||''} ${x.model||''}`.trim(),
        meta: { mode: x.mode||'', footprint: x.footprint||null, brand:x.brand||'', model:x.model||'' },
        label: `${labelLeft} — ${labelRight}`,
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
      selectedBuf = {
        brand: it.raw.brand||'',
        model: it.raw.model||'',
        mode:  it.raw.mode||'',
        footprint: Number(it.raw.footprint)||null
      };
      if(input) input.value = `${selectedBuf.brand} ${selectedBuf.model}`.trim();
      close?.();
    },
    placeholder: 'Search brand, model, mode…'
  });

  function renderPlan(){
    const plan = planFromState();
    if(els.planWrap) els.planWrap.style.display = plan.length ? 'block' : 'none';
    if(!els.planTable) return;
    els.planTable.innerHTML = '';
    plan.forEach((p, idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${escapeHTML(`${p.brand||''} ${p.model||''}`.trim())}</td>
        <td>${escapeHTML(p.mode||'–')}</td>
        <td>${p.footprint??'?'} ch</td>
        <td>
          <div class="row" style="gap:6px; align-items:center">
            <button class="btn-ghost" data-act="dec" data-i="${idx}" type="button">–</button>
            <input data-i="${idx}" data-role="qty" value="${Math.max(1, Number(p.quantity)||1)}" type="number" min="1" style="width:64px" />
            <button class="btn-ghost" data-act="inc" data-i="${idx}" type="button">+</button>
          </div>
        </td>
        <td>
          <div class="row" style="gap:6px; align-items:center">
            <button class="btn-ghost" data-act="up" data-i="${idx}"   type="button">↑</button>
            <button class="btn-ghost" data-act="down" data-i="${idx}" type="button">↓</button>
            <button data-act="del" data-i="${idx}" type="button">Remove</button>
          </div>
        </td>
      `;
      els.planTable.appendChild(tr);
    });
  }

  function addToPlan(sel, qty){
    if(!sel){ toast('Select a fixture from Library first','warning'); return; }
    const q = Math.max(1, Number(qty)||1);
    const plan = planFromState();
    const ix = plan.findIndex(p => p.brand===sel.brand && p.model===sel.model && p.mode===sel.mode && (p.footprint||null)===(sel.footprint||null));
    if(ix>=0){ plan[ix].quantity += q; }
    else{
      plan.push({
        brand: sel.brand||'',
        model: sel.model||'',
        mode:  sel.mode||'',
        footprint: Number(sel.footprint)||null,
        quantity: q
      });
    }
    savePlan(plan);
    renderPlan();
    toast('Added to plan','success');
  }

  els.fxAdd?.addEventListener('click', ()=> addToPlan(selectedBuf, els.fxQty?.value));

  els.planClear?.addEventListener('click', ()=>{
    savePlan([]);
    renderPlan();
  });

  // Plan table interactions
  $('#addr-plan-table')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const i = Number(btn.dataset.i);
    const plan = planFromState();
    if(!Number.isInteger(i) || i<0 || i>=plan.length) return;

    if(btn.dataset.act==='del'){ plan.splice(i,1); savePlan(plan); renderPlan(); return; }
    if(btn.dataset.act==='up' && i>0){ const t=plan[i]; plan[i]=plan[i-1]; plan[i-1]=t; savePlan(plan); renderPlan(); return; }
    if(btn.dataset.act==='down' && i<plan.length-1){ const t=plan[i]; plan[i]=plan[i+1]; plan[i+1]=t; savePlan(plan); renderPlan(); return; }
    if(btn.dataset.act==='inc'){ plan[i].quantity = (Number(plan[i].quantity)||1) + 1; savePlan(plan); renderPlan(); return; }
    if(btn.dataset.act==='dec'){ plan[i].quantity = Math.max(1, (Number(plan[i].quantity)||1) - 1); savePlan(plan); renderPlan(); return; }
  });

  $('#addr-plan-table')?.addEventListener('input', (e)=>{
    const inp = e.target;
    if(inp?.dataset?.role==='qty'){
      const i = Number(inp.dataset.i);
      const plan = planFromState();
      if(Number.isInteger(i) && plan[i]){
        plan[i].quantity = Math.max(1, Number(inp.value)||1);
        savePlan(plan);
      }
    }
  });

  /* ---------- Output table renderers ---------- */
  function renderAddressing(rows){
    els.tbody.innerHTML = '';
    rows.forEach((r, idx)=>{
      r.index = idx+1;
      const tr = document.createElement('tr');
      const col = universeColor(r.universe);
      tr.dataset.uni = r.universe;
      tr.style.setProperty('--uni-bg', col.bg);
      tr.style.setProperty('--uni-border', col.border);
      tr.style.setProperty('--uni-dot', col.dot);

      tr.innerHTML = `
        <td class="idx">${r.index}</td>
        <td class="name" contenteditable="plaintext-only" spellcheck="false">${escapeHTML(r.name||'')}</td>
        <td class="universe uni-cell" contenteditable="plaintext-only"><span class="uni-dot"></span><span>${r.universe}</span></td>
        <td class="address" contenteditable="plaintext-only">${r.address}</td>
        <td>${r.footprint}</td>
        <td>${r.end}</td>
        <td class="notes" contenteditable="plaintext-only">${escapeHTML(r.notes||'')}</td>
      `;
      // keep numeric-only for universe/address
      tr.querySelector('.universe')?.addEventListener('input', e=>{
        e.target.textContent = e.target.textContent.replace(/[^0-9]/g,'');
      });
      tr.querySelector('.address')?.addEventListener('input', e=>{
        e.target.textContent = e.target.textContent.replace(/[^0-9]/g,'');
      });
      els.tbody.appendChild(tr);
    });
  }

  function getRowsFromTable(){
    return [...els.tbody.querySelectorAll('tr')].map(tr=>{
      const txt = (sel) => tr.querySelector(sel)?.textContent?.trim() ?? '';
      const toInt = (sel,def) => {
        const v = parseInt(txt(sel),10);
        return Number.isFinite(v)?v:def;
      };
      return {
        index: toInt('.idx',0),
        name: txt('.name'),
        universe: toInt('.universe',1),
        address: toInt('.address',1),
        footprint: toInt('td:nth-child(5)',1),
        end: toInt('td:nth-child(6)',1),
        notes: txt('.notes'),
      };
    });
  }

  /* ---------- Generate logic ---------- */
  function generate(){
    try{
      const start = +(els.start?.value ?? 1) || 1;
      const universe = +(els.univ?.value ?? 1) || 1;
      const resetMode = els.mode?.value || 'reset';
      const gap = Math.max(0, +(els.gap?.value ?? 0) || 0);

      const plan = planFromState();
      let rows = [];
      let nextStart = start;
      let nextUniverse = universe;
      let globalIndex = 1;

      if(plan.length){
        for(const p of plan){
          const fp = Math.max(1, Number(p.footprint)||1);
          const qty = Math.max(1, Number(p.quantity)||1);

          const localNameTemplate = (i)=> {
            const base = `${p.brand||''} ${p.model||''}`.trim();
            const mode = p.mode ? ` (${p.mode})` : '';
            return `${base}${mode} #${globalIndex + i - 1}`;
          };

          const part = calcAddressing({
            start: nextStart,
            universe: nextUniverse,
            footprint: fp,
            quantity: qty,
            gap,
            resetMode,
            nameTemplate: localNameTemplate
          });

          if(part.length){
            const last = part[part.length-1];
            nextStart = last.end + 1 + gap;
            nextUniverse = last.universe;
            if(nextStart > UNIVERSE_SIZE){
              if(resetMode==='reset'){ nextStart = 1; nextUniverse += 1; }
              else{
                nextStart = (nextStart - 1) - UNIVERSE_SIZE + 1;
                nextUniverse += 1;
                if(nextStart > UNIVERSE_SIZE){ nextStart = 1; }
              }
            }
          }

          globalIndex += qty;
          rows = rows.concat(part);
        }
      }else{
        const fp = Math.max(1, +(els.foot?.value ?? 1) || 1);
        const qty = Math.max(1, +(els.qty?.value ?? 1) || 1);
        rows = calcAddressing({
          start, universe, footprint: fp, quantity: qty, gap, resetMode,
          nameTemplate: (i)=> `Fixture ${i}`
        });
      }

      renderAddressing(rows);

      // Save state (including plan)
      state.setAddr({
        start:+(els.start?.value ?? 1),
        universe:+(els.univ?.value ?? 1),
        footprint:+(els.foot?.value ?? 1),
        quantity:+(els.qty?.value ?? 1),
        gap:+(els.gap?.value ?? 0),
        mode:els.mode?.value ?? 'reset',
        plan: plan
      });

    }catch(err){
      toast(err.message || 'Error generating','error');
    }
  }

  function exportCSV(){
    const rows = getRowsFromTable();
    const head = ['#','Name','Universe','Address','Footprint','End','Notes'];
    const csv = [head.join(',')].concat(
      rows.map(r=>[
        r.index,
        `"${String(r.name||'').replace(/"/g,'""')}"`,
        r.universe,
        r.address,
        r.footprint,
        r.end,
        `"${String(r.notes||'').replace(/"/g,'""')}"`
      ].join(','))
    ).join('\r\n');
    dlBlob('patch.csv', new Blob([csv], {type:'text/csv;charset=utf-8'}));
  }

  function copyTable(){
    const rows = getRowsFromTable();
    const txt = rows.map(r=>`${r.index}\t${r.name}\tU${r.universe}\t@${r.address}\t${r.footprint}ch\tend ${r.end}\t${r.notes}`).join('\n');
    copyText(txt)
      .then(()=> toast('Copied table to clipboard','success'))
      .catch(()=> alert('Copy failed'));
  }

  // events
  els.gen?.addEventListener('click', generate);
  els.exp?.addEventListener('click', exportCSV);
  els.copy?.addEventListener('click', copyTable);

  // restore state
  const st = state.getAddr() || {};
  if(st.start != null && els.start) els.start.value = st.start;
  if(st.universe != null && els.univ) els.univ.value = st.universe;
  if(st.footprint != null && els.foot) els.foot.value = st.footprint;
  if(st.quantity != null && els.qty) els.qty.value = st.quantity;
  if(Number.isFinite(st.gap) && els.gap) els.gap.value = st.gap;
  if(st.mode && els.mode) els.mode.value = st.mode;
  renderPlan();

  // initial render
  generate();

  // cross-tab sync
  state.onMessage(msg=>{
    if(msg?.type==='addr:update'){
      const s = msg.payload||{};
      if(s.start != null && els.start) els.start.value = s.start;
      if(s.universe != null && els.univ) els.univ.value = s.universe;
      if(s.footprint != null && els.foot) els.foot.value = s.footprint;
      if(s.quantity != null && els.qty) els.qty.value = s.quantity;
      if(Number.isFinite(s.gap) && els.gap) els.gap.value = s.gap;
      if(s.mode && els.mode) els.mode.value = s.mode;
      renderPlan();
      generate();
    }
  });

  // shortcuts
  window.addEventListener('keydown',(e)=>{
    const tag = document.activeElement?.tagName;
    if (tag && ['INPUT','SELECT','TEXTAREA'].includes(tag)) return;
    if(e.key==='g' || e.key==='G') els.gen?.click();
    if(e.key==='e' || e.key==='E') els.exp?.click();
    if(e.key==='c' || e.key==='C') els.copy?.click();
  });
}
