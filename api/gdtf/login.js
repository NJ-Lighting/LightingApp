const BASE = 'https://gdtf-share.com/apis/public';

function pickCookie(headers, name) {
  const set =
    (headers.getSetCookie && headers.getSetCookie()) ||
    (headers.raw && headers.raw()['set-cookie']) ||
    headers.get('set-cookie');
  const arr = Array.isArray(set) ? set : (set ? [set] : []);
  return arr.find(c => c.startsWith(name + '=')) || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ result:false, error:'Method not allowed' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const upstream = await fetch(`${BASE}/login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: body.user, password: body.password }),
      redirect: 'manual'
    });

    const text = await upstream.text();
    let data; try { data = JSON.parse(text); } catch { data = { result:false, error:'Invalid JSON from upstream', raw:text }; }

    const phpsessid = pickCookie(upstream.headers, 'PHPSESSID') || pickCookie(upstream.headers, 'session');
    if (phpsessid) {
      res.setHeader('Set-Cookie', phpsessid.replace(/;?\s*Secure/ig, '') + '; Path=/; HttpOnly; SameSite=Lax');
    }

    res.status(upstream.status || 200).json(data);
  } catch (e) {
    res.status(502).json({ result:false, error:'Login proxy error', detail:String(e) });
  }
};
