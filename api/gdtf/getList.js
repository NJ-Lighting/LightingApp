const BASE = 'https://gdtf-share.com/apis/public';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ result:false, error:'Method not allowed' });
    return;
  }
  try {
    const cookie = req.headers.cookie || '';
    const upstream = await fetch(`${BASE}/getList.php`, {
      headers: { cookie },
      redirect: 'manual'
    });

    const text = await upstream.text();
    let data; try { data = JSON.parse(text); } catch { data = { result:false, error:'Invalid JSON from upstream', raw:text }; }
    res.status(upstream.status || 200).json(data);
  } catch (e) {
    res.status(502).json({ result:false, error:'GetList proxy error', detail:String(e) });
  }
};
