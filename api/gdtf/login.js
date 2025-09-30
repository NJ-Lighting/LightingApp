// api/gdtf/login.js (of vergelijkbaar serverless endpoint)
const BASE = 'https://gdtf-share.com/apis/public';
const TIMEOUT_MS = 12000;

/** Probeer alle "set-cookie" varianten uit verschillende runtimes te lezen */
function getSetCookieArray(headers) {
  // Vercel Edge / undici
  if (typeof headers.getSetCookie === 'function') {
    try { const arr = headers.getSetCookie(); if (Array.isArray(arr)) return arr; } catch {}
  }
  // Node fetch polyfills: headers.raw()
  if (typeof headers.raw === 'function') {
    try { const raw = headers.raw(); if (raw && Array.isArray(raw['set-cookie'])) return raw['set-cookie']; } catch {}
  }
  // Standaard
  const one = headers.get && headers.get('set-cookie');
  return one ? [one] : [];
}

/** Harden (of versoepel voor dev) cookie-attributen en zet Path/HttpOnly/SameSite */
function normalizeCookieAttributes(c) {
  // verwijder Secure zodat http-dev het ook kan (in productie kun je Secure laten staan)
  let out = c.replace(/;?\s*Secure/ig, '');
  // forceer Path=/ (kan ontbreken of anders zijn)
  if (!/;\s*Path=/i.test(out)) out += '; Path=/';
  // forceer HttpOnly
  if (!/;\s*HttpOnly/i.test(out)) out += '; HttpOnly';
  // zet SameSite=Lax als niet aanwezig
  if (!/;\s*SameSite=/i.test(out)) out += '; SameSite=Lax';
  return out;
}

/** Kleine helper om JSON-veilig te parsen */
function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

module.exports = async (req, res) => {
  // --- CORS / preflight ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(405).json({ result: false, error: 'Method not allowed' });
    return;
  }

  try {
    // Parse body (string of object)
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const bodyObj = safeJson(raw) || {};
    const payload = {
      user: bodyObj.user,
      password: bodyObj.password
    };

    // Timeout controller
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    const upstream = await fetch(`${BASE}/login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: ctrl.signal
    }).finally(() => clearTimeout(t));

    // Response body (kan JSON of HTML/text zijn)
    const text = await upstream.text();
    const data = safeJson(text) || { result: false, error: 'Invalid JSON from upstream', raw: text };

    // Cookies ophalen en doorgeven (meerdere toegestaan)
    const upstreamCookies = getSetCookieArray(upstream.headers);
    if (upstreamCookies.length) {
      const normalized = upstreamCookies.map(normalizeCookieAttributes);
      // Vercel/Node: setHeader met array zorgt voor meerdere Set-Cookie headers
      res.setHeader('Set-Cookie', normalized);
    }

    // Forward wat nuttige headers
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(upstream.status || 200).json(data);
  } catch (e) {
    // CORS headers bij error
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const msg = (e && e.name === 'AbortError') ? 'Upstream timeout' : String(e);
    res.status(502).json({ result: false, error: 'Login proxy error', detail: msg });
  }
};
