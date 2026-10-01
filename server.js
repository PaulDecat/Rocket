'use strict';
// ROCKET — serveur HTTP : API + fichiers statiques.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- .env (parseur maison) ----------
function loadEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch (e) { /* fichier absent : normal */ }
}
loadEnv(path.join(__dirname, '.env'));

const sources = require('./lib/sources');
const signals = require('./lib/signals');
const { buildScript } = require('./lib/script');
const assistant = require('./lib/assistant');
const tts = require('./lib/tts-edge');
const music = require('./lib/music');
const lifestyle = require('./lib/lifestyle');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const LOCAL_ONLY_MSG = "Disponible uniquement sur l'ordinateur qui fait tourner Rocket.";

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

// ---------- Briefing (cache 10 min) ----------
let cache = null, pending = null;
const TTL = 10 * 60 * 1000;

async function buildBriefing() {
  const [markets, news, politics, cinema] = await Promise.all([sources.getMarkets(), sources.getNews(), sources.getPolitics(), sources.getCinema()]);
  for (const m of markets) m.stats = signals.computeStats(m);
  const radar = signals.buildRadar(markets);
  const recipe = lifestyle.recipeOfDay();
  const tip = lifestyle.tipOfDay();
  const script = buildScript({ markets, news: news.items, radar, politics: politics.items, recipe, tip });
  const liveCount = markets.filter((m) => m.live).length;
  return {
    generatedAt: Date.now(),
    live: { markets: liveCount === markets.length ? true : liveCount === 0 ? false : 'partial', news: news.live, politics: politics.live, cinema: cinema.live },
    markets, news: news.items, politics: politics.items, cinema: cinema.items, radar, script,
    lifestyle: { recipeOfDay: recipe.id, recipes: lifestyle.seasonalRecipes(), allRecipes: lifestyle.RECIPES, season: lifestyle.season(), tip, tips: lifestyle.TIPS, habits: lifestyle.HABITS },
  };
}

async function getBriefing(refresh) {
  if (!refresh && cache && Date.now() - cache.generatedAt < TTL) return cache;
  if (!pending) {
    pending = buildBriefing().then((b) => { cache = b; return b; }).finally(() => { pending = null; });
  }
  return pending;
}

// ---------- Utilitaires HTTP ----------
// Sur un hébergeur (Render), il n'y a pas d'« ordinateur » à protéger : les questions sont ouvertes.
const HOSTED = !!process.env.RENDER || process.env.ALLOW_REMOTE_ASK === '1';

function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const j = JSON.parse(raw);
        resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {});
      } catch (e) { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end('Requête invalide'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0')) { res.writeHead(400); return res.end('Requête invalide'); }
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Interdit'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- Routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      name: 'Rocket', tts: tts.provider(), voices: tts.VOICES, defaultVoice: tts.DEFAULT_VOICE, version: 2,
      ai: assistant.getMode(), local: isLocal(req),
    });
  }

  if (p === '/api/briefing' && req.method === 'GET') {
    const b = await getBriefing(url.searchParams.has('refresh'));
    return sendJson(res, 200, b);
  }

  if (p === '/api/intraday' && req.method === 'GET') {
    const symbol = url.searchParams.get('symbol') || '';
    const range = url.searchParams.get('range') === '5d' ? '5d' : '1d';
    if (!sources.INSTRUMENTS.some((i) => i.symbol === symbol)) return sendJson(res, 400, { error: 'Symbole inconnu' });
    return sendJson(res, 200, await sources.getIntraday(symbol, range));
  }

  if (p === '/api/ask' && req.method === 'POST') {
    if (!isLocal(req) && !HOSTED) return sendJson(res, 403, { error: LOCAL_ONLY_MSG });
    const body = await readBody(req);
    if (typeof body.question !== 'string' || !body.question.trim()) return sendJson(res, 400, { error: 'Question manquante' });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const emit = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    try {
      const briefing = await getBriefing(false);
      const result = await assistant.ask({ question: body.question, history: body.history, deezerUser: body.deezerUser, context: body.context }, briefing, emit);
      emit({ type: 'result', ...result });
    } catch (e) {
      console.error('[ask]', e);
      emit({ type: 'result', answer: "Désolée, une erreur m'empêche de répondre pour le moment." });
    }
    return res.end();
  }

  if (p === '/api/tts' && req.method === 'POST') {
    const body = await readBody(req);
    if (typeof body.text !== 'string' || !body.text.trim()) return sendJson(res, 400, { error: 'Texte manquant' });
    try {
      const buf = await tts.synthesize({ text: body.text, voice: typeof body.voice === 'string' ? body.voice : '', rate: body.rate });
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      return res.end(buf);
    } catch (e) {
      return sendJson(res, 503, { error: 'Voix du serveur indisponible', detail: e.message });
    }
  }

  if (p === '/api/deezer/profile' && req.method === 'GET') {
    if (!isLocal(req) && !HOSTED) return sendJson(res, 403, { error: LOCAL_ONLY_MSG });
    const user = String(url.searchParams.get('user') || '').slice(0, 300);
    return sendJson(res, 200, await music.getUserPlaylists(user));
  }

  if (p === '/api/music/open' && req.method === 'POST') {
    if (!isLocal(req)) return sendJson(res, 403, { error: LOCAL_ONLY_MSG });
    const body = await readBody(req);
    const kind = String(body.kind || '');
    const id = String(body.id == null ? '' : body.id);
    if (!music.KINDS.includes(kind) || !/^\d{1,15}$/.test(id)) return sendJson(res, 400, { error: 'Paramètres invalides' });
    return sendJson(res, 200, await music.openInApp(kind, id));
  }

  if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'Route inconnue' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  return serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[serveur]', e);
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : 'Erreur interne' });
    else res.end();
  });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

if (require.main === module) {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n  Le port ${PORT} est déjà utilisé. Fermez l'autre Rocket, ou tapez : lsof -ti :${PORT} | xargs kill\n`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(PORT, HOST, async () => {
    console.log('\n  🚀 ROCKET v2 — votre morning économique');
    console.log(`  Sur cet ordinateur : http://localhost:${PORT}`);
    for (const a of lanAddresses()) console.log(`  Sur le Wi-Fi       : http://${a}:${PORT}`);
    const voice = tts.provider();
    console.log(`  Voix : ${voice === 'edge' ? 'Microsoft (gratuites)' : voice === 'elevenlabs' ? 'ElevenLabs' : 'navigateur'}`);
    await assistant.init();
    console.log(`  Réponses : ${assistant.modeLabel()}`);
    console.log('  Pour arrêter : Ctrl + C\n');
    getBriefing(false).catch(() => {});
  });
}

module.exports = { server, getBriefing, buildBriefing, isLocal, loadEnv };
