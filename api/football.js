// Vercel Serverless Function — proxy para football-data.org
// Evita el bloqueo CORS del navegador.
// Despliega en Vercel y añade la variable de entorno: FD_API_KEY

export default async function handler(req, res) {
  // CORS headers — permite llamadas desde cualquier origen (tu web en Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.FD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FD_API_KEY no configurada en Vercel' });
  }

  const path = req.query.path;
  if (!path || !path.startsWith('/')) {
    return res.status(400).json({ error: 'path inválido' });
  }

  // Solo permitimos endpoints de football-data.org para el Mundial
  const allowed = ['/competitions/2000/standings', '/competitions/2000/matches'];
  const base = path.split('?')[0];
  if (!allowed.some(a => base.startsWith(a))) {
    return res.status(403).json({ error: 'endpoint no permitido' });
  }

  try {
    const url = 'https://api.football-data.org/v4' + path;
    const upstream = await fetch(url, {
      headers: { 'X-Auth-Token': apiKey }
    });

    const data = await upstream.json();

    // Cache 5 minutos en CDN de Vercel para no agotar el límite gratuito
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Error al contactar football-data.org', detail: err.message });
  }
}
