// Globale navigatie: injecteert header + drawer op elke pagina
// Laad dit als laatste script in <body>: <script type="module" src="../js/nav.js"></script> of "/js/nav.js"

const BRAND = { title: "LightingApp", subtitle: "Field Tools" };

/** Detecteer of we in /pages/ zitten om juiste relatieve paden te bouwen */
const IN_PAGES_DIR = location.pathname.split('/').includes('pages');
const ROOT = IN_PAGES_DIR ? '../' : '';

/** Definieer routes 1x en laat resolve() het juiste pad bepalen */
const ROUTES = {
  home:   'index.html',
  addr:   'pages/addressing.html',
  dip:    'pages/dipswitch.html',
  gdtf:   'pages/gdtf.html',
  about:  'pages/about.html',
  // offline: 'offline.html', // optioneel
};

function resolve(pathLike){
  // pathLike is relatief t.o.v. project-root (zonder leading slash)
  return ROOT + pathLike;
}

const LINKS = [
  { label: "Start",           href: resolve(ROUTES.home),  icon: "🏠", meta: "Kies een tool" },
  { label: "Bulk Addressing", href: resolve(ROUTES.addr),  icon: "📦", meta: "Patch helper" },
  { label: "DIP-switch",      href: resolve(ROUTES.dip),   icon: "🎚️", meta: "Dimmers/DIP" },
  { label: "GDTF Library",    href: resolve(ROUTES.gdtf),  icon: "📁", meta: "Zoek & download" },
  { label: "About",           href: resolve(ROUTES.about), icon: "ℹ️", meta: "Over deze app" },
];

/** Bepaalt of link actief is (incl. root → /index.html) */
function isActive(href){
  try{
    const here = location.pathname; // bv: "/pages/dipswitch.html" of "/"
    const target = new URL(href, location.origin).pathname; // "/index.html" etc.

    // Normalizeer home: "/" == "/index.html"
    if ((target.endsWith('/index.html') && (here === '/' || here.endsWith('/')))
      || (here.endsWith('/index.html') && target === '/')) {
      return true;
    }
    return here === target;
  }catch{
    const here = location.pathname.replace(/\\/g,'/').toLowerCase();
    const norm = href.replace(/\\/g,'/').toLowerCase();
    return here.endsWith(norm) || here === norm || (norm.endsWith('index.html') && (here === '/' || here.endsWith('/')));
  }
}

function injectHeader(){
  const header = document.createElement('header');
  header.className = 'la-header';
  header.innerHTML = `
    <button class="la-hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="la-drawer">
      <span class="bars">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </span>
    </button>
    <div class="la-brand" role="banner">
      <div class="la-logo" aria-hidden="true"></div>
      <div class="la-title">${BRAND.title} <span style="color:var(--muted);font-weight:500">– ${BRAND.subtitle}</span></div>
    </div>
    <div style="margin-left:auto"></div>
  `;
  document.body.prepend(header);
}

function injectDrawer(){
  const backdrop = document.createElement('div');
  backdrop.className = 'la-drawer-backdrop';
  backdrop.id = 'la-backdrop';

  const drawer = document.createElement('aside');
  drawer.className = 'la-drawer';
  drawer.id = 'la-drawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('tabindex','-1');

  drawer.innerHTML = `
    <div class="la-drawer-head">
      <div class="la-drawer-title">Menu</div>
    </div>
    <div class="la-drawer-search">
      <input class="la-input" id="la-filter" type="search" placeholder="Zoek tool…" />
    </div>
    <nav class="la-nav" aria-label="Hoofdmenu">
      <div id="la-links" role="menu"></div>
    </nav>
    <div class="la-drawer-footer">© ${new Date().getFullYear()} LightingApp • v1</div>
  `;

  document.body.append(backdrop, drawer);

  // Render links
  const wrap = drawer.querySelector('#la-links');
  function render(filter=""){
    wrap.innerHTML = "";
    const q = filter.trim().toLowerCase();
    LINKS
      .filter(l => !q || l.label.toLowerCase().includes(q) || (l.meta||"").toLowerCase().includes(q))
      .forEach(link => {
        const a = document.createElement('a');
        a.className = 'la-link';
        a.href = link.href;
        a.setAttribute('role','menuitem');
        if (isActive(link.href)) a.setAttribute('aria-current','page');
        a.innerHTML = `
          <div class="icon" aria-hidden="true">${link.icon || "•"}</div>
          <div class="text">
            <div class="label">${link.label}</div>
            <div class="meta">${link.meta || ""}</div>
          </div>
          ${isActive(link.href) ? `<span class="badge">actief</span>` : `<span></span>`}
        `;
        wrap.appendChild(a);
      });
  }
  render();

  // Filter
  drawer.querySelector('#la-filter').addEventListener('input', (e)=> render(e.target.value));

  // Open/close handlers
  const btn = document.querySelector('.la-hamburger');
  const firstFocusable = ()=> drawer.querySelector('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');

  function open(){
    drawer.classList.add('open');
    backdrop.classList.add('open');
    btn?.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    const f = firstFocusable();
    setTimeout(()=> f && f.focus(), 10);
    document.addEventListener('keydown', onKey);
  }
  function close(){
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    btn?.focus();
    document.removeEventListener('keydown', onKey);
  }
  function toggle(){
    drawer.classList.contains('open') ? close() : open();
  }
  function onKey(e){
    if(e.key === 'Escape') close();
    if(e.altKey && (e.key === 'm' || e.key === 'M')){ e.preventDefault(); toggle(); }
    if(e.key === 'Tab'){
      const focusables = drawer.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if(!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length-1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  btn?.addEventListener('click', toggle);
  backdrop.addEventListener('click', close);

  // ✅ Sluit bij klik op een link
  drawer.addEventListener('click', (e)=>{
    const a = e.target.closest('a.la-link');
    if(a){ close(); }
  });

  // Swipe-to-close (mobiel)
  let startX=null;
  drawer.addEventListener('touchstart', (e)=> { startX = e.touches[0].clientX; }, {passive:true});
  drawer.addEventListener('touchmove',  (e)=> {
    if(startX==null) return;
    const dx = e.touches[0].clientX - startX;
    if(dx < -40) { close(); startX=null; }
  }, {passive:true});

  // Expose optioneel
  window.LA_NAV = {
    open, close, render,
    setLinks(list){
      if(Array.isArray(list)){
        // overschrijf defensief velden die bestaan; behoud icons/labels/meta als niet meegegeven
        const next = list.map((it, i) => ({ ...LINKS[i], ...it }));
        LINKS.splice(0, LINKS.length, ...next);
        render();
      }
    }
  };
}

// Boot + CSS fallback (als iemand nav.css vergeet te linken)
(function boot(){
  // Check of nav.css al gelinkt is
  const hasCss = [...document.styleSheets].some(s => {
    try{
      const href = (s.href || '').toLowerCase();
      return href.endsWith('/css/nav.css') || href.endsWith('css/nav.css');
    }catch{
      return false;
    }
  });
  if(!hasCss){
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (IN_PAGES_DIR ? '../' : '') + 'css/nav.css';
    document.head.appendChild(link);
  }

  injectHeader();
  injectDrawer();
})();
