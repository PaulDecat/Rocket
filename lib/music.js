'use strict';
// Commandes musique : analyse de la phrase, API publique Deezer, playlists publiques du profil.

const { execFile } = require('child_process');
const { fetchWithTimeout } = require('./sources');

const API = 'https://api.deezer.com';
const TOP_FRANCE = { kind: 'playlist', id: 1109890291, title: 'Top France' };
const KINDS = ['playlist', 'album', 'artist', 'track'];

function strip(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'"); }

function clean(text) {
  let t = strip(text)
    .replace(/\b(ok|okay|o\.k\.|hey|he|dis|allo)\s*,?\s*(nova|novah|novas|nosa|noa|noah|nora|nowa|novak|nava|neva|rocket)\b[\s,!.]*/g, ' ')
    .replace(/^\s*(nova|rocket)\s*[,!.]\s*/, ' ')
    .replace(/\b(s'il te plait|s'il vous plait|stp|svp|merci)\b/g, ' ')
    .replace(/\b(est-ce que tu peux|est ce que tu peux|tu peux|tu pourrais|peux-tu|peux tu|pourrais-tu|je voudrais|j'aimerais|je veux)\b/g, ' ')
    .replace(/\b(play-list|play list|playliste|liste de lecture)s?\b/g, 'playlist')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ').trim();
  // « me mettre » → « mets »
  t = t.replace(/^(me |nous )?(mettre|jouer|lancer)\b/, (m, a, v) => ({ mettre: 'mets', jouer: 'joue', lancer: 'lance' })[v]);
  return t;
}

const VERB = "(?:mets|met|mettez|joue|jouez|lance|lancez|ecoute|ecouter|passe|passez|envoie)(?:[- ]?moi)?";
// Mots qui appartiennent au briefing : ne jamais les prendre pour un artiste.
const APP_WORDS = /\b(briefing|morning|podcast|emission|radar|actu|actus|actualite|news|infos?|titres du jour|graphique|courbe|marche|marches|bourse|cac|dax|nasdaq|dow|nikkei|bitcoin|btc|petrole|brent|taux|euro|dollar|or|pause|suivant|suite|analyse|fiche|chapitre|programme|theme|style)\b/;

function parseMusic(text) {
  const t = clean(text);
  if (!t) return null;
  let m;
  if (/\b(coupe|arrete|stoppe|stop|eteins|baisse|pause|mets en pause)\b.*\b(musique|chanson|morceau|son|zik|deezer)\b/.test(t)) return { action: 'stop' };
  if (/\b(reprends|remets|relance|continue)\b.*\bmusique\b/.test(t)) return { action: 'resume' };
  if (/\b(chanson|morceau|titre|piste|son) suivante?\b|\b(passe|change|zappe)( de| a la)? (chanson|morceau|titre)\b|\bmorceau d'apres\b/.test(t)) return { action: 'next' };
  if (/\b(quelles?|quels?|liste|montre|affiche|donne)\b.*\bmes playlists?\b|\bmes playlists\b\s*$/.test(t)) return { action: 'list' };
  if (new RegExp(`\\b${VERB}\\b.*\\b(mes )?(coups? de c(oe|œ)ur|favoris|titres (que j'aime|likes))\\b`).test(t)) return { action: 'user', name: 'loved' };
  if ((m = t.match(new RegExp(`\\b${VERB} (?:ma|mon) playlist (.+)$`)))) return { action: 'user', name: m[1].trim() };
  if ((m = t.match(new RegExp(`\\b${VERB} (?:la |une )?playlist (.+)$`)))) return { action: 'search', kind: 'playlist', query: m[1].trim() };
  if ((m = t.match(new RegExp(`\\b${VERB} (?:l'|l )?album (.+)$`)))) return { action: 'search', kind: 'album', query: byArtist(m[1]) };
  if ((m = t.match(new RegExp(`\\b${VERB} (?:la chanson|le morceau|le titre|le son|la musique) (.+)$`)))) return { action: 'search', kind: 'track', query: byArtist(m[1]) };
  if (new RegExp(`\\b${VERB} (?:de la |un peu de |la )?musique$`).test(t) || /^(musique|de la musique)$/.test(t)) return { action: 'play', item: TOP_FRANCE };
  if ((m = t.match(new RegExp(`\\b${VERB} (?:du|de la|de l'|des) (.+)$`))) && !APP_WORDS.test(m[1])) {
    return { action: 'search', kind: 'playlist', query: m[1].replace(/^musique /, '').trim(), genre: true };
  }
  if ((m = t.match(new RegExp(`^${VERB} (.+)$`))) && !APP_WORDS.test(m[1]) && m[1].split(' ').length <= 6) {
    const q = m[1].replace(/^(le |la |les |l')/, '').trim();
    if (q) return { action: 'search', kind: 'artist', query: q };
  }
  return null;
}

// « bella de gims » → « bella gims »
function byArtist(s) { return s.replace(/\s+(de|d'|par)\s*/, ' ').trim(); }

async function dz(path) {
  const res = await fetchWithTimeout(API + path, {}, 8000);
  if (!res.ok) throw new Error('Deezer HTTP ' + res.status);
  const j = await res.json();
  if (j && j.error) throw new Error(j.error.message || 'Erreur Deezer');
  return j;
}

function bestMatch(items, query, field) {
  const q = strip(query);
  let best = items[0], bestScore = -1;
  items.slice(0, 10).forEach((it, i) => {
    const name = strip(field(it));
    let s = 10 - i;
    if (name === q) s += 50; else if (q.includes(name) || name.includes(q)) s += 20;
    if (it.nb_fan) s += Math.log10(it.nb_fan + 1);
    if (it.fans) s += Math.log10(it.fans + 1);
    if (s > bestScore) { bestScore = s; best = it; }
  });
  return best;
}

async function searchDeezer(kind, query) {
  const j = await dz(`/search/${kind}?q=${encodeURIComponent(query)}&limit=10`);
  const items = (j && j.data) || [];
  if (!items.length) return null;
  if (kind === 'artist') {
    const a = bestMatch(items, query, (x) => x.name);
    return { kind: 'artist', id: a.id, title: `${a.name} — meilleurs titres` };
  }
  if (kind === 'track') { const x = items[0]; return { kind: 'track', id: x.id, title: `${x.title} — ${x.artist && x.artist.name}` }; }
  if (kind === 'album') { const x = items[0]; return { kind: 'album', id: x.id, title: `${x.title} — ${x.artist && x.artist.name}` }; }
  const p = bestMatch(items, query, (x) => x.title);
  return { kind: 'playlist', id: p.id, title: p.title };
}

// ---------- Profil Deezer ----------
const profileCache = new Map();

async function resolveUserId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^\d{1,15}$/.test(s)) return s;
  let m = s.match(/deezer\.com\/(?:[a-z]{2}\/)?(?:profile|user)\/(\d+)/i);
  if (m) return m[1];
  if (/^https:\/\/([a-z0-9-]+\.)*(deezer\.com|deezer\.page\.link|dzr\.page\.link)\//i.test(s)) {
    try {
      const res = await fetchWithTimeout(s, { redirect: 'follow' }, 8000);
      m = (res.url || '').match(/(?:profile|user)\/(\d+)/);
      if (m) return m[1];
      const html = await res.text();
      m = html.match(/deezer\.com\/(?:[a-z]{2}\/)?(?:profile|user)\/(\d+)/);
      if (m) return m[1];
    } catch (e) { /* ignore */ }
  }
  return null;
}

async function getUserPlaylists(input) {
  const id = await resolveUserId(input);
  if (!id) return { ok: false, error: "Lien de profil Deezer non reconnu. Dans Deezer : profil → Partager → Copier le lien, puis collez-le dans les réglages." };
  const c = profileCache.get(id);
  if (c && Date.now() - c.at < 600000) return c.data;
  let data;
  try {
    const [user, pls] = await Promise.all([dz(`/user/${id}`), dz(`/user/${id}/playlists?limit=100`)]);
    const playlists = ((pls && pls.data) || []).map((p) => ({ id: p.id, title: p.title, loved: !!p.is_loved_track, count: p.nb_tracks }));
    data = { ok: true, id, name: user && user.name, playlists };
    if (!playlists.length) data.note = 'Aucune playlist publique sur ce profil. Rendez vos playlists publiques dans Deezer pour que Nova puisse les lancer.';
  } catch (e) {
    data = { ok: false, id, error: 'Profil Deezer introuvable ou privé. Vérifiez que votre profil et vos playlists sont publics.' };
  }
  profileCache.set(id, { at: Date.now(), data });
  return data;
}

function findPlaylist(playlists, name) {
  if (name === 'loved') return playlists.find((p) => p.loved) || playlists.find((p) => /coups? de c|loved|favori/i.test(strip(p.title)));
  const q = strip(name).replace(/[^a-z0-9 ]/g, ' ').trim();
  const words = q.split(/\s+/).filter(Boolean);
  let best = null, bestScore = 0;
  for (const p of playlists) {
    const t = strip(p.title).replace(/[^a-z0-9 ]/g, ' ');
    let s = 0;
    if (t.trim() === q) s = 100;
    else if (t.includes(q)) s = 60;
    else s = words.filter((w) => t.includes(w)).length * 20 + words.filter((w) => w.length > 3 && t.split(/\s+/).some((x) => x.startsWith(w.slice(0, 4)))).length * 5;
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

// Exécute une commande musique ; renvoie { answer, music }.
async function runMusic(intent, deezerUser) {
  if (intent.action === 'stop') return { answer: 'Je coupe la musique.', music: { action: 'stop' } };
  if (intent.action === 'resume') return { answer: 'Je relance la musique.', music: { action: 'resume' } };
  if (intent.action === 'next') return { answer: 'Chanson suivante.', music: { action: 'next' } };
  if (intent.action === 'play') return { answer: `Je lance ${intent.item.title}.`, music: { action: 'play', ...intent.item } };
  if (intent.action === 'list' || intent.action === 'user') {
    if (!deezerUser) return { answer: "Je ne connais pas encore votre profil Deezer. Collez le lien de votre profil dans les réglages, avec la roue crantée, puis redemandez-moi." };
    const prof = await getUserPlaylists(deezerUser);
    if (!prof.ok) return { answer: prof.error };
    if (!prof.playlists.length) return { answer: prof.note };
    const names = prof.playlists.filter((p) => !p.loved).map((p) => p.title);
    if (intent.action === 'list') {
      return { answer: `Vous avez ${prof.playlists.length} playlist${prof.playlists.length > 1 ? 's' : ''} publique${prof.playlists.length > 1 ? 's' : ''} : ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', et d\'autres' : ''}.` };
    }
    const p = findPlaylist(prof.playlists, intent.name);
    if (!p) return { answer: `Je ne trouve pas la playlist ${intent.name === 'loved' ? 'coups de cœur' : intent.name}. Vos playlists publiques sont : ${names.slice(0, 8).join(', ')}.` };
    return { answer: `Je lance votre playlist ${p.loved ? 'coups de cœur' : p.title}.`, music: { action: 'play', kind: 'playlist', id: p.id, title: p.loved ? 'Coups de cœur' : p.title } };
  }
  if (intent.action === 'search') {
    let item;
    try { item = await searchDeezer(intent.kind, intent.query); } catch (e) {
      return { answer: "Je n'arrive pas à joindre Deezer pour le moment. Réessayez dans un instant." };
    }
    if (!item) return { answer: `Je n'ai rien trouvé sur Deezer pour « ${intent.query} ».` };
    return { answer: `Je lance ${item.title}.`, music: { action: 'play', ...item } };
  }
  return null;
}

// Ouvre l'appli Deezer de l'ordinateur (macOS uniquement).
function openInApp(kind, id) {
  return new Promise((resolve) => {
    if (!KINDS.includes(kind) || !/^\d{1,15}$/.test(String(id))) return resolve({ ok: false, error: 'Paramètres invalides' });
    if (process.platform !== 'darwin' || process.env.RENDER) return resolve({ ok: false, unsupported: true });
    const app = `deezer://www.deezer.com/${kind}/${id}?autoplay=true`;
    execFile('open', [app], (err) => {
      if (!err) return resolve({ ok: true, via: 'app' });
      execFile('open', [`https://www.deezer.com/${kind}/${id}`], (err2) => resolve(err2 ? { ok: false, error: 'Ouverture impossible' } : { ok: true, via: 'web' }));
    });
  });
}

module.exports = { parseMusic, runMusic, clean, getUserPlaylists, resolveUserId, findPlaylist, openInApp, KINDS, TOP_FRANCE };
