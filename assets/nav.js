import { $ } from './core.js';

export function renderHeader(active='addr'){
  const tabs = [
    {id:'addr',  href:'addressing.html', label:'Bulk Addressing'},
    {id:'dip',   href:'dip.html',        label:'DIP-Switch'},
    {id:'lib',   href:'library.html',    label:'Fixture Library'},
    {id:'gdtf',  href:'gdtf.html',       label:'GDTF Share'},
    {id:'about', href:'about.html',      label:'About'},
  ];

  const header = document.createElement('header');
  header.innerHTML = `
    <div class="app">
      <div class="head-wrap">
        <a class="logo" href="index.html" aria-label="LightingApp">
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset=".6" stop-color="#60a5fa"/></linearGradient></defs>
            <path d="M28 4c12 0 22 10 22 22 0 6-2 11-6 16l-10 12a4 4 0 0 1-6 0L18 42c-4-5-6-10-6-16C12 14 20 4 28 4Z" stroke="url(#g)" stroke-width="4"/>
            <circle cx="28" cy="26" r="8" fill="url(#g)"/>
          </svg>
          <span>LightingApp – Field Tools</span>
        </a>
        <span class="pill right"><span class="badge">Offline</span> No external deps</span>
      </div>
      <nav class="tabs" role="tablist" aria-label="Tools">
        ${tabs.map(t=> `<a class="tab" href="${t.href}" data-tab="${t.id}" ${t.id===active?'aria-current="page"':''}>${t.label}</a>`).join('')}
      </nav>
    </div>
  `;
  document.body.prepend(header);

  const yr = document.createElement('div');
  yr.innerHTML = `<footer>© <span id="yr"></span> LightingApp • Designed for on-site workflows</footer>`;
  $('#app')?.after(yr);
  document.getElementById('yr')?.appendChild(document.createTextNode(String(new Date().getFullYear())));
}
