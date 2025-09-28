const BASE = 'https://gdtf-share.com/apis/public';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ result:false, error:'Method not allowed' });
    return;
  }
  const rid = (req.query && req.query.rid) || (new URL(req.url, 'http://x').searchParams.get('rid'));
  if (!rid) { res.status(400).json({ result:false, error:'Missing rid' }); return; }

  try {
    const cookie = req.headers.cookie || '';
    const upstream = await fetch(`${BASE}/downloadFile.php?rid=${encodeURIComponent(rid)}`, {
      headers: { cookie },
      redirect: 'manual'
    });

    const ct = upstream.headers.get('content-type') || '';
    if (!upstream.ok || ct.includes('application/json')) {
      const text = await upstream.text();
      let data; try { data = JSON.parse(text); } catch { data = { result:false, error:'Upstream error', raw:text }; }
      res.status(upstream.status || 500).json(data);
      return;
    }

    res.setHeader('Content-Type', ct || 'application/octet-stream');
    const disp = upstream.headers.get('content-disposition') || `attachment; filename="file.gdtf"`;
    res.setHeader('Content-Disposition', disp);

    const reader = upstream.body.getReader();
    res.status(200);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    res.status(502).json({ result:false, error:'Download proxy error', detail:String(e) });
  }
};
