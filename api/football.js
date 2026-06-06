// Vercel Serverless Function — proxy para football-data.org
// Evita el bloqueo CORS del navegador.
// Variable de entorno requerida en Vercel: FD_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.FD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FD_API_KEY no configurada en Vercel' });
  }

  const path = req.query.path || '';
  if (!path.startsWith('/')) {
    return res.status(400).json({ error: 'path invalido' });
  }

  // Solo permitimos endpoints del Mundial para seguridad
  if (!path.startsWith('/competitions/')) {
    return res.status(403).json({ error: 'endpoint no permitido' });
  }

  try {
    const url = 'https://api.football-data.org/v4' + path;
    const upstream = await fetch(url, {
      headers: {
        'X-Auth-Token': apiKey,
        'Accept': 'application/json'
      }
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { error: 'respuesta no JSON', raw: text.slice(0, 200) }; }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Error contactando football-data.org', detail: err.message });
  }
};
