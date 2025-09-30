// api/gdtf/getList.js
const BASE = 'https://gdtf-share.com/apis/public';
const TIMEOUT_MS = 12000;

/** Lees alle mogelijke vormen van set-cookie-headers (verschillende runtimes) */
function getSetCookieArray(headers) {
  if (typeof headers.getSetCookie === 'function') {
    try { const arr = headers.getSetCookie(); if (Array.isArray(arr)) return arr; } catch {}
  }
  if (typeof headers.raw === 'function') {
    try { const raw = headers.raw(); if (raw && Array.isArray(raw['set-cookie'])) return raw['set-cookie']; } catch {}
  }
  const one = headers.get && headers.get('set-cookie');
  return one ? [one] : [];
}

/** JSON veilig parsen */
function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

module.exports = async (req, res) => {
  // --- CORS / preflight ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(405).json({ result:false, error:'Method not allowed' });
    return;
  }

  try {
    const cookie = req.headers.cookie || '';

    // Timeout controller
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    const upstream = await fetch(`${BASE}/getList.php`, {
      headers: {
        cookie,
        'Accept': 'application/json'
      },
      redirect: 'manual',
      signal: ctrl.signal
    }).finally(() => clearTimeout(t));

    const text = await upstream.text();
    const data = safeJson(text) || { result:false, error:'Invalid JSON from upstream', raw:text };

    // eventuele upstream cookies doorzetten
    const setCookies = getSetCookieArray(upstream.headers);
    if (setCookies.length) {
      res.setHeader('Set-Cookie', setCookies);
    }

    // nuttige headers doorgeven
    const cacheControl = upstream.headers.get && upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(upstream.status || 200).json(data);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const detail = (e && e.name === 'AbortError') ? 'Upstream timeout' : String(e);
    res.status(502).json({ result:false, error:'GetList proxy error', detail });
  }
};
