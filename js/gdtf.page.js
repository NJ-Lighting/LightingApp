import { $, $$, toast, escapeHTML, dlBlob } from './core.js';
import state from './state.js';

const GDTF_BASE = '/api/gdtf';

function setStatus(msg, kind = 'info') {
  const el = $('#gdtf-status');
  if (!el) return;
  const colors = { info: '#1f2a3a', ok: '#16a34a', warn: '#f59e0b', err: '#ef4444' };
  el.textContent = String(msg ?? '');
  el.style.borderColor = colors[kind] || colors.info;
}

function normalizeModes(modes) {
  return (Array.isArray(modes) ? modes : []).map(m => {
    if (m && typeof m === 'object') {
      if ('name' in m && 'dmxfootprint' in m) return { name: m.name, dmxfootprint: Number(m.dmxfootprint) || null };
      const inner = m['0'] || m[0];
      if (inner && typeof inner === 'object') return { name: inner.name, dmxfootprint: Number(inner.dmxfootprint) || null };
    }
    return { name: '', dmxfootprint: null };
  });
}

let g = {
  loggedIn: false,
  list: [],        // volledige lijst (raw)
  filtered: [],    // na filters
  index: {
    byManu: new Map(),          // manu -> [records]
    fixturesByManu: new Map(),  // manu -> Set(fixture)
    manus: [],                  // alfabetisch
    globalFixtures: []          // [{fixture, manufacturer}] alfabetisch
  },
  sort: { key: null, dir: 'asc' },
  manuSelected: '',
  fixSelected: '',
  alpha: 'ALL'
};

function buildIndexes() {
  g.index.byManu = new Map();
  g.index.fixturesByManu = new Map();
  const globalSet = new Set();

  for (const rec of g.list) {
    const manu = (rec.manufacturer || '').trim();
    const fix = (rec.fixture || '').trim();

    if (!g.index.byManu.has(manu)) g.index.byManu.set(manu, []);
    g.index.byManu.get(manu).push(rec);

    if (!g.index.fixturesByManu.has(manu)) g.index.fixturesByManu.set(manu, new Set());
    if (fix) {
      g.index.fixturesByManu.get(manu).add(fix);
      globalSet.add(`${fix}|||${manu}`);
    }
  }

  g.index.manus = Array.from(g.index.byManu.keys())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  g.index.globalFixtures = Array.from(globalSet)
    .map(key => {
      const [fixture, manufacturer] = key.split('|||');
      return { fixture, manufacturer };
    })
    .sort((a, b) => (a.fixture + a.manufacturer).localeCompare(b.fixture + b.manufacturer));
}

/* ---------- Sortering ---------- */
function applySort(rows) {
  const { key, dir } = g.sort;
  if (!key) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return rows.slice().sort((a, b) => {
    const A = (a[key] ?? '').toString();
    const B = (b[key] ?? '').toString();
    return sign * collator.compare(A, B);
  });
}

function updateSortHeaderUI() {
  $$('#gdtf-table thead th.sortable').forEach(th => th.setAttribute('aria-sort', 'none'));
  if (!g.sort.key) return;
  const th = $(`#gdtf-table thead th.sortable[data-sort="${g.sort.key}"]`);
  if (th) th.setAttribute('aria-sort', g.sort.dir === 'asc' ? 'ascending' : 'descending');
}

/* ---------- Rendering ---------- */
function renderTable(rows) {
  const tbody = $('#gdtf-table tbody');
  if (!tbody) return;

  const sorted = applySort(rows);
  tbody.innerHTML = '';

  sorted.forEach(rec => {
    const tr = document.createElement('tr');
    const modes = normalizeModes(rec.modes);
    const modesHtml = modes.length
      ? modes.map(md => `<span class="chip">${escapeHTML(md.name || '–')} • ${md.dmxfootprint ?? '?'}ch</span>`).join('')
      : '–';
    const size = rec.filesize ? (Math.round(rec.filesize / 1024) + ' KB') : '–';
    const rating = rec.rating != null && !Number.isNaN(Number(rec.rating)) ? Number(rec.rating).toFixed(1) : '–';

    tr.innerHTML = `
      <td>${escapeHTML(rec.manufacturer || '')}</td>
      <td>${escapeHTML(rec.fixture || '')}</td>
      <td>${escapeHTML(rec.revision || '')}</td>
      <td>${modesHtml}</td>
      <td>${rating}</td>
      <td>${size}</td>
      <td class="actions">
        <select class="gdtf-modepick" data-rid="${rec.rid}" aria-label="Pick mode for ${escapeHTML(rec.fixture || 'fixture')}">
          <option value="-1">Pick mode…</option>
          ${modes.map((md, i) => `<option value="${i}">${escapeHTML(md.name || 'Mode')} • ${md.dmxfootprint ?? '?'}ch</option>`).join('')}
        </select>
        <button class="btn-ghost" data-act="add" data-rid="${rec.rid}" disabled title="Kies eerst een mode">Add to Library</button>
        <button class="btn-ghost" data-act="dl" data-rid="${rec.rid}">Download</button>
        <small class="muted">RID: ${rec.rid} • UUID: ${escapeHTML(rec.uuid || '')}</small>
      </td>
    `;

    // Enable 'Add' only when a valid mode is chosen
    const sel = tr.querySelector('.gdtf-modepick');
    const addBtn = tr.querySelector('button[data-act="add"]');
    sel?.addEventListener('change', () => {
      const ok = Number(sel.value) >= 0;
      if (addBtn) {
        addBtn.disabled = !ok;
        addBtn.title = ok ? 'Toevoegen aan Library' : 'Kies eerst een mode';
      }
    });

    tbody.appendChild(tr);
  });

  const c = $('#gdtf-count');
  if (c) {
    const n = sorted.length | 0;
    c.textContent = `${n} resultaat${n === 1 ? '' : 'en'}`;
  }
  updateSortHeaderUI();
}

function passAlpha(val) {
  if (g.alpha === 'ALL') return true;
  if (!val) return false;
  return val.trim().toUpperCase().startsWith(g.alpha);
}

function applyAllFilters() {
  let rows = g.list;
  if (g.manuSelected) {
    rows = rows.filter(r => (r.manufacturer || '') === g.manuSelected);
  }
  if (g.fixSelected) {
    rows = rows.filter(r => (r.fixture || '') === g.fixSelected);
  }
  if (g.alpha !== 'ALL') {
    if (g.manuSelected) rows = rows.filter(r => passAlpha(r.fixture));
    else rows = rows.filter(r => passAlpha(r.manufacturer));
  }
  g.filtered = rows;
  renderTable(rows);
}

/* ---------- Alphabet chips ---------- */
function renderAlphaChips() {
  const host = $('#gdtf-alpha');
  if (!host) return;
  const letters = ['ALL'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  host.innerHTML = '';
  letters.forEach(ch => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = ch === 'ALL' ? 'All' : ch;
    const active = g.alpha === ch;
    if (active) {
      btn.style.outline = '2px solid var(--accent)';
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.removeAttribute('style');
      btn.setAttribute('aria-pressed', 'false');
    }
    btn.addEventListener('click', () => {
      g.alpha = ch;
      renderAlphaChips();
      applyAllFilters();
    });
    host.appendChild(btn);
  });
}

/* ---------- Search inputs / datalists ---------- */
function enableSearchInputs(enable = true) {
  const m = $('#gdtf-manu-input');
  const f = $('#gdtf-fixture-input');
  if (m) m.disabled = !enable;
  if (f) f.disabled = !enable;
  $('#ta-fixture')?.classList.toggle('ta-disabled', !enable);
}

let typeaheadListenersAttached = false;
function setupTypeaheads() {
  if (typeaheadListenersAttached) return;
  typeaheadListenersAttached = true;

  const manuInput = $('#gdtf-manu-input');
  const fixInput = $('#gdtf-fixture-input');

  if (manuInput) {
    manuInput.setAttribute('list', 'gdtf-manus-dl');
    let dl = $('#gdtf-manus-dl');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'gdtf-manus-dl';
      document.body.appendChild(dl);
    }
    const refillManus = () => {
      dl.innerHTML = g.index.manus.map(m => `<option value="${escapeHTML(m)}"></option>`).join('');
    };
    refillManus();

    const applyManu = () => {
      const val = (manuInput.value || '').trim();
      g.manuSelected = g.index.byManu.has(val) ? val : '';
      // reset fixture bij manu-wijziging
      g.fixSelected = '';
      if (fixInput) fixInput.value = '';
      refillFixtures();
      applyAllFilters();
    };
    manuInput.addEventListener('input', applyManu);
    manuInput.addEventListener('change', applyManu);
    manuInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { applyManu(); manuInput.blur(); }
    });
  }

  function refillFixtures() {
    if (!fixInput) return;
    let dl = $('#gdtf-fixtures-dl');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'gdtf-fixtures-dl';
      document.body.appendChild(dl);
    }
    fixInput.setAttribute('list', 'gdtf-fixtures-dl');

    const manu = g.manuSelected;
    let arr = [];
    if (manu && g.index.fixturesByManu.has(manu)) {
      arr = Array.from(g.index.fixturesByManu.get(manu)).sort((a, b) => a.localeCompare(b));
    } else {
      // globale lijst (Fixture — Manufacturer)
      arr = g.index.globalFixtures.map(o => `${o.fixture} — ${o.manufacturer}`);
    }
    dl.innerHTML = arr.map(s => `<option value="${escapeHTML(s)}"></option>`).join('');
  }

  if (fixInput) {
    const applyFix = () => {
      const raw = (fixInput.value || '').trim();
      // vorm "Fixture — Manufacturer" ondersteunen
      let fix = raw, manu = g.manuSelected;
      const m = raw.split('—');
      if (m.length === 2) { fix = m[0].trim(); manu = m[1].trim(); }
      const manuOk = manu ? g.index.byManu.has(manu) : false;
      const fixOk = manuOk ? g.index.fixturesByManu.get(manu)?.has(fix) : false;
      g.manuSelected = manuOk ? manu : g.manuSelected;
      g.fixSelected = fixOk ? fix : '';
      const manuInput = $('#gdtf-manu-input');
      if (manuOk && manuInput) manuInput.value = manu;
      if (!fixOk) fixInput.value = '';
      applyAllFilters();
    };
    refillFixtures();
    fixInput.addEventListener('input', applyFix);
    fixInput.addEventListener('change', applyFix);
    fixInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { applyFix(); fixInput.blur(); }
    });
  }
}

/* ---------- Auth / data ---------- */
async function login() {
  try {
    setStatus('Logging in…');
    const user = $('#gdtf-user')?.value;
    const pass = $('#gdtf-pass')?.value;
    const res = await fetch(`${GDTF_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user, password: pass })
    });
    if (!res.ok) { setStatus(`Login failed (${res.status})`, 'err'); return; }
    const data = await res.json().catch(() => ({}));
    if (data?.result) {
      g.loggedIn = true;
      $('#gdtf-getlist').disabled = false;
      setStatus(data.notice || 'Logged in.\nSession cookie active (~2h).', 'ok');
    } else {
      setStatus(data?.error || 'Login failed.', 'err');
    }
  } catch {
    setStatus('Login error.', 'warn');
  }
}

function logout() {
  g.loggedIn = false;
  $('#gdtf-getlist').disabled = true;
  $('#gdtf-table tbody')?.replaceChildren?.();
  g.list = g.filtered = [];
  const c = $('#gdtf-count'); if (c) c.textContent = '';
  const mi = $('#gdtf-manu-input'); if (mi) mi.value = '';
  const fi = $('#gdtf-fixture-input'); if (fi) fi.value = '';
  g.manuSelected = '';
  g.fixSelected = '';
  g.alpha = 'ALL';
  renderAlphaChips();
  setStatus('Logged out (local).', 'info');
}

async function getList() {
  try {
    setStatus('Fetching revision list…');
    const res = await fetch(`${GDTF_BASE}/getList`, { credentials: 'include' });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      setStatus(`Get List failed (${res.status}).\n${t || ''}`.trim(), 'err');
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data?.result) { setStatus(data?.error || 'Get List returned error.', 'err'); return; }
    g.list = Array.isArray(data.list) ? data.list : [];
    setStatus(`Got ${g.list.length} revisions.\nTimestamp: ${data.timestamp || ''}`, 'ok');

    buildIndexes();
    enableSearchInputs(true);
    setupTypeaheads();

    g.filtered = g.list.slice();
    g.alpha = 'ALL';
    renderAlphaChips();
    renderTable(g.filtered);
  } catch {
    setStatus('Get List error.', 'warn');
  }
}

/* ---------- Library & Download ---------- */
function addSelectedModeToLibrary(rid) {
  const ridStr = String(rid);
  const row = g.filtered.find(r => String(r.rid) === ridStr) || g.list.find(r => String(r.rid) === ridStr);
  if (!row) { toast('RID not found', 'error'); return; }

  const sel = document.querySelector(`select.gdtf-modepick[data-rid="${ridStr}"]`);
  const ix = Number(sel?.value);
  const modes = normalizeModes(row.modes);
  const md = Number.isInteger(ix) && ix >= 0 ? modes[ix] : null;

  const rec = {
    id: crypto.randomUUID(),
    brand: row.manufacturer || '',
    model: row.fixture || '',
    mode: md?.name || (row.revision ? `${row.revision}` : ''),
    footprint: md?.dmxfootprint || null,
    links: `${GDTF_BASE}/download?rid=${row.rid}`,
    notes: `GDTF RID ${row.rid} • Version ${row.version || '-'}`
  };
  if (!rec.brand || !rec.model) { toast('Missing manufacturer/fixture in record', 'error'); return; }

  state.addFixture(rec);
  toast('Added to Fixture Library', 'success');
}

async function downloadGdtf(rid) {
  try {
    const url = `${GDTF_BASE}/download?rid=${encodeURIComponent(rid)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try { const j = await res.json(); if (j?.error) msg += `: ${j.error}`; } catch {}
      toast(msg, 'error');
      return;
    }
    const blob = await res.blob();
    const row = g.list.find(x => String(x.rid) === String(rid));
    const safe = (s) => (s || '').replace(/\W+/g, '_') || 'file';
    const fname = `${safe(row?.manufacturer || 'Manuf')}-${safe(row?.fixture || 'Fixture')}-${safe(row?.revision || 'rev')}-RID${rid}.gdtf`;
    dlBlob(fname, blob);
    toast('Downloaded GDTF', 'success');
  } catch {
    toast('Download error.', 'warning');
  }
}

/* ---------- Init / Events ---------- */
export function initGdtf() {
  $('#gdtf-login')?.addEventListener('click', login);
  $('#gdtf-logout')?.addEventListener('click', logout);
  $('#gdtf-getlist')?.addEventListener('click', getList);

  $$('#gdtf-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (g.sort.key === key) {
        g.sort.dir = (g.sort.dir === 'asc') ? 'desc' : 'asc';
      } else {
        g.sort.key = key;
        g.sort.dir = 'asc';
      }
      renderTable(g.filtered);
    });
  });

  $('#gdtf-table')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const rid = btn.dataset.rid;
    if (btn.dataset.act === 'add') addSelectedModeToLibrary(rid);
    if (btn.dataset.act === 'dl') downloadGdtf(rid);
  });

  // disable inputs until list is loaded
  enableSearchInputs(false);
}
