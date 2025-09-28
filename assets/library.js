import { $, $$, toast, escapeHTML, shortURL } from './core.js';
import state from './state.js';

let fixtures = [];

function renderLibrary(){
  const list = $('#lib-list');
  const empty = $('#lib-empty');
  const q = ($('#lib-search')?.value || '').trim().toLowerCase();

  list.innerHTML='';
  const rows = fixtures
    .slice()
    .sort((a,b)=> (a.brand+a.model).localeCompare(b.brand+b.model))
    .filter(x=> !q || [x.brand,x.model,x.mode,x.notes].some(v=> (v||'').toLowerCase().includes(q)));

  empty.hidden = rows.length !== 0;
  rows.forEach(x=>{
    const div = document.createElement('div');
    div.className='item';
    const links = (x.links||'').split(',').map(s=>s.trim()).filter(Boolean);
    div.innerHTML = `
      <div class="row-mini">
        <span class="title">${escapeHTML(x.brand)} <span class="meta">•</span> ${escapeHTML(x.model)}</span>
        <span class="badge">${escapeHTML(x.mode||'–')}</span>
        <span class="badge">${x.footprint||'?'} ch</span>
        <div class="actions" style="margin-left:auto; display:flex; gap:8px">
          <button data-act="edit" data-id="${x.id}">Edit</button>
          <button data-act="del" data-id="${x.id}" class="btn-ghost">Delete</button>
        </div>
      </div>
      <div class="meta">${escapeHTML(x.notes||'')}</div>
      ${links.length? `<div class="row-mini">${links.map(u=> `<a href="${u}" target="_blank" rel="noopener" class="badge">${shortURL(u)}</a>`).join(' ')}</div>`:''}
    `;
    list.appendChild(div);
  });
}

function openFixtureDialog(existing=null){
  const dlg = $('#dlg-fixture');
  const form = $('#fixture-form');
  form.reset();
  form.elements.id.value = existing?.id || '';
  form.elements.brand.value = existing?.brand || '';
  form.elements.model.value = existing?.model || '';
  form.elements.mode.value = existing?.mode || '';
  form.elements.footprint.value = existing?.footprint || 16;
  form.elements.links.value = existing?.links || '';
  form.elements.notes.value = existing?.notes || '';
  dlg.showModal();
  dlg.onclose = null;
  dlg.addEventListener('close', ()=>{
    if(dlg.returnValue === 'save'){
      const data = Object.fromEntries(new FormData(form).entries());
      const rec = {
        id: data.id || crypto.randomUUID(),
        brand: (data.brand||'').trim(),
        model: (data.model||'').trim(),
        mode: (data.mode||'').trim(),
        footprint: Number(data.footprint)||null,
        links: (data.links||'').trim(),
        notes: (data.notes||'').trim(),
      };
      if(!rec.brand || !rec.model){ toast('Brand and model are required','error'); return; }
      const ix = fixtures.findIndex(f=>f.id===rec.id);
      if(ix>=0) fixtures[ix] = rec; else fixtures.push(rec);
      state.setLibrary(fixtures);
      renderLibrary();
      toast('Saved','success');
    }
  }, {once:true});
}

export function initLibrary(){
  fixtures = state.getLibrary();

  $('#lib-search')?.addEventListener('input', renderLibrary);
  $('#lib-clear')?.addEventListener('click', ()=>{ $('#lib-search').value=''; renderLibrary(); });
  $('#lib-add')?.addEventListener('click',()=> openFixtureDialog());
  $('#lib-list')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.act==='edit'){ openFixtureDialog(fixtures.find(f=>f.id===id)); }
    if(btn.dataset.act==='del'){ if(confirm('Delete this fixture?')){ fixtures = fixtures.filter(f=>f.id!==id); state.setLibrary(fixtures); renderLibrary(); } }
  });
  $('#lib-export')?.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(fixtures,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fixtures.json';
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#lib-import')?.addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange = ()=> {
      const f = inp.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const arr = JSON.parse(reader.result);
          if(!Array.isArray(arr)) throw new Error('JSON must be an array');
          const mapped = arr.map(x=> ({
            id: x.id || crypto.randomUUID(),
            brand: x.brand||'',
            model: x.model||'',
            mode: x.mode||'',
            footprint: Number(x.footprint)||null,
            links: x.links||'',
            notes: x.notes||'',
          }));
          fixtures = mapped;
          state.setLibrary(fixtures);
          renderLibrary(); toast('Imported fixtures','success');
        }catch(err){ toast('Import failed: '+err.message,'error'); }
      };
      reader.readAsText(f);
    };
    inp.click();
  });

  // Cross-page updates (GDTF add etc.)
  state.onMessage(msg=>{
    if(msg?.type==='lib:update'){
      fixtures = msg.payload||[];
      renderLibrary();
    }
  });

  renderLibrary();
}
