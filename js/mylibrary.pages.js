// js/mylibrary.page.js
// Sprint 1 fine-tunes: fuzzy search, aliases/keywords match, dedupe via stableId,
// bulk actions (select/export/delete), empty-state tips, persistent sort.
// Huisstijl & bestaande IDs blijven behouden.
//
// Imports zoals in jouw repo:
import { $, $$, toast, escapeHTML, dlBlob } from './core.js';
import state from './state.js';

let fixtures = [];            // In-memory library
let selectedIds = new Set();  // Bulk selection memory

/* ---------- Constants & keys ---------- */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const LS_KEY_SORT = 'lightingapp.mylib.sort';
const LS_KEY_LIB  = 'lightingapp.mylib.items'; // fallback storage key

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
  // DP met vroege stop bij >2
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
    ...(item.keywords || [])
  ].map(v => normalizeStr(v||''));
  const hay = hayParts.join(' ');
  const q   = normalizeStr(qRaw);

  // snelle includes
  if (hay.includes(q)) return true;

  // token startsWith voor natuurlijke filtering
  const qs = tokens(q);
  const hs = hayParts.flatMap(v => tokens(v));
  if (qs.every(t => hs.some(h => h.startsWith(t)))) return true;

  // lichte fuzzy op korte queries
  if (q.length <= 5 && hs.some(h => editDistance1or2(h, q) <= 1)) return true;

  return false;
}

/* ---------- Storage helpers (state.js fallback naar localStorage) ---------- */
function storageHas(){ try { return !!(state && state.has && state.has('mylib')); } catch { return false; } }
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

function saveLibrary(){
  storageSet(fixtures);
}
function loadLibrary(){
  fixtures = storageGet().map(f => ({...f, _stableId: f._stableId || stableId(f)}));
}

/* ---------- Sorting ---------- */
function sortByBrandModel(a, b){
  return collator.compare(`${a.brand||''} ${a.model||''}`, `${b.brand||''} ${b.model||''}`);
}
function sortByRecent(a, b){
  // newest first; val 'addedAt' optioneel
  return (b.addedAt||0) - (a.addedAt||0);
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
      <button id="lib-del-sel" class="btn btn-warn">Verwijder selectie</button>
      <button id="lib-del-all" class="btn btn-danger">Alles verwijderen</button>
      <div class="spacer"></div>
      <label class="field inline">
        <span class="muted">Sort</span>
        <select id="lib-sort" class="input">
          <option value="brand">Merk/Model</option>
          <option value="recent">Laatst toegevoegd</option>
        </select>
      </label>
    `;
    host.prepend(bar);

    $('#lib-sel-all')  ?.addEventListener('click', () => { fixtures.forEach(f => selectedIds.add(f._stableId)); renderLibrary(); });
    $('#lib-sel-clear')?.addEventListener('click', () => { selectedIds.clear(); renderLibrary(); });
    $('#lib-exp-sel')  ?.addEventListener('click', handleExportSelected);
    $('#lib-del-sel')  ?.addEventListener('click', handleDeleteSelected);
    $('#lib-del-all')  ?.addEventListener('click', handleDeleteAll);
    $('#lib-sort')     ?.addEventListener('change', (e) => {
      localStorage.setItem(LS_KEY_SORT, e.target.value);
      renderLibrary();
    });

    // init sort UI
    const pref = localStorage.getItem(LS_KEY_SORT) || 'brand';
    const sel = $('#lib-sort');
    if (sel) sel.value = pref;
  }
}

/* ---------- Rendering ---------- */
function renderLibrary(){
  const list  = $('#lib-list');
  const empty = $('#lib-empty');
  const qRaw  = ($('#lib-search')?.value || '').trim();
  if (!list || !empty) return;

  ensureBulkToolbar();

  list.innerHTML = '';

  const sortPref = (localStorage.getItem(LS_KEY_SORT) || 'brand');
  const rows = fixtures
    .slice()
    .sort(sortPref === 'recent' ? sortByRecent : sortByBrandModel)
    .filter(x => matchesQuery(x, qRaw));

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

  for (const fx of rows){
    const li = document.createElement('div');
    li.className = 'row card-row';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.padding = '8px 10px';
    li.style.borderBottom = '1px solid var(--border)';

    const isSel = selectedIds.has(fx._stableId);

    li.innerHTML = `
      <label class="row g8" style="align-items:center; flex:1; min-width:0">
        <input type="checkbox" class="lib-check" data-id="${fx._stableId}" ${isSel ? 'checked' : ''} />
        <div class="col" style="min-width:0">
          <div class="row g8" style="align-items:center">
            <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHTML(fx.brand||'–')} ${escapeHTML(fx.model||'')}
            </strong>
            ${fx.mode ? `<span class="chip">${escapeHTML(fx.mode)}</span>` : ''}
          </div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${fx.channels ? `${fx.channels} ch` : ''}${fx.channels && fx.footprint ? ' · ' : ''}${fx.footprint||''}
          </div>
        </div>
      </label>
      <div class="row g6">
        <button class="btn btn-ghost lib-del" data-id="${fx._stableId}" title="Verwijderen">🗑️</button>
      </div>
    `;
    list.appendChild(li);
  }

  // events per render
  $$('.lib-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (e.currentTarget.checked) selectedIds.add(id);
      else selectedIds.delete(id);
    });
  });
  $$('.lib-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const idx = fixtures.findIndex(f => f._stableId === id);
      if (idx >= 0){
        fixtures.splice(idx,1);
        selectedIds.delete(id);
        saveLibrary();
        renderLibrary();
        toast('Fixture verwijderd');
      }
    });
  });
}

/* ---------- Bulk actions ---------- */
function handleExportSelected(){
  const arr = fixtures.filter(f => selectedIds.has(f._stableId))
    .map(({_stableId, ...rest}) => rest);
  if (!arr.length){ toast('Geen selectie om te exporteren'); return; }
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  dlBlob(blob, `my-library-selection-${Date.now()}.json`);
}

function handleDeleteSelected(){
  if (!selectedIds.size){ toast('Geen selectie om te verwijderen'); return; }
  if (!confirm('Weet je zeker dat je de geselecteerde fixtures wilt verwijderen?')) return;
  fixtures = fixtures.filter(f => !selectedIds.has(f._stableId));
  selectedIds.clear();
  saveLibrary();
  renderLibrary();
  toast('Selectie verwijderd');
}

function handleDeleteAll(){
  if (!fixtures.length){ toast('Bibliotheek is al leeg'); return; }
  if (!confirm('Weet je zeker dat je ALLES wilt verwijderen?')) return;
  fixtures = [];
  selectedIds.clear();
  saveLibrary();
  renderLibrary();
  toast('Bibliotheek geleegd');
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
    renderLibrary();
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

/* ---------- Init ---------- */
function init(){
  loadLibrary();
  $('#lib-search')?.addEventListener('input', () => renderLibrary());
  ensureBulkToolbar();
  renderLibrary();
}

// Auto-init als de pagina geladen is
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
