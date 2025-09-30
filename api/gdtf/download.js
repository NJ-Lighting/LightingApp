// api/gdtf/download.js
const BASE = 'https://gdtf-share.com/apis/public';
const TIMEOUT_MS = 20000;

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

/** Veilige JSON parse */
function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** Eenvoudige header-sanitizer om CR/LF injectie te voorkomen */
function sanitizeHeaderValue(v) {
  return String(v || '').replace(/[\r\n]+/g, ' ').trim();
}

/** Rid uitlezen robust (serverless/express/edge) */
function getRid(req) {
  if (req.query && req.query.rid) return req.query.rid;
  try {
    const u = new URL(req.url, 'http://local');
    const rid = u.searchParams.get('rid');
    if (rid) return rid;
  } catch {}
  return null;
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

  const rid = getRid(req);
  if (!rid) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(400).json({ result:false, error:'Missing rid' });
    return;
  }

  try {
    const cookie = req.headers.cookie || '';

    // Timeout controller
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    const upstream = await fetch(`${BASE}/downloadFile.php?rid=${encodeURIComponent(rid)}`, {
      headers: { cookie, 'Accept': '*/*' },
      redirect: 'manual',
      signal: ctrl.signal
    }).finally(() => clearTimeout(t));

    // Eventuele upstream cookies doorzetten
    const setCookies = getSetCookieArray(upstream.headers);
    if (setCookies.length) {
      res.setHeader('Set-Cookie', setCookies);
    }

    const ct = upstream.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');

    if (!upstream.ok || isJson) {
      // Upstream gaf een fout of JSON terug i.p.v. bestand
      const text = await upstream.text();
      const data = safeJson(text) || { result:false, error:'Upstream error', raw:text };

      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.status(upstream.status || 500).json(data);
      return;
    }

    // Headers doorzetten
    const contentType = sanitizeHeaderValue(ct) || 'application/octet-stream';
    const upstreamDisp = upstream.headers.get('content-disposition');
    // fallback filename als upstream het niet geeft
    const fallbackName = `file-RID${encodeURIComponent(rid)}.gdtf`;
    const contentDisposition = sanitizeHeaderValue(
      upstreamDisp || `attachment; filename="${fallbackName}"`
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition);

    // Content-Length indien bekend (sommige backends geven het niet)
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', sanitizeHeaderValue(cl));

    // Cache hint (optional): laat browser zelf beslissen als upstream iets zette
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', sanitizeHeaderValue(cacheControl));

    // CORS voor de download
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Streamen naar de client (web streams of node streams)
    const body = upstream.body;

    // 1) Node stream-achtige (als beschikbaar)
    if (body && typeof body.pipe === 'function') {
      res.status(200);
      body.pipe(res);
      return;
    }

    // 2) Web ReadableStream reader (Edge/undici)
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      res.status(200);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
      res.end();
      return;
    }

    // 3) Fallback: als body geen stream is, lees als buffer
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).end(buf);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const detail = (e && e.name === 'AbortError') ? 'Upstream timeout' : String(e);
    res.status(502).json({ result:false, error:'Download proxy error', detail });
  }
};
