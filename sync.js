/**
 * PORRA MUNDIAL 2026 — Sincronizador automático de resultados
 * ============================================================
 * Ejecuta: node sync.js
 *
 * Qué hace:
 *  - Comprueba si hay partidos en curso cada 2 minutos
 *  - Si hay partido en vivo, actualiza cada 60 segundos
 *  - Si no hay partido, comprueba cada 5 minutos
 *  - Actualiza data.json en GitHub con los resultados
 *  - Todos los visitantes de la web ven los datos actualizados
 *
 * Requisitos:
 *  - Node.js 18+ (para fetch nativo)
 *  - Configurar las variables en el bloque CONFIG más abajo
 *
 * API gratuita: https://dashboard.api-football.com (100 req/día gratis)
 */

// ══════════════════════════════════════════════════════════════
//  CONFIGURA AQUÍ — solo necesitas rellenar estas 3 variables
// ══════════════════════════════════════════════════════════════
const CONFIG = {
  // En local: rellena estos valores
  // En GitHub Actions: se leen automáticamente de los Secrets del repo
  FD_API_KEY:  process.env.FD_API_KEY  || 'TU_API_KEY_DE_FOOTBALL-DATA.ORG',
  GH_TOKEN:    process.env.GH_TOKEN    || 'TU_GITHUB_PERSONAL_ACCESS_TOKEN',
  GH_OWNER:    process.env.GH_OWNER    || 'TU_USUARIO_GITHUB',
  GH_REPO:     process.env.GH_REPO     || 'porra-mundial-2026',
};
// ══════════════════════════════════════════════════════════════

const FD_BASE   = 'https://api.football-data.org/v4';
const WC_CODE   = 'WC';   // football-data.org competition code
const GH_FILE   = 'data.json';

// Mapa de nombres de equipos API → nombres usados en la porra
const TEAM_MAP = {
  'Mexico': 'Mexico', 'South Africa': 'Sudafrica', 'South Korea': 'Corea del Sur',
  'Czech Republic': 'Republica Checa', 'Canada': 'Canada', 'Bosnia': 'Bosnia y Herzegovina',
  'Qatar': 'Qatar', 'Switzerland': 'Suiza', 'Brazil': 'Brasil', 'Morocco': 'Marruecos',
  'Haiti': 'Haiti', 'Scotland': 'Escocia', 'USA': 'Estados Unidos', 'Panama': 'Panama',
  'Tunisia': 'Tunez', 'Albania': 'Albania', 'Germany': 'Alemania', 'Ecuador': 'Ecuador',
  'Colombia': 'Colombia', 'Uzbekistan': 'Uzbekistan', 'Japan': 'Japon',
  'Senegal': 'Senegal', 'Netherlands': 'Paises Bajos', 'Norway': 'Noruega',
  'France': 'Francia', 'Belgium': 'Belgica', 'Saudi Arabia': 'Arabia Saudi',
  'Denmark': 'Dinamarca', 'Portugal': 'Portugal', 'Argentina': 'Argentina',
  'Iraq': 'Irak', 'New Zealand': 'Nueva Zelanda', 'Spain': 'Espana',
  'Cape Verde': 'Cabo Verde', 'Uruguay': 'Uruguay', 'England': 'Inglaterra',
  'Iran': 'Iran', 'Jordan': 'Jordania', 'Ghana': 'Ghana', 'Curacao': 'Curazao',
  'Turkey': 'Turquia', 'Algeria': 'Argelia', 'DR Congo': 'RD Congo',
  'Croatia': 'Croacia', 'Serbia': 'Serbia', 'Australia': 'Australia',
};

function normTeam(name) {
  return TEAM_MAP[name] || name;
}

// ── GitHub helpers ────────────────────────────────────────────
async function ghGet() {
  const url = `https://api.github.com/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/contents/${GH_FILE}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${CONFIG.GH_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(`GitHub GET ${r.status}`);
  const json = await r.json();
  const data = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
  return { data, sha: json.sha };
}

async function ghPut(data, sha, message) {
  const url = `https://api.github.com/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/contents/${GH_FILE}`;
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = { message, content };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CONFIG.GH_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${r.status}: ${err.message}`);
  }
}

// ── API-Football helpers ──────────────────────────────────────
async function fdGet(path) {
  const r = await fetch(FD_BASE + path, {
    headers: { 'X-Auth-Token': CONFIG.FD_API_KEY }
  });
  if (!r.ok) throw new Error(`API-Football ${r.status}`);
  const json = await r.json();
  if (json.errorCode) {
    throw new Error('API error: ' + (json.message || json.errorCode));
  }
  return json;
}

async function getLiveFixtures() {
  // football-data.org: matches with status IN_PLAY or PAUSED
  const data = await fdGet(`/competitions/${WC_CODE}/matches?status=IN_PLAY`);
  return (data.matches || []);
}

async function getTodayFixtures() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await fdGet(`/competitions/${WC_CODE}/matches?dateFrom=${today}&dateTo=${today}`);
  return (data.matches || []);
}

// ── Main sync logic ───────────────────────────────────────────
function fixtureToKey(f) {
  // football-data.org structure: f.utcDate, f.homeTeam.name, f.awayTeam.name
  const date = (f.utcDate || '').slice(0, 10);
  const home = normTeam(f.homeTeam.shortName || f.homeTeam.name);
  const away = normTeam(f.awayTeam.shortName || f.awayTeam.name);
  return `${date}_${home}_${away}`;
}

async function sync() {
  console.log(`[${new Date().toLocaleTimeString('es-ES')}] Sincronizando...`);

  try {
    // 1. Get current data.json from GitHub
    const { data: ghData, sha } = await ghGet();
    const state = ghData || { participants: [], results: {}, matchResults: {} };
    if (!state.matchResults) state.matchResults = {};

    let changed = false;

    // 2. Get today's fixtures + live status
    const todayFixtures = await getTodayFixtures();
    const liveFixtures  = await getLiveFixtures();
    const liveIds = new Set(liveFixtures.map(f => f.id));

    for (const f of todayFixtures) {
      const key  = fixtureToKey(f);
      const hg   = f.score?.fullTime?.home ?? null;
      const ag   = f.score?.fullTime?.away ?? null;
      const live = liveIds.has(f.id);
      const fin  = f.status === 'FINISHED';

      const prev = state.matchResults[key];

      if (hg !== null && ag !== null) {
        const next = { hg, ag, live: live && !fin };
        if (!prev || prev.hg !== hg || prev.ag !== ag || prev.live !== next.live) {
          state.matchResults[key] = next;
          changed = true;
          const status = live ? '🔴 EN VIVO' : fin ? '✅ Final' : '⏳';
          console.log(`  ${status} ${normTeam(f.homeTeam.shortName||f.homeTeam.name)} ${hg}-${ag} ${normTeam(f.awayTeam.shortName||f.awayTeam.name)}`);
        }
      }
    }

    // 3. Commit to GitHub if anything changed
    if (changed) {
      await ghPut(state, sha, `Auto-sync results ${new Date().toISOString().slice(0,16)}`);
      console.log(`  ✓ data.json actualizado en GitHub`);
    } else {
      console.log(`  Sin cambios`);
    }

    // 4. Return whether there are live matches (to adjust polling interval)
    return liveFixtures.length > 0;

  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return false;
  }
}

// ── Polling loop ──────────────────────────────────────────────
const INTERVAL_LIVE    = 60 * 1000;        // 1 min cuando hay partido en vivo
const INTERVAL_IDLE    = 5 * 60 * 1000;    // 5 min cuando no hay partido

// World Cup dates: only poll during the tournament
function isTournamentActive() {
  const now  = new Date();
  const start = new Date('2026-06-11');
  const end   = new Date('2026-07-20');
  return now >= start && now <= end;
}

async function loop() {
  if (!isTournamentActive()) {
    console.log('El Mundial aún no ha empezado (o ya terminó). El script arrancará a partir del 11 de junio de 2026.');
    console.log('Dejándolo en espera... (comprobará cada hora)');
    setTimeout(loop, 60 * 60 * 1000);
    return;
  }

  const hasLive = await sync();
  const delay = hasLive ? INTERVAL_LIVE : INTERVAL_IDLE;
  console.log(`  Próxima comprobación en ${delay / 1000}s\n`);
  setTimeout(loop, delay);
}

// ── Startup ───────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════');
console.log('  PORRA MUNDIAL 2026 — Sincronizador automático');
console.log('═══════════════════════════════════════════════');

if (!CONFIG.FD_API_KEY || CONFIG.FD_API_KEY.startsWith('TU_')) {
  console.error('\n✗ Configura FD_API_KEY, GH_TOKEN, GH_OWNER y GH_REPO antes de ejecutarlo.\n');
  process.exit(1);
}

console.log(`Repo: ${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}`);
console.log(`API:  football-data.org (competition=${WC_CODE})\n`);

const ONCE = process.argv.includes('--once');

if (ONCE) {
  // Modo GitHub Actions: ejecuta una vez y sale
  (async () => {
    if (!isTournamentActive()) {
      console.log('Fuera del periodo del Mundial. Sin cambios.');
      process.exit(0);
    }
    await sync();
    process.exit(0);
  })();
} else {
  // Modo local: bucle continuo
  loop();
}
