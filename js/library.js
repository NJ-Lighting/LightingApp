import { $, toast, escapeHTML, shortURL, dlBlob } from './core.js';
import state from './state.js';

let fixtures = [];

/* ---------- Utils ---------- */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const normalizeStr = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '') // strip accenten
  .toLowerCase();

/* ---------- Rendering ---------- */
function renderLibrary() {
  const list  = $('#lib-list');
  const empty = $('#lib-empty');
  const qRaw  = ($('#lib-search')?.value || '').trim();
  const q     = normalizeStr(qRaw);

  if (!list || !empty) return;

  list.innerHTML = '';

  const rows = fixtures
    .slice()
    .sort((a, b) => collator.compare(`${a.brand||''} ${a.model||''}`, `${b.brand||''} ${b.model||''}`))
    .filter(x => {
      if (!q) return true;
      const hay = [
        normalizeStr(x.brand),
        normalizeStr(x.model),
        normalizeStr(x.mode),
        normalizeStr(x.notes),
      ];
      return hay.some(v => v.includes(q));
    });

  empty.hidden = rows.length !== 0;

  rows.forEach(x => {
    const div = document.createElement('div');
    div.className = 'item';

    const links = String(x.links || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const linksHtml = links.length
      ? `<div class="row-mini">${links.map(u => {
          const safeHref = escapeHTML(u);
          return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="badge">${escapeHTML(shortURL(u))}</a>`;
        }).join(' ')}</div>`
      : '';

    div.innerHTML = `
      <div class="row-mini">
        <span class="title">${escapeHTML(x.brand || '')} <span class="meta">•</span> ${escapeHTML(x.model || '')}</span>
        <span class="badge">${escapeHTML(x.mode || '–')}</span>
        <span class="badge">${x.footprint ?? '?'} ch</span>
        <div class="actions" style="margin-left:auto; display:flex; gap:8px">
          <button data-act="edit" data-id="${escapeHTML(x.id)}" type="button">Edit</button>
          <button data-act="del" data-id="${escapeHTML(x.id)}" class="btn-ghost" type="button">Delete</button>
        </div>
      </div>
      <div class="meta">${escapeHTML(x.notes || '')}</div>
      ${linksHtml}
    `;
    list.appendChild(div);
  });
}

/* ---------- Dialog ---------- */
function openFixtureDialog(existing = null) {
  const dlg  = $('#dlg-fixture');
  const form = $('#fixture-form');
  if (!dlg || !form) return;

  form.reset();

  // Prefill
  const els = form.elements;
  els.id.value        = existing?.id || '';
  els.brand.value     = existing?.brand || '';
  els.model.value     = existing?.model || '';
  els.mode.value      = existing?.mode || '';
  els.footprint.value = existing?.footprint ?? 16;
  els.links.value     = existing?.links || '';
  els.notes.value     = existing?.notes || '';

  // Focus op eerste veld
  dlg.addEventListener('close', onClose, { once: true });
  dlg.showModal();
  setTimeout(() => els.brand?.focus?.(), 0);

  function onClose() {
    if (dlg.returnValue !== 'save') return;

    const data = Object.fromEntries(new FormData(form).entries());
    const rec = {
      id: data.id || crypto.randomUUID(),
      brand: (data.brand || '').trim(),
      model: (data.model || '').trim(),
      mode: (data.mode || '').trim(),
      footprint: Number(data.footprint) || null,
      links: (data.links || '').trim(),
      notes: (data.notes || '').trim(),
    };

    if (!rec.brand || !rec.model) {
      toast('Brand and model are required', 'error');
      return;
    }

    const ix = fixtures.findIndex(f => f.id === rec.id);
    if (ix >= 0) fixtures[ix] = rec;
    else fixtures.push(rec);

    state.setLibrary(fixtures);
    renderLibrary();
    toast('Saved', 'success');
  }
}

/* ---------- Init ---------- */
export function initLibrary() {
  fixtures = Array.isArray(state.getLibrary()) ? state.getLibrary() : [];

  $('#lib-search')?.addEventListener('input', renderLibrary);

  $('#lib-clear')?.addEventListener('click', () => {
    const inp = $('#lib-search');
    if (inp) inp.value = '';
    renderLibrary();
  });

  $('#lib-add')?.addEventListener('click', () => openFixtureDialog());

  $('#lib-list')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') {
      openFixtureDialog(fixtures.find(f => f.id === id));
    }
    if (btn.dataset.act === 'del') {
      if (confirm('Delete this fixture?')) {
        fixtures = fixtures.filter(f => f.id !== id);
        state.setLibrary(fixtures);
        renderLibrary();
        toast('Deleted', 'info');
      }
    }
  });

  $('#lib-export')?.addEventListener('click', () => {
    try {
      const payload = JSON.stringify(fixtures, null, 2);
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      dlBlob(`fixtures-${stamp}.json`, new Blob([payload], { type: 'application/json' }));
      toast('Exported', 'success');
    } catch (err) {
      toast('Export failed: ' + (err?.message || err), 'error');
    }
  });

  $('#lib-import')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arr = JSON.parse(String(reader.result || '[]'));
          if (!Array.isArray(arr)) throw new Error('JSON must be an array');

          const mapped = arr.map(x => ({
            id: x.id || crypto.randomUUID(),
            brand: (x.brand || '').trim(),
            model: (x.model || '').trim(),
            mode: (x.mode || '').trim(),
            footprint: Number(x.footprint) || null,
            links: String(x.links || '').trim(),
            notes: String(x.notes || '').trim(),
          }));

          fixtures = mapped;
          state.setLibrary(fixtures);
          renderLibrary();
          toast('Imported fixtures', 'success');
        } catch (err) {
          toast('Import failed: ' + (err?.message || err), 'error');
        }
      };
      reader.readAsText(f);
    };
    inp.click();
  });

  // Sync tussen tabs
  state.onMessage?.(msg => {
    if (msg?.type === 'lib:update') {
      fixtures = Array.isArray(msg.payload) ? msg.payload : [];
      renderLibrary();
    }
  });

  renderLibrary();
}
