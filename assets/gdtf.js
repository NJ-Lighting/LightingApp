import { $, $$, toast, escapeHTML } from './core.js';
import state from './state.js';

const GDTF_BASE = '/api/gdtf';

function setStatus(msg, kind='info'){
  const el = $('#gdtf-status');
  const colors = {info:'#1f2a3a', ok:'#16a34a', warn:'#f59e0b', err:'#ef4444'};
  el.textContent = msg;
  el.style.borderColor = colors[kind] || colors.info;
}

function normalizeModes(modes){
  return (Array.isArray(modes)?modes:[]).map(m=>{
    if(m && typeof m==='object'){
      if('name' in m && 'dmxfootprint' in m) return {name:m.name, dmxfootprint:Number(m.dmxfootprint)||null};
      const inner = m['0'] || m[0];
      if(inner && typeof inner==='object') return {name: inner.name, dmxfootprint: Number(inner.dmxfootprint)||null};
    }
    return {name:'', dmxfootprint:null};
  });
}

let g = {
  loggedIn:false, list:[], filtered:[],
  index: { byManu:new Map(), fixturesByManu:new Map(), manus:[], globalFixtures:[] },
  sort: { key:null, dir:'asc' },
  manuSelected:'', fixSelected:''
};

function buildIndexes(){
  g.index.byManu = new Map();
  g.index.fixturesByManu = new Map();

  const globalSet = new Set();
  for(const rec of g.list){
    const manu = (rec.manufacturer||'').trim();
    const fix = (rec.fixture||'').trim();
    if(!g.index.byManu.has(manu)) g.index.byManu.set(manu, []);
    g.index.byManu.get(manu).push(rec);
    if(!g.index.fixturesByManu.has(manu)) g.index.fixturesByManu.set(manu, new Set());
    if(fix){
      g.index.fixturesByManu.get(manu).add(fix);
      globalSet.add(`${fix}|||${manu}`);
    }
  }
  g.index.manus = Array.from(g.index.byManu.keys()).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  g.index.globalFixtures = Array.from(globalSet).map(key=>{
    const [fixture, manufacturer] = key.split('|||');
    return { fixture, manufacturer };
  }).sort((a,b)=> (a.fixture+a.manufacturer).localeCompare(b.fixture+b.manufacturer));
}

function applySort(rows){
  const { key, dir } = g.sort;
  if(!key) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  const collator = new Intl.Collator(undefined, { sensitivity:'base', numeric:true });
  return rows.slice().sort((a,b)=>{
    const A = (a[key]||'').toString();
    const B = (b[key]||'').toString();
    return sign * collator.compare(A, B);
  });
}
function updateSortHeaderUI(){
  $$('#gdtf-table thead th.sortable').forEach(th=> th.setAttribute('aria-sort','none'));
  if(!g.sort.key) return;
  const th = $(`#gdtf-table thead th.sortable[data-sort="${g.sort.key}"]`);
  if(th) th.setAttribute('aria-sort', g.sort.dir === 'asc' ? 'ascending' : 'descending');
}

function renderTable(rows){
  const tbody = $('#gdtf-table tbody');
  const sorted = applySort(rows);
  tbody.innerHTML = '';
  sorted.forEach(rec=>{
    const tr = document.createElement('tr');
    const modes = normalizeModes(rec.modes);
    const modesHtml = modes.length
      ? modes.map(md=> `<div class="badge" style="display:inline-block; margin:2px 4px 2px 0">${escapeHTML(md.name||'–')} • ${md.dmxfootprint??'?'}ch</div>`).join('')
      : '<span class="muted">–</span>';
    const size = rec.filesize ? (Math.round(rec.filesize/1024)+' KB'):'–';
    const rating = rec.rating!=null ? Number(rec.rating).toFixed(1) : '–';
    tr.innerHTML = `
      <td>${escapeHTML(rec.manufacturer||'')}</td>
      <td>${escapeHTML(rec.fixture||'')}</td>
      <td>${escapeHTML(rec.revision||'')}</td>
      <td>${modesHtml}</td>
      <td>${rating}</td>
      <td>${size}</td>
      <td style="min-width:220px;">
        <div class="row" style="gap:6px">
          <select data-rid="${rec.rid}" class="gdtf-modepick">
            <option value="">Pick mode…</option>
            ${modes.map((md,i)=> `<option value="${i}">${md.name||'Mode'} • ${md.dmxfootprint??'?'}ch</option>`).join('')}
          </select>
          <button data-act="add" data-rid="${rec.rid}">Add to Library</button>
          <button data-act="dl" data-rid="${rec.rid}">Download</button>
        </div>
        <div class="muted" style="margin-top:6px">RID: ${rec.rid} • UUID: ${escapeHTML(rec.uuid||'')}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  $('#gdtf-count').textContent = `${sorted.length} result${sorted.length===1?'':'s'}`;
  updateSortHeaderUI();
}

function filterBySelections(){
  let rows = g.list;
  const m = g.manuSelected;
  const f = g.fixSelected;
  if(m) rows = rows.filter(r => (r.manufacturer||'') === m);
  if(f) rows = rows.filter(r => (r.fixture||'') === f);
  g.filtered = rows; renderTable(rows);
}

function setupTypeaheads(){
  const manuInput = $('#gdtf-manu-input');
  const manuList = $('#gdtf-manu-list');
  const fixInput = $('#gdtf-fixture-input');
  const fixList = $('#gdtf-fixture-list');

  function makeTypeahead({input, listEl, getItems, onChoose, renderItem, placeholder}){
    let items=[]; let open=false; let activeIndex=-1; const MAX=20;
    input.setAttribute('autocomplete','off');
    input.setAttribute('role','combobox');
    input.setAttribute('aria-expanded','false');
    input.placeholder = placeholder || 'Type…';

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
      Array.from(listEl.querySelectorAll('.ta-item')).forEach((n,ix)=> n.setAttribute('aria-selected', ix===activeIndex ? 'true':'false'));
      const el = listEl.querySelector(`.ta-item[data-index="${activeIndex}"]`);
      if(el){ const r = el.getBoundingClientRect(); const p = listEl.getBoundingClientRect();
        if(r.bottom > p.bottom) listEl.scrollTop += (r.bottom - p.bottom);
        if(r.top < p.top) listEl.scrollTop -= (p.top - r.top);
      }
    }
    function choose(i){ const val = items[i]; if(!val) return; onChoose(val, input, close); }
    function doFilter(){
      const q = input.value.trim().toLowerCase();
      const src = getItems();
      const toStr = (it)=> typeof it==='string' ? it : (it.label || it.value || '');
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

  const taManu = makeTypeahead({
    input: manuInput, listEl: manuList,
    getItems: ()=> g.index.manus,
    onChoose: (val, input, close)=>{ g.manuSelected = (typeof val==='string')? val : val.value; input.value = g.manuSelected; g.fixSelected=''; $('#gdtf-fixture-input').value=''; filterBySelections(); close(); },
    placeholder: 'Type manufacturer…'
  });

  const taFix = makeTypeahead({
    input: fixInput, listEl: fixList,
    getItems: ()=>{
      if(g.manuSelected){
        return Array.from(g.index.fixturesByManu.get(g.manuSelected) || []).sort((a,b)=> a.localeCompare(b));
      }else{
        return g.index.globalFixtures.map(it=> ({ value: it.fixture, meta:{manufacturer:it.manufacturer}, label:`${it.fixture} — ${it.manufacturer}` }));
      }
    },
    renderItem: (it)=> typeof it==='string' ? `<span>${escapeHTML(it)}</span>` : `<span>${escapeHTML(it.value)}</span><span class="ta-tag">${escapeHTML(it.meta.manufacturer)}</span>`,
    onChoose: (val, input, close)=>{
      if(typeof val==='string'){ g.fixSelected = val; }
      else { g.fixSelected = val.value; g.manuSelected = val.meta?.manufacturer || g.manuSelected; $('#gdtf-manu-input').value = g.manuSelected; }
      input.value = g.fixSelected; filterBySelections(); close();
    },
    placeholder: 'Type fixture…'
  });

  manuInput.addEventListener('input', ()=>{
    g.manuSelected = '';
    g.fixSelected = '';
    const q = manuInput.value.trim().toLowerCase();
    let rows = g.list;
    if(q) rows = rows.filter(r => (r.manufacturer||'').toLowerCase().includes(q));
    g.filtered = rows; renderTable(rows); taFix.refresh();
  });

  fixInput.addEventListener('input', ()=>{
    g.fixSelected = '';
    const q = fixInput.value.trim().toLowerCase();
    let rows = g.list;
    if(g.manuSelected){ rows = rows.filter(r => (r.manufacturer||'') === g.manuSelected); }
    if(q){ rows = rows.filter(r => (r.fixture||'').toLowerCase().includes(q)); }
    g.filtered = rows; renderTable(rows);
  });
}

async function login(){
  try{
    setStatus('Logging in…');
    const res = await fetch(`${GDTF_BASE}/login`, {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({user: $('#gdtf-user').value, password: $('#gdtf-pass').value})
    });
    if(!res.ok){ setStatus(`Login failed (${res.status})`,'err'); return; }
    const data = await res.json().catch(()=> ({}));
    if(data?.result){
      g.loggedIn = true;
      $('#gdtf-getlist').disabled = false;
      setStatus(data.notice || 'Logged in. Session cookie active (~2h).','ok');
    }else{
      setStatus(data?.error || 'Login failed.','err');
    }
  }catch{ setStatus('Login error.','warn'); }
}

function logout(){
  g.loggedIn=false; $('#gdtf-getlist').disabled = true; $('#gdtf-table tbody').innerHTML='';
  g.list=g.filtered=[]; $('#gdtf-count').textContent='';
  $('#gdtf-manu-input').value=''; $('#gdtf-fixture-input').value=''; setStatus('Logged out (local).','info');
}

async function getList(){
  try{
    setStatus('Fetching revision list…');
    const res = await fetch(`${GDTF_BASE}/getList`, {credentials:'include'});
    if(!res.ok){ const t = await res.text().catch(()=> ''); setStatus(`Get List failed (${res.status}). ${t||''}`.trim(),'err'); return; }
    const data = await res.json().catch(()=> null);
    if(!data?.result){ setStatus(data?.error || 'Get List returned error.','err'); return; }
    g.list = Array.isArray(data.list)? data.list : [];
    setStatus(`Got ${g.list.length} revisions. Timestamp: ${data.timestamp||''}`,'ok');
    buildIndexes(); g.filtered = g.list.slice(); renderTable(g.filtered); setupTypeaheads();
  }catch{ setStatus('Get List error.','warn'); }
}

function addSelectedModeToLibrary(rid){
  const row = g.filtered.find(r=> String(r.rid)===String(rid)) || g.list.find(r=> String(r.rid)===String(rid));
  if(!row){ toast('RID not found','error'); return; }
  const sel = document.querySelector(`select.gdtf-modepick[data-rid="${rid}"]`);
  const ix = Number(sel?.value);
  const modes = normalizeModes(row.modes);
  const md = Number.isInteger(ix) && ix>=0 ? modes[ix] : null;
  const rec = {
    id: crypto.randomUUID(),
    brand: row.manufacturer || '',
    model: row.fixture || '',
    mode: md?.name || (row.revision? `${row.revision}`:''),
    footprint: md?.dmxfootprint || null,
    links: `/api/gdtf/download?rid=${row.rid}`,
    notes: `GDTF RID ${row.rid} • Version ${row.version||'-'}`
  };
  if(!rec.brand || !rec.model){ toast('Missing manufacturer/fixture in record','error'); return; }
  state.addFixture(rec);
  toast('Added to Fixture Library','success');
}

async function downloadGdtf(rid){
  try{
    const url = `/api/gdtf/download?rid=${encodeURIComponent(rid)}`;
    const res = await fetch(url, {credentials:'include'});
    if(!res.ok){
      let msg = `Download failed (${res.status})`;
      try{ const j = await res.json(); if(j?.error) msg += `: ${j.error}`; }catch{}
      toast(msg,'error'); return;
    }
    const blob = await res.blob();
    const row = g.list.find(x=> String(x.rid)===String(rid));
    const fname = `${(row?.manufacturer||'Manuf').replace(/\W+/g,'_')}-${(row?.fixture||'Fixture').replace(/\W+/g,'_')}-${(row?.revision||'rev').replace(/\W+/g,'_')}-RID${rid}.gdtf`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Downloaded GDTF','success');
  }catch{ toast('Download error.','warning'); }
}

export function initGdtf(){
  $('#gdtf-login').addEventListener('click', login);
  $('#gdtf-logout').addEventListener('click', logout);
  $('#gdtf-getlist').addEventListener('click', getList);

  $$('#gdtf-table thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.sort;
      if(g.sort.key === key){ g.sort.dir = (g.sort.dir === 'asc') ? 'desc' : 'asc'; }
      else{ g.sort.key = key; g.sort.dir = 'asc'; }
      renderTable(g.filtered);
    });
  });

  $('#gdtf-table').addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const rid = btn.dataset.rid;
    if(btn.dataset.act==='add') addSelectedModeToLibrary(rid);
    if(btn.dataset.act==='dl') downloadGdtf(rid);
  });
}
