export const $  = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
export const UNIVERSE_SIZE = 512;

export function toast(msg,type='info'){
  const colors = {success:'#16a34a', error:'#ef4444', info:'#1f2a3a', warning:'#f59e0b'};
  const fg = {success:'#bbf7d0', error:'#fecaca', info:'#e7eaf0', warning:'#fff7ed'};
  const d = document.createElement('div');
  d.textContent = msg;
  const c = colors[type] || colors.info;
  const fgc = fg[type] || fg.info;
  d.style.cssText = `
    position:fixed; left:50%; transform:translateX(-50%); bottom:20px; z-index:1000;
    background:#0e1a2c; border:1px solid ${c}; color:${fgc};
    padding:10px 14px; border-radius:12px; box-shadow:var(--shadow); font-weight:600; letter-spacing:.2px;
  `;
  document.body.appendChild(d);
  setTimeout(()=> d.remove(), 1800);
}

export function dlBlob(filename, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

export function copyText(t){
  return navigator.clipboard.writeText(t);
}

export function escapeHTML(s){ return (s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
export function shortURL(u){ try{ const {host,pathname} = new URL(u); return host + pathname.replace(/\/$/,''); }catch{return u} }
export function isFormFocused(){
  const el = document.activeElement;
  return el && ['INPUT','SELECT','TEXTAREA'].includes(el.tagName);
}
