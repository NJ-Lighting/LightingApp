// js/mylibrary.page.js
// Puur localStorage gebaseerde library + simpele UI.
// Exporteert ook window.MyLibrary voor toekomstige integratie vanuit andere pagina's.

const LS_KEY = 'lightingapp.mylibrary.v1';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadAll() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function add(item) {
  const now = new Date().toISOString();
  const entry = {
    id: uid(),
    source: item?.source === 'gdtf' ? 'gdtf' : 'local',
    manufacturer: (item?.manufacturer || '').trim(),
    name: (item?.name || '').trim(),
    mode: item?.mode || '',
    footprint: item?.footprint ? Number(item.footprint) : undefined,
    notes: item?.notes || '',
    // Optioneel veld om later GDTF metadata te bewaren
    gdtf: item?.gdtf || null,
    createdAt: now,
    updatedAt: now,
  };
  const items = loadAll();
  items.push(entry);
  saveAll(items);
  return entry;
}

function update(id, patch) {
  const items = loadAll();
  const idx = items.findIndex(x => x.id === id);
  if (idx === -1) return null;
  items[idx] = {
    ...items[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveAll(items);
  return items[idx];
}

function remove(id) {
  const items = loadAll();
  const next = items.filter(x => x.id !== id);
  saveAll(next);
}

function clearAll() {
  saveAll([]);
}

function exportJson() {
  const data = loadAll();
  return JSON.stringify({ version: 1, fixtures: data }, null, 2);
}

function importJson(obj, { merge = true } = {}) {
  const next = merge ? loadAll() : [];
  if (Array.isArray(obj?.fixtures)) {
    for (const f of obj.fixtures) {
      // Bij import altijd nieuw ID, zodat je geen clashes krijgt
      next.push({
        id: uid(),
        source: f?.source === 'gdtf' ? 'gdtf' : 'local',
        manufacturer: (f?.manufacturer || '').trim(),
        name: (f?.name || '').trim(),
        mode: f?.mode || '',
        footprint: f?.footprint ? Number(f.footprint) : undefined,
        notes: f?.notes || '',
        gdtf: f?.gdtf || null,
        createdAt: f?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    saveAll(next);
    return next.length;
  }
  return 0;
}

// ------- UI binding -------

const $ = sel => document.querySelector(sel);

const grid = $('#grid');
const emptyEl = $('#empty');
const q = $('#q');
const filter = $('#filter');
const sortSel = $('#sort');
const btnAdd = $('#btn-add');
const btnExport = $('#btn-export');
const btnImport = $('#btn-import');
const fileImport = $('#file-import');

const dlg = $('#dlg-edit');
const frm = $('#frm-edit');
const dlgTitle = $('#dlg-title');
const fMan = $('#f-man');
const fName = $('#f-name');
const fMode = $('#f-mode');
const fFoot = $('#f-footprint');
const fNotes = $('#f-notes');
const btnCancel = $('#btn-cancel');

let editId = null;

function render() {
  const txt = (q.value || '').toLowerCase().trim();
  const src = filter.value; // all | local | gdtf
  const sort = sortSel.value;

  let items = loadAll();

  // filter bron
  if (src !== 'all') {
    items = items.filter(x => x.source === src);
  }

  // zoeken
  if (txt) {
    items = items.filter(x => {
      const hay = [
        x.manufacturer || '',
        x.name || '',
        x.mode || '',
        x.notes || '',
      ].join(' ').toLowerCase();
      return hay.includes(txt);
    });
  }

  // sorteren
  items.sort((a, b) => {
    if (sort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    if (sort === 'name-desc') return (b.name || '').localeCompare(a.name || '');
    if (sort === 'brand-asc') return (a.manufacturer || '').localeCompare(b.manufacturer || '');
    if (sort === 'date-asc') return (a.createdAt || '').localeCompare(b.createdAt || '');
    // default: date-desc
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  grid.innerHTML = '';
  if (!items.length) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  for (const it of items) {
    grid.appendChild(renderCard(it));
  }
}

function renderCard(it) {
  const el = document.createElement('article');
  el.className = 'card';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '10px';

  const badge = it.source === 'gdtf' ? 'GDTF' : 'Eigen';
  const chipColor = it.source === 'gdtf' ? 'var(--accent)' : 'var(--ok)';

  el.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:flex-start; gap:8px;">
      <div>
        <div class="muted" style="font-size:.85rem">${escapeHtml(it.manufacturer || '-')}</div>
        <h3 style="margin:.25rem 0 0 0">${escapeHtml(it.name || '(naamloos)')}</h3>
      </div>
      <span class="chip" style="background:var(--chip); border:1px solid ${chipColor};">${badge}</span>
    </div>

    <div class="row g8" style="flex-wrap:wrap">
      ${it.mode ? `<span class="chip">Mode: ${escapeHtml(it.mode)}</span>` : ''}
      ${it.footprint ? `<span class="chip">${Number(it.footprint)} ch</span>` : ''}
      ${it.gdtf?.rev ? `<span class="chip">Rev ${escapeHtml(String(it.gdtf.rev))}</span>` : ''}
    </div>

    ${it.notes ? `<div class="muted" style="white-space:pre-wrap">${escapeHtml(it.notes)}</div>` : ''}

    <div class="row" style="justify-content:flex-end; gap:8px; margin-top:4px;">
      <button class="btn btn-ghost" data-action="use" data-id="${it.id}" title="Gebruik in bulk addressing">Gebruik</button>
      <button class="btn btn-ghost" data-action="edit" data-id="${it.id}">Bewerken</button>
      <button class="btn" data-action="dup" data-id="${it.id}" title="Dupliceren">Dupliceren</button>
      <button class="btn" data-action="del" data-id="${it.id}" title="Verwijderen" style="background:var(--err)">Verwijder</button>
    </div>
  `;

  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'del') {
      if (confirm('Verwijderen?')) {
        remove(id);
        render();
      }
    } else if (action === 'edit') {
      startEdit(id);
    } else if (action === 'dup') {
      const items = loadAll();
      const src = items.find(x => x.id === id);
      if (src) {
        add({ ...src, source: 'local', notes: src.notes || '' });
        render();
      }
    } else if (action === 'use') {
      // Schrijf "gekozen fixture" naar localStorage zodat bulk addressing of andere pagina's hem kunnen ophalen.
      localStorage.setItem('lightingapp.mylibrary.lastSelected', JSON.stringify({ id, at: Date.now() }));
      // Navigeer optioneel naar bulk addressing als je wilt:
      // location.href = '/pages/addressing.html'; // desgewenst uitcommentariëren
      alert('Fixture geselecteerd. Open de Bulk Addressing pagina om verder te gaan.');
    }
  });

  return el;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"'`=\/]/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'
  }[s]));
}

// ---- Edit dialog ----
function startAdd() {
  editId = null;
  dlgTitle.textContent = 'Fixture toevoegen';
  frm.reset();
  dlg.showModal();
  fMan.focus();
}

function startEdit(id) {
  const items = loadAll();
  const it = items.find(x => x.id === id);
  if (!it) return;
  editId = id;
  dlgTitle.textContent = 'Fixture bewerken';
  fMan.value = it.manufacturer || '';
  fName.value = it.name || '';
  fMode.value = it.mode || '';
  fFoot.value = it.footprint || '';
  fNotes.value = it.notes || '';
  dlg.showModal();
  fName.focus();
}

frm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const payload = {
    source: 'local',
    manufacturer: fMan.value,
    name: fName.value,
    mode: fMode.value,
    footprint: fFoot.value ? Number(fFoot.value) : undefined,
    notes: fNotes.value,
  };
  if (editId) {
    update(editId, payload);
  } else {
    add(payload);
  }
  dlg.close();
  render();
});

btnCancel.addEventListener('click', () => dlg.close());

// ---- Toolbar events ----
q.addEventListener('input', render);
filter.addEventListener('change', render);
sortSel.addEventListener('change', render);

btnAdd.addEventListener('click', startAdd);

btnExport.addEventListener('click', () => {
  const blob = new Blob([exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lightingapp-mylibrary.json';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
});

btnImport.addEventListener('click', () => fileImport.click());

fileImport.addEventListener('change', async () => {
  const file = fileImport.files?.[0];
  if (!file) return;
  try {
    const txt = await file.text();
    const obj = JSON.parse(txt);
    const count = importJson(obj, { merge: true });
    alert(`Geïmporteerd: ${count} fixtures.`);
    render();
  } catch (e) {
    console.error(e);
    alert('Kon JSON niet lezen. Controleer het bestand.');
  } finally {
    fileImport.value = '';
  }
});

// Eerste render
render();

// Exporteer een eenvoudige API voor andere pagina's
window.MyLibrary = {
  add,
  addFromGdtf(meta) {
    // Call vanuit je GDTF pagina: MyLibrary.addFromGdtf({ manufacturer, name, mode, footprint, gdtf:{ uid, rev, url } })
    return add({ ...meta, source: 'gdtf' });
  },
  list: loadAll,
  select(id) {
    localStorage.setItem('lightingapp.mylibrary.lastSelected', JSON.stringify({ id, at: Date.now() }));
  },
  clearAll,
};
