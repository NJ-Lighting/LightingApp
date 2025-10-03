export const $  = (sel, root = document) => root?.querySelector?.(sel);
export const $$ = (sel, root = document) => Array.from(root?.querySelectorAll?.(sel) || []);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const UNIVERSE_SIZE = 512;

/**
 * Toast melding
 * @param {string} msg
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 * @param {number} [duration=1800] - duur in ms
 */
export function toast(msg, type = 'info', duration = 1800) {
  const colors = { success: '#16a34a', error: '#ef4444', info: '#1f2a3a', warning: '#f59e0b' };
  const fg     = { success: '#bbf7d0', error: '#fecaca', info: '#e7eaf0', warning: '#fff7ed' };

  // 1 container die toasts stapelt
  let container = document.getElementById('la-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'la-toast-container';
    container.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 1000; display: flex; flex-direction: column; gap: 8px;
      align-items: center; pointer-events: none;
    `;
    // aria-live op itemniveau hieronder, container blijft neutraal
    document.body.appendChild(container);
  }

  const c = colors[type] || colors.info;
  const fgc = fg[type] || fg.info;

  const d = document.createElement('div');
  d.textContent = String(msg ?? '');
  d.style.cssText = `
    background:#0e1a2c; border:1px solid ${c}; color:${fgc};
    padding:10px 14px; border-radius:12px; box-shadow:var(--shadow, 0 6px 20px rgba(0,0,0,.35));
    font-weight:600; letter-spacing:.2px; max-width: min(90vw, 520px);
    pointer-events: auto; user-select: none;
    transform: translateY(6px); opacity: 0; will-change: transform, opacity;
    transition: transform .2s ease, opacity .2s ease;
  `;
  // A11y: error/warning = alert (assertive), info/success = status (polite)
  d.setAttribute('role', (type === 'error' || type === 'warning') ? 'alert' : 'status');
  d.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');

  // Beperk aantal toasts (anti-spam)
  const MAX_TOASTS = 4;
  while (container.childElementCount >= MAX_TOASTS) {
    container.firstElementChild?.remove();
  }

  container.appendChild(d);
  // enter anim
  requestAnimationFrame(() => {
    d.style.transform = 'translateY(0)';
    d.style.opacity = '1';
  });

  // Auto-close, pauzeer op hover
  const closeAfter = Math.max(600, Number(duration) || 1800);
  let remaining = closeAfter;
  let timerId = null;
  let lastStart = Date.now();

  const startTimer = () => {
    clearTimeout(timerId);
    lastStart = Date.now();
    timerId = setTimeout(close, remaining);
  };
  const pauseTimer = () => {
    clearTimeout(timerId);
    remaining -= (Date.now() - lastStart);
  };
  const close = () => {
    // exit anim
    d.style.transform = 'translateY(6px)';
    d.style.opacity = '0';
    setTimeout(() => {
      d.remove();
      if (!container.childElementCount) container.remove();
    }, 180);
  };

  d.addEventListener('mouseenter', pauseTimer);
  d.addEventListener('mouseleave', startTimer);
  // klik = meteen sluiten
  d.addEventListener('click', () => {
    pauseTimer(); // freeze
    close();
  }, { once: true });

  startTimer();
}

/**
 * Download een Blob als file (met nette cleanup)
 */
export function dlBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  // in DOM is niet vereist, maar verhoogt compat
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke in microtask + failsafe timeout
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 0);
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 2500);
}

/**
 * Kopieer tekst naar klembord met fallback
 * @returns {Promise<void>}
 */
export function copyText(t) {
  const txt = String(t ?? '');
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(txt);
  }
  // Fallback (http/legacy)
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', 'true');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand?.('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy command failed'));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Escape HTML
 */
export function escapeHTML(s) {
  return (s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/**
 * Korte URL-weergave (host + pathname)
 */
export function shortURL(u) {
  try {
    const { host, pathname } = new URL(u);
    return host + pathname.replace(/\/$/, '');
  } catch {
    return String(u ?? '');
  }
}

/**
 * Of een invoerveld focus heeft (incl. contenteditable)
 */
export function isFormFocused() {
  const el = document.activeElement;
  if (!el) return false;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return true;
  // contenteditable = true
  // @ts-ignore
  if (el.isContentEditable) return true;
  return false;
}
