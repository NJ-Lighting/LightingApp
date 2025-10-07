// js/mylibrary.page.js
// Sprint 3: Drag&drop .gdtf/.json import, Sets & Tags, Export All, Multi-select → Bulk Addressing.
// Blijft in jouw huisstijl; bestaande IDs (#lib-search, #lib-list, #lib-empty, #lib-toolbar) blijven.
import { $, $$, toast, escapeHTML, dlBlob } from './core.js';
import state from './state.js';

let fixtures = [];            // In-memory library
let selectedIds = new Set();  // Bulk selection memory
let pendingUndo = null;       // Voor swipe-to-delete undo
let searchDebounce = null;    // Debounce timer voor search
let vState = null;            // Virtualization state (of null als uit)
let sets = {};               // Named sets: { [setName]: string[] stableIds }

/* ---------- Constants & keys ---------- */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const LS_KEY_SORT    = 'lightingapp.mylib.sort';
const LS_KEY_LIB     = 'lightingapp.mylib.items';     // fallback storage key
const LS_KEY_DENSITY = 'lightingapp.mylib.density';   // 'comfortable' | 'compact'
const VIRTUAL_THRESHOLD = 200; // >=200 items → virtualized list
const OVERSCAN = 8;            // extra rijen boven/onder viewport
const LS_KEY_SETS  = 'lightingapp.mylib.sets';
const LS_KEY_ADDRSEL = 'lightingapp.addressing.selection'; // handover naar Bulk Addressing

/* ---------- Utils ---------- */
const normalizeStr = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase();

function djb2hash(str){
  let h = 5381;
  for (let i=0; i<str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function stableId(x){
  const s = [
    x.source || '', x.id || '',
    x.brand || '', x.model || '',
    x.mode || '', String(x.channels ?? '')
  ].map(normalizeStr).join('|');
  return 'fx_' + djb2hash(s);
}

function tokens(str){ return normalizeStr(str).split(/\s+/).filter(Boolean); }

// Kleine Levenshtein met cutoff (alleen nuttig voor korte queries)
function editDistance1or2(a, b){
  if (!a || !b) return Math.max(a?.length||0, b?.length||0);
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3; // out of scope
  const m = a.length, n = b.length;
  const dp = Array(n+1).fill(0);
  for (let j=0; j<=n; j++) dp[j] = j;
  for (let i=1; i<=m; i++){
    let prev = dp[0];
    dp[0] = i;
    let minRow = dp[0];
    for (let j=1; j<=n; j++){
      const temp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // deletion
        dp[j-1] + 1,    // insertion
        prev + cost     // substitution
      );
      prev = temp;
      if (dp[j] < minRow) minRow = dp[j];
    }
    if (minRow > 2) return 3; // cutoff
  }
  return dp[n];
}

function matchesQuery(item, qRaw){
  if (!qRaw) return true;
  const hayParts = [
    item.brand, item.model, item.mode,
    ...(item.aliases || []),
    ...(item.keywords || []),
    ...(item.tags || [])
  ].map(v => normalizeStr(v||''));
  const hay = hayParts.join(' ');
  const q   = normalizeStr(qRaw);

  if (hay.includes(q)) return true;

  const qs = tokens(q);
  const hs = hayParts.flatMap(v => tokens(v));
  if (qs.every(t => hs.some(h => h.startsWith(t)))) return true;

  if (q.length <= 5 && hs.some(h => editDistance1or2(h, q) <= 1)) return true;

  return false;
}

/* ---------- Storage helpers (state.js fallback naar localStorage) ---------- */
function storageGet(){
  try {
    if (state && state.get) {
      const x = state.get('mylib');
      if (Array.isArray(x)) return x;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(LS_KEY_LIB);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function storageSet(arr){
  try {
    if (state && state.set) {
      state.set('mylib', arr);
      return;
    }
  } catch {}
  try {
    localStorage.setItem(LS_KEY_LIB, JSON.stringify(arr));
  } catch {}
}

function saveLibrary(){ storageSet(fixtures); }
function loadLibrary(){
  fixtures = storageGet().map(f => ({...f, _stableId: f._stableId || stableId(f)}));
}

/* ---------- Sets storage ---------- */
function loadSets(){
  try {
    const raw = localStorage.getItem(LS_KEY_SETS);
    sets = raw ? (JSON.parse(raw)||{}) : {};
  } catch { sets = {}; }
}
function saveSets(){
  try { localStorage.setItem(LS_KEY_SETS, JSON.stringify(sets)); } catch {}
}

/* ---------- Sorting ---------- */
function sortByBrandModel(a, b){
  return collator.compare(`${a.brand||''} ${a.model||''}`, `${b.brand||''} ${b.model||''}`);
}
function sortByRecent(a, b){
  return (b.addedAt||0) - (a.addedAt||0);
}

/* ---------- Density helpers ---------- */
function getDensity(){
  const v = localStorage.getItem(LS_KEY_DENSITY);
  return (v === 'compact') ? 'compact' : 'comfortable';
}
function rowHeight(){
  return getDensity() === 'compact' ? 46 : 58; // px
}

/* ---------- Bulk toolbar ---------- */
function ensureBulkToolbar(){
  let bar = $('#lib-actions');
  if (!bar){
    const host = $('#lib-toolbar') || $('#lib-list')?.parentElement || $('#app');
    if (!host) return;
    bar = document.createElement('div');
    bar.id = 'lib-actions';
    bar.className = 'row g8';
    bar.style.margin = '8px 0 12px';
    bar.innerHTML = `
      <button id="lib-sel-all" class="btn">Alles selecteren</button>
      <button id="lib-sel-clear" class="btn btn-ghost">Selectie wissen</button>
      <button id="lib-exp-sel" class="btn">Export selectie</button>
      <button id="lib-exp-all" class="btn btn-ghost">Export alles</button>
      <button id="lib-del-sel" class="btn btn-warn">Verwijder selectie</button>
      <button id="lib-del-all" class="btn btn-danger">Alles verwijderen</button>
      <div class="spacer"></div>
      <button id="lib-to-addressing" class="btn">Naar Bulk Addressing</button>
      <div class="spacer"></div>
      <div class="row g6" id="lib-sets-wrap">
        <label class="field inline">
          <span class="muted">Set</span>
          <select id="lib-set-filter" class="input">
            <option value="">Alle</option>
          </select>
        </label>
        <button id="lib-set-new" class="btn btn-ghost">Nieuwe set</button>
        <button id="lib-set-add" class="btn btn-ghost">Selectie → set</button>
        <button id="lib-set-remove" class="btn btn-ghost">Selectie uit set</button>
      </div>
      <label class="field inline">
        <span class="muted">Sort</span>
        <select id="lib-sort" class="input">
          <option value="brand">Merk/Model</option>
          <option value="recent">Laatst toegevoegd</option>
        </select>
      </label>
      <button id="lib-density" class="btn btn-ghost" title="Weergavedichtheid">Comfortabel</button>
      <label class="field inline" id="lib-import-wrap">
        <span class="muted">Import</span>
        <input id="lib-import" type="file" class="input" multiple
               accept=".json,.gdtf,application/json,application/octet-stream" />
      </label>
    `;
    host.prepend(bar);

    $('#lib-sel-all')  ?.addEventListener('click', () => { fixtures.forEach(f => selectedIds.add(f._stableId)); scheduleRender(); });
    $('#lib-sel-clear')?.addEventListener('click', () => { selectedIds.clear(); scheduleRender(); });
    $('#lib-exp-sel')  ?.addEventListener('click', handleExportSelected);
    $('#lib-exp-all')  ?.addEventListener('click', handleExportAll);
    $('#lib-del-sel')  ?.addEventListener('click', handleDeleteSelected);
    $('#lib-del-all')  ?.addEventListener('click', handleDeleteAll);
    $('#lib-to-addressing')?.addEventListener('click', goToAddressing);
    $('#lib-sort')     ?.addEventListener('change', (e) => {
      localStorage.setItem(LS_KEY_SORT, e.target.value);
      scheduleRender();
    });
    $('#lib-import')?.addEventListener('change', onImportFiles);

    // init sort UI
    const pref = localStorage.getItem(LS_KEY_SORT) || 'brand';
    const sel = $('#lib-sort');
    if (sel) sel.value = pref;

    // init density
    const denBtn = $('#lib-density');
    if (denBtn){
      const sync = () => denBtn.textContent = (getDensity()==='compact'?'Compact':'Comfortabel');
      sync();
      denBtn.addEventListener('click', () => {
        const next = getDensity()==='compact' ? 'comfortable' : 'compact';
        localStorage.setItem(LS_KEY_DENSITY, next);
        sync();
        setupVirtualization();
        scheduleRender(true);
      });
    }

    // init sets UI
    refreshSetFilter();
    $('#lib-set-new')   ?.addEventListener('click', handleNewSet);
    $('#lib-set-add')   ?.addEventListener('click', () => modifySet('add'));
    $('#lib-set-remove')?.addEventListener('click', () => modifySet('remove'));
    $('#lib-set-filter')?.addEventListener('change', () => scheduleRender(true));

    // drag & drop import op toolbar (best-effort)
    const dropHost = host;
    dropHost.addEventListener('dragover', (e) => { e.preventDefault(); dropHost.classList.add('drag'); });
    dropHost.addEventListener('dragleave', () => dropHost.classList.remove('drag'));
    dropHost.addEventListener('drop', (e) => {
      e.preventDefault(); dropHost.classList.remove('drag');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) importFiles(files);
    });
  }
}

/* ---------- Virtualization ---------- */
function setupVirtualization(){
  const list = $('#lib-list');
  if (!list) { vState = null; return; }
  const shouldVirtual = fixtures.length >= VIRTUAL_THRESHOLD;
  if (!shouldVirtual){
    list.style.position = '';
    list.style.overflowY = '';
    list.innerHTML = '';
    vState = null;
    return;
  }
  list.style.position = 'relative';
  list.style.overflowY = 'auto';
  if (!vState || !vState.inner){
    list.innerHTML = '';
    const inner = document.createElement('div');
    inner.style.position = 'relative';
    inner.id = 'lib-virtual-inner';
    list.appendChild(inner);
    vState = { inner, scrollTop: 0, height: list.clientHeight || 0 };
    list.addEventListener('scroll', () => {
      vState.scrollTop = list.scrollTop;
      scheduleRender();
    }, { passive: true });
    window.addEventListener('resize', () => {
      vState.height = list.clientHeight || 0;
      scheduleRender(true);
    });
  } else {
    vState.height = list.clientHeight || 0;
  }
}

/* ---------- Rendering ---------- */
function renderLibrary(){
  const list  = $('#lib-list');
  const empty = $('#lib-empty');
  const qRaw  = ($('#lib-search')?.value || '').trim();
  if (!list || !empty) return;

  ensureBulkToolbar();

  const sortPref = (localStorage.getItem(LS_KEY_SORT) || 'brand');
  const setFilter = ($('#lib-set-filter')?.value || '').trim();
  const rows = fixtures
    .slice()
    .sort(sortPref === 'recent' ? sortByRecent : sortByBrandModel)
    .filter(x => matchesQuery(x, qRaw))
    .filter(x => {
      if (!setFilter) return true;
      const ids = new Set(sets[setFilter] || []);
      return ids.has(x._stableId);
    });

  if (rows.length === 0){
    empty.style.display = '';
    empty.innerHTML = `
      <div class="muted" style="margin:8px 0">Geen resultaten voor “${escapeHTML(qRaw)}”.</div>
      <ul class="muted" style="margin:0 0 6px 16px; line-height:1.5">
        <li>Zoek op merk (bijv. “Robe”, “Ayrton”)</li>
        <li>Probeer model of mode (bijv. “BMFL”, “Diablo”, “Mode 1”)</li>
        <li>Kleine typfouten worden opgevangen 😉</li>
      </ul>`;
  } else {
    empty.style.display = 'none';
  }

  setupVirtualization();
  if (!vState){
    // non-virtual
    list.innerHTML = '';
    for (const fx of rows){
      list.appendChild(renderRow(fx));
    }
  } else {
    // virtual
    const h = rowHeight();
    const total = rows.length * h;
    vState.inner.style.height = `${total}px`;
    const startIndex = Math.max(0, Math.floor(vState.scrollTop / h) - OVERSCAN);
    const visibleCount = Math.ceil((vState.height || list.clientHeight || 0) / h) + OVERSCAN * 2;
    const endIndex = Math.min(rows.length, startIndex + visibleCount);
    vState.inner.innerHTML = '';
    for (let i = startIndex; i < endIndex; i++){
      const node = renderRow(rows[i], true);
      node.style.position = 'absolute';
      node.style.top = `${i * h}px`;
      node.style.left = '0';
      node.style.right = '0';
      vState.inner.appendChild(node);
    }
  }

  // checkbox handlers per render
  $$('.lib-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (e.currentTarget.checked) selectedIds.add(id);
      else selectedIds.delete(id);
    });
  });
  // delete buttons per render
  $$('.lib-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const idx = fixtures.findIndex(f => f._stableId === id);
      if (idx >= 0){
        removeWithUndo(idx);
      }
    });
  });
  // tag buttons per render
  $$('.lib-tag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const fx = fixtures.find(f => f._stableId === id);
      if (!fx) return;
      const cur = (fx.tags||[]).join(', ');
      const val = prompt('Tags (komma-gescheiden):', cur);
      if (val === null) return;
      fx.tags = val.split(',').map(s=>s.trim()).filter(Boolean);
      saveLibrary();
      scheduleRender();
    });
  });
}

/* ---------- Row renderer (badges + swipe + tags) ---------- */
function renderRow(fx, virtual=false){
  const li = document.createElement('div');
  li.className = 'row card-row';
  li.style.alignItems = 'center';
  li.style.justifyContent = 'space-between';
  li.style.padding = getDensity()==='compact' ? '6px 10px' : '10px 12px';
  li.style.borderBottom = '1px solid var(--border)';
  li.style.touchAction = 'pan-y';
  li.setAttribute('role', 'group');

  const isSel = selectedIds.has(fx._stableId);
  const chips = [];
  if (fx.mode)      chips.push(`<span class="chip">${escapeHTML(fx.mode)}</span>`);
  if (fx.channels)  chips.push(`<span class="chip">${escapeHTML(fx.channels)} ch</span>`);
  if (fx.footprint) chips.push(`<span class="chip">${escapeHTML(fx.footprint)}</span>`);
  if (fx.rdm)       chips.push(`<span class="chip">RDM</span>`);
  if (fx.cmy)       chips.push(`<span class="chip">CMY</span>`);
  if (fx.ip)        chips.push(`<span class="chip">IP${escapeHTML(String(fx.ip))}</span>`);

  li.innerHTML = `
    <label class="row g8" style="align-items:center; flex:1; min-width:0">
      <input type="checkbox" class="lib-check" data-id="${fx._stableId}" ${isSel ? 'checked' : ''} />
      <div class="col" style="min-width:0">
        <div class="row g8" style="align-items:center">
          <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHTML(fx.brand||'–')} ${escapeHTML(fx.model||'')}
          </strong>
        </div>
        <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${chips.join(' ')}
        </div>
        ${Array.isArray(fx.tags) && fx.tags.length ? `
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
            ${fx.tags.map(t=>`<span class="chip">${escapeHTML(t)}</span>`).join(' ')}
          </div>` : ''}
      </div>
    </label>
    <div class="row g6">
      <button class="btn btn-ghost lib-tag" data-id="${fx._stableId}" title="Tags">🏷️</button>
      <button class="btn btn-ghost lib-del" data-id="${fx._stableId}" title="Verwijderen">🗑️</button>
    </div>
  `;

  attachSwipeDelete(li, fx);
  return li;
}

function attachSwipeDelete(li, fx){
  let startX = 0, curX = 0, dragging = false;
  const THRESH = 64;
  const maxLeft = 96;
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    curX = 0;
    li.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = Math.min(0, e.clientX - startX); // links swipen
    curX = Math.max(dx, -maxLeft);
    li.style.transform = `translateX(${curX}px)`;
  };
  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    li.releasePointerCapture?.(e.pointerId);
    if (Math.abs(curX) >= THRESH){
      const idx = fixtures.findIndex(f => f._stableId === fx._stableId);
      if (idx >= 0) removeWithUndo(idx);
    } else {
      li.style.transition = 'transform .15s ease';
      li.style.transform = 'translateX(0)';
      setTimeout(() => { li.style.transition = ''; }, 160);
    }
  };
  li.addEventListener('pointerdown', onPointerDown);
  li.addEventListener('pointermove', onPointerMove);
  li.addEventListener('pointerup', onPointerUp);
  li.addEventListener('pointercancel', onPointerUp);
}

function removeWithUndo(index){
  const removed = fixtures[index];
  fixtures.splice(index,1);
  selectedIds.delete(removed._stableId);
  saveLibrary();
  scheduleRender();
  showUndo(removed);
}

function showUndo(item){
  let bar = $('#lib-undo');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'lib-undo';
    bar.className = 'row';
    bar.style.gap = '8px';
    bar.style.alignItems = 'center';
    bar.style.background = 'var(--panel)';
    bar.style.border = '1px solid var(--border)';
    bar.style.borderRadius = 'var(--radius)';
    bar.style.padding = '8px 10px';
    bar.style.margin = '8px 0';
    const host = $('#lib-toolbar') || $('#app') || document.body;
    host.prepend(bar);
  }
  bar.innerHTML = `
    <span>Fixture verwijderd: <strong>${escapeHTML(item.brand||'–')} ${escapeHTML(item.model||'')}</strong></span>
    <button id="lib-undo-btn" class="btn btn-ghost">Ongedaan maken</button>
  `;
  if (pendingUndo?.t) clearTimeout(pendingUndo.t);
  pendingUndo = { item, t: setTimeout(() => { hideUndo(); }, 5000) };
  $('#lib-undo-btn')?.addEventListener('click', () => {
    if (!pendingUndo) return;
    const { item } = pendingUndo;
    pendingUndo = null;
    hideUndo();
    item._stableId = item._stableId || stableId(item);
    fixtures.push(item);
    saveLibrary();
    scheduleRender();
    toast('Verwijdering ongedaan gemaakt');
  });
  toast('Fixture verwijderd (5s om ongedaan te maken)');
}
function hideUndo(){
  const bar = $('#lib-undo');
  if (bar) bar.remove();
}

/* ---------- Bulk actions ---------- */
function handleExportSelected(){
  const arr = fixtures.filter(f => selectedIds.has(f._stableId))
    .map(({_stableId, ...rest}) => rest);
  if (!arr.length){ toast('Geen selectie om te exporteren'); return; }
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  dlBlob(blob, `my-library-selection-${Date.now()}.json`);
}
function handleExportAll(){
  if (!fixtures.length){ toast('Geen items om te exporteren'); return; }
  const arr = fixtures.map(({_stableId, ...rest}) => rest);
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  dlBlob(blob, `my-library-all-${Date.now()}.json`);
}
function handleDeleteSelected(){
  if (!selectedIds.size){ toast('Geen selectie om te verwijderen'); return; }
  if (!confirm('Weet je zeker dat je de geselecteerde fixtures wilt verwijderen?')) return;
  fixtures = fixtures.filter(f => !selectedIds.has(f._stableId));
  selectedIds.clear();
  saveLibrary();
  scheduleRender();
  toast('Selectie verwijderd');
}
function handleDeleteAll(){
  if (!fixtures.length){ toast('Bibliotheek is al leeg'); return; }
  if (!confirm('Weet je zeker dat je ALLES wilt verwijderen?')) return;
  fixtures = [];
  selectedIds.clear();
  saveLibrary();
  scheduleRender();
  toast('Bibliotheek geleegd');
}

/* ---------- Sets handlers ---------- */
function refreshSetFilter(){
  const sel = $('#lib-set-filter');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = `<option value="">Alle</option>` + Object.keys(sets).sort().map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
  if (val) sel.value = val;
}
function handleNewSet(){
  const name = prompt('Naam van de nieuwe set:');
  if (!name) return;
  if (sets[name]){ toast('Set bestaat al'); return; }
  sets[name] = [];
  saveSets();
  refreshSetFilter();
  $('#lib-set-filter').value = name;
  scheduleRender(true);
}
function modifySet(kind){
  const sel = $('#lib-set-filter');
  const name = sel?.value || '';
  if (!name){ toast('Kies eerst een set in de filter'); return; }
  const ids = sets[name] ? new Set(sets[name]) : new Set();
  const picked = Array.from(selectedIds);
  if (!picked.length){ toast('Geen selectie'); return; }
  if (kind === 'add'){
    picked.forEach(id => ids.add(id));
  } else if (kind === 'remove'){
    picked.forEach(id => ids.delete(id));
  }
  sets[name] = Array.from(ids);
  saveSets();
  scheduleRender(true);
}

/* ---------- Import (.json / .gdtf) ---------- */
function onImportFiles(e){
  const files = Array.from(e.currentTarget.files || []);
  if (!files.length) return;
  importFiles(files);
  e.currentTarget.value = '';
}
function importFiles(files){
  let jsons = [];
  let gdtfs = [];
  for (const f of files){
    const ext = (f.name.split('.').pop()||'').toLowerCase();
    if (ext === 'json') jsons.push(f);
    else if (ext === 'gdtf') gdtfs.push(f);
  }
  if (jsons.length){
    jsons.forEach(f => f.text().then(txt => {
      try { importFixtures(JSON.parse(txt)); }
      catch { toast(`Kon ${f.name} niet lezen`); }
    }));
  }
  if (gdtfs.length){
    // Zonder JSZip lezen we best-effort de bestandsnaam: "Brand@Model.gdtf" of "Brand_Model.gdtf"
    gdtfs.forEach(f => {
      try {
        const base = f.name.replace(/\.gdtf$/i,'');
        const guess = base.split('@');
        let brand='', model='';
        if (guess.length === 2){ brand = guess[0]; model = guess[1]; }
        else {
          const u = base.split(/[_\-]+/);
          brand = u[0] || '';
          model = u.slice(1).join(' ');
        }
        const fx = {
          source: 'gdtf-file',
          id: base,
          brand, model,
          mode: '', channels: undefined,
          fileName: f.name
        };
        addFixtures([fx]);
      } catch { /* ignore */ }
    });
    toast(`${gdtfs.length} GDTF-bestand${gdtfs.length>1?'en':''} toegevoegd (best-effort metadata)`);
  }
}

/* ---------- Naar Bulk Addressing ---------- */
function goToAddressing(){
  const picked = fixtures.filter(f => selectedIds.has(f._stableId))
    .map(({_stableId, ...rest}) => ({...rest, qty: 1}));
  if (!picked.length){
    const proceedAll = confirm('Geen selectie gevonden. Alles doorzetten naar Bulk Addressing?');
    if (!proceedAll) return;
    picked.push(...fixtures.map(({_stableId, ...rest}) => ({...rest, qty: 1})));
  }
  try {
    if (state && state.set) state.set('addressing.selection', picked);
    else localStorage.setItem(LS_KEY_ADDRSEL, JSON.stringify(picked));
  } catch {
    localStorage.setItem(LS_KEY_ADDRSEL, JSON.stringify(picked));
  }
  try { window.location.href = '/addressing.html?from=lib=1'; }
  catch { /* noop */ }
}

/* ---------- Public API ---------- */
// Voeg fixtures toe met dedupe. newOnes: array van objecten.
export function addFixtures(newOnes){
  if (!Array.isArray(newOnes) || !newOnes.length) return;
  let added = 0;
  for (const raw of newOnes){
    const fx = {...raw};
    fx._stableId = stableId(fx);
    if (!fixtures.some(f => f._stableId === fx._stableId)){
      fx.addedAt = fx.addedAt || Date.now();
      fixtures.push(fx);
      added++;
    }
  }
  if (added){
    saveLibrary();
    scheduleRender();
    toast(`${added} fixture${added>1?'s':''} toegevoegd`);
  } else {
    toast('Geen nieuwe fixtures (dubbele genegeerd)');
  }
}

// Optioneel: import JSON dump (bv. vanuit export)
export function importFixtures(json){
  try{
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(arr)) throw new Error('Invalid JSON');
    addFixtures(arr);
  } catch(e){
    toast('Kon JSON niet importeren');
  }
}

/* ---------- Debounced render helper ---------- */
function scheduleRender(force=false){
  if (force){
    requestAnimationFrame(renderLibrary);
    return;
  }
  Promise.resolve().then(() => renderLibrary());
}

/* ---------- Init ---------- */
function init(){
  loadLibrary();
  loadSets();
  $('#lib-search')?.addEventListener('input', (e) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchDebounce = null;
      scheduleRender(true);
    }, 120);
  });
  ensureBulkToolbar();
  setupVirtualization();
  scheduleRender(true);
}

// Auto-init
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
