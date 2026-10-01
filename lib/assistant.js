'use strict';
// Cerveau de Rocket : intentions locales, réponses locales, Claude (Claude Code ou API).

const music = require('./music');
const claudeCode = require('./claude-code');
const research = require('./research');
const { mood, level, fixGrammar } = require('./script');
const lifestyle = require('./lifestyle');
const planning = require('./planning');
const knowledge = require('./knowledge');
const { createSpokenFilter, VISUAL_INSTRUCTIONS } = require('./spoken');

const SORRY = 'Désolé Monsieur, je n\'ai pas compris.';

let mode = 'local';

async function init() {
  const forced = (process.env.ASSISTANT || '').toLowerCase();
  if (process.env.ROCKET_FAKE_CLAUDE === '1') mode = 'fake'; // tests uniquement
  else if (forced === 'local') mode = 'local';
  else if (forced === 'api') mode = process.env.ANTHROPIC_API_KEY ? 'api' : 'local';
  else if (forced === 'claude-code' || forced === 'claude') mode = (await claudeCode.detect()) ? 'claude-code' : 'local';
  else if (await claudeCode.detect()) mode = 'claude-code';
  else if (process.env.ANTHROPIC_API_KEY) mode = 'api';
  else mode = 'local';
  return mode;
}
function getMode() { return mode; }
function modeLabel() {
  return mode === 'claude-code' ? 'Claude via Claude Code' : mode === 'api' ? "Claude via l'API" : 'locales';
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'")
    .replace(/^\s*(ok|okay|oke|hey|dis)\s*,?\s*(rocket|rockets|roquettes?|rockette)\b[\s,]*/, '').replace(/[\s,]*s\s?'?\s?il (te|vous) plait[\s.!?]*$/, '')
    .replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
}

const ALIASES = [
  ['^FCHI', /\b(cac( ?40)?|bourse de paris)\b/],
  ['^GDAXI', /\b(dax|allemagne|allemande?|francfort)\b/],
  ['^STOXX50E', /\b(euro ?stoxx|stoxx)\b/],
  ['^GSPC', /\b(s ?& ?p( ?500)?|s and p|sp ?500)\b/],
  ['^IXIC', /\bnasdaq\b/],
  ['^DJI', /\b(dow jones|dow)\b/],
  ['^N225', /\b(nikkei|japon|tokyo)\b/],
  ['^HSI', /\b(hang seng|hong kong)\b/],
  ['^TNX', /\b(taux|obligat\w*|10 ans|tresor)\b/],
  ['EURUSD=X', /\b(euro[- ]?dollar|eur ?usd|euro|dollar)\b/],
  ['BZ=F', /\b(petrole|brent|baril)\b/],
  ['GC=F', /\b(l'or|de l'or|or|gold)\b/],
  ['BTC-USD', /\b(bitcoin|btc|crypto\w*)\b/],
];

function findAsset(t) {
  for (const [sym, re] of ALIASES) if (re.test(t)) return sym;
  return null;
}

// Question « complexe » : mieux traitée par Claude quand il est disponible.
function isComplex(t) {
  const words = t.split(/\s+/).length;
  return words > 12 || /\b(pourquoi|explique|depuis|en (19|20)\d\d|historique|compar\w*|prevision\w*|cds|spread\w*|inflation|pib|chomage|directeur|bce|fed|action\w*|entreprise|recherche|cherche|montre[- ]moi|analyse)\b/.test(t);
}

const TABS = { cuisine: 'cuisine', recette: 'cuisine', recettes: 'cuisine', cine: 'cine', cinema: 'cine', coach: 'coach', sante: 'coach', 'hygiene de vie': 'coach', planning: 'planning', agenda: 'planning', calendrier: 'planning', radar: 'radar', briefing: 'briefing', morning: 'briefing', bourse: 'bourse', marches: 'bourse', politique: 'politique' };
const NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

function detectIntent(question) {
  const t = norm(question);
  const words = t.split(/\s+/).filter(Boolean).length;
  let m;
  if (!t) return { kind: 'free', complex: true };
  if (words <= 4 && /^(stop|arrete|arretez|arrete toi|pause|silence|tais[- ]toi|taisez[- ]vous|chut|stoppe|coupe)\b/.test(t)) return { kind: 'action', action: 'stop' };
  // La matinale ne se lance que sur demande.
  if (/\b(lance|lancer|reprends|reprend|reprendre|continue|relance|demarre|demarrer|joue|redemarre|ecouter|mets|commence|fais)\b.*\b(briefing|morning|podcast|emission|lecture|matinale?s?|matinade|journal|flash|point du matin|revue de presse)\b/.test(t)
    || /^(la |le )?(matinale|matinade|morning|briefing)( du jour)?$/.test(t) || /^(reprends|continue|reprise)$/.test(t)) {
    return { kind: 'action', action: 'play', from: /\b(reprends|reprend|reprendre|continue)\b/.test(t) ? 'resume' : 'start' };
  }
  if (words <= 5 && /^(suivant|suivante|passe|la suite|segment suivant|passe au suivant|passe a la suite|next)\b/.test(t)) return { kind: 'action', action: 'next' };

  // Navigation entre onglets : « ouvre la cuisine », « affiche l'onglet planning »
  if ((m = t.match(/^(?:ouvre|affiche|montre|va (?:sur|dans)|passe (?:sur|a)|onglet)(?:[- ]moi)?(?: l'onglet| l onglet| sur)?(?: le| la| les| l'| l)? ?(cuisine|recettes?|cine|cinema|coach|sante|hygiene de vie|planning|agenda|calendrier|radar|briefing|morning|bourse|marches|politique)$/))) {
    return { kind: 'tab', tab: TABS[m[1]] };
  }

  // Planning
  const add = planning.parseAdd(question);
  if (add) return { kind: 'planning-add', ...add };
  if (/\b(supprime|efface|annule|retire|enleve)\b/.test(t) && !/\bmusique\b/.test(t)) return { kind: 'planning-remove', query: t };
  if (/\b(planning|agenda|calendrier|rendez[- ]vous|rdv)\b|qu['\s]?est[- ]ce que j['\s]?ai|j['\s]?ai quoi|suis[- ]je libre|mes (rendez|evenements)/.test(t)) {
    const when = planning.parseWhen(question);
    return { kind: 'planning-query', week: /\b(semaine|prochains jours)\b/.test(t), date: when ? when.date : null };
  }

  // Coach hygiène de vie
  if ((m = t.match(/\bj['\s]?ai bu (un|une|deux|trois|quatre|cinq|six|\d+)?\s*(?:grand |petit )?(verre|verres|bouteille|tasse)/))) {
    const n = m[1] ? (NUM[m[1]] || parseInt(m[1], 10) || 1) : 1;
    return { kind: 'coach-log', habit: 'eau', delta: m[2] === 'bouteille' ? n * 3 : n };
  }
  if (/\bj['\s]?ai (marche|couru|nage|fait (du|de la|un peu de) (sport|velo|marche|course|yoga|natation|gym|musculation))/.test(t)) return { kind: 'coach-log', habit: 'marche', delta: 1 };
  if ((m = t.match(/\bj['\s]?ai mange (un|une|deux|trois|des)? ?(fruits?|legumes?|salade|pomme|banane|orange|soupe)/))) return { kind: 'coach-log', habit: 'legumes', delta: NUM[m[1]] || 1 };
  if (/\bj['\s]?ai (medite|respire|fait (de la|une) (meditation|respiration|seance de respiration))/.test(t)) return { kind: 'coach-log', habit: 'respiration', delta: 1 };
  if (/\b(mon bilan|bilan (sante|bien[- ]etre|du jour|de la journee)|mes habitudes|ou j'en suis)\b/.test(t)) return { kind: 'coach-status' };
  const invest = /\b(radar|invest\w*|opportunite\w*|gros coup|acheter|placement\w*|vigilance|bourse)\b/.test(t);
  if (!invest && /\b(coach|hygiene de vie|bien[- ]etre|sante|sommeil|dormir|forme|stress|conseil|astuce)\b/.test(t)) return { kind: 'coach-tip', other: /\b(autre|nouveau|encore)\b/.test(t) };

  const complex = isComplex(t);
  // Cuisine
  if (/\b(recettes?|cuisine|cuisiner|manger|mange|repas|diner|dejeuner|plat|menu)\b/.test(t)) {
    const q = t.replace(/.*\b(recettes?|cuisiner|manger|repas|diner|dejeuner|plat|menu)\b/, '').trim();
    return { kind: 'recipe', query: q, full: /\b(etapes?|comment (on )?(la |le )?(fait|prepare)|lis|lire|en entier|detail)\b/.test(t), other: /\b(autre|une autre|nouvelle)\b/.test(t), complex };
  }
  // Cinéma
  const newsy = /\b(actu\w*|infos?|news|nouvelles|titres|quoi de neuf|du jour|ce matin|en ce moment|derniers?|dernieres?|sorties?|box[- ]office)\b/;
  if (/\b(cine|cinema|films?|box[- ]office)\b/.test(t) && (newsy.test(t) || /^(le |l')?(cine|cinema)$/.test(t))) return { kind: 'cinema', complex };
  // Politique
  if (/\b(politique|gouvernement|assemblee|senat|elections?)\b/.test(t) && (newsy.test(t) || /^(la )?politique$/.test(t)) && !complex) return { kind: 'politics', complex };

  if (invest && !findAsset(t) && !/\bcds\b/.test(t) && !/\bbourse\b/.test(t)) return { kind: 'radar', complex };
  if (/\b(radar|risques?)\b/.test(t) && !findAsset(t)) return { kind: 'radar', complex };
  if (/\b(actu\w*|news|titres|infos?|a la une|nouvelles)\b/.test(t) && !findAsset(t)) return { kind: 'news', complex };
  const sym = findAsset(t);
  if (sym) return { kind: 'asset', symbol: sym, complex };
  if (/\b(marches?|bourses?|resume|point|comment ca va|ambiance|tendance generale)\b/.test(t)) return { kind: 'overview', complex };
  return { kind: 'free', complex: true };
}

// ---------- Réponses locales ----------
function frNum(v, d) { return Number(v).toFixed(d).replace('.', ','); }
function pctTxt(v) { return `${v >= 0 ? 'plus' : 'moins'} ${frNum(Math.abs(v), 1)} pour cent`; }

function describeAsset(m) {
  const s = m.stats || {};
  const c = m.changePct;
  const dayTxt = Math.abs(c) < 0.1 ? 'quasiment stable sur la séance' : `${c > 0 ? 'en hausse' : 'en baisse'} de ${frNum(Math.abs(c), 2)} pour cent sur la séance`;
  const name = m.spoken.charAt(0).toUpperCase() + m.spoken.slice(1);
  let rsiTxt = '';
  if (s.rsi != null) {
    rsiTxt = s.rsi < 30 ? `Le RSI à ${frNum(s.rsi, 0)} signale une zone de survente.` : s.rsi > 70 ? `Le RSI à ${frNum(s.rsi, 0)} signale un surachat : attention aux prises de bénéfices.` : `Le RSI à ${frNum(s.rsi, 0)} reste en zone neutre.`;
  }
  return `${name} est à ${level(m)}, ${dayTxt}. Sur un mois, ${pctTxt(m.monthPct)}. La tendance de fond est ${s.trend || 'neutre'}. ${rsiTxt} Niveau de risque ${s.risk || 'modéré'}.`.replace(/\s+/g, ' ').trim();
}

function describeOverview(markets) {
  const sorted = [...markets].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const by = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  return `L'ambiance est ${mood(markets)} sur les marchés. Le CAC 40 est à ${pctTxt(by['^FCHI'].changePct)}, le S&P 500 à ${pctTxt(by['^GSPC'].changePct)}. La meilleure performance revient à ${best.spoken}, ${pctTxt(best.changePct)}, la plus faible à ${worst.spoken}, ${pctTxt(worst.changePct)}.`;
}

function describeRadar(radar, markets) {
  const by = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  const tp = radar.topPick;
  let s = tp ? `Le signal le plus intéressant concerne ${by[tp.symbol] ? by[tp.symbol].spoken : tp.name} : ${tp.title.toLowerCase()}, conviction ${tp.conviction}. ${tp.text}` : "Aucun signal d'achat marquant aujourd'hui : la patience est aussi une stratégie.";
  if (radar.warnings.length) s += ` Côté vigilance, ${radar.warnings.length} alerte${radar.warnings.length > 1 ? 's' : ''}, dont ${by[radar.warnings[0].symbol] ? by[radar.warnings[0].symbol].spoken : radar.warnings[0].name} : ${radar.warnings[0].title.toLowerCase()}.`;
  return s + " Ce n'est pas un conseil personnalisé.";
}

function describeNews(news) {
  if (!news.length) return "Je n'ai pas d'actualité à vous proposer pour le moment.";
  return `Voici les titres : ${news.slice(0, 3).map((n, i) => `${['premièrement', 'ensuite', 'enfin'][i]}, ${n.title.replace(/[.!?]*$/, '')}`).join(' ; ')}.`;
}

function listTitles(items, n = 3) {
  return items.slice(0, n).map((x, i) => `${['premièrement', 'ensuite', 'enfin'][i]}, ${x.title.replace(/[.!?]*$/, '')}`).join(' ; ');
}

function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
function habitLabel(id) { const h = lifestyle.HABITS.find((x) => x.id === id); return h ? h.label.toLowerCase() : id; }

// Réponses des onglets « vie quotidienne ». ctx = { planning, coach } envoyé par le navigateur.
function lifeAnswer(intent, briefing, ctx) {
  const now = new Date();
  const events = planning.sanitize(ctx && ctx.planning);
  const coach = (ctx && typeof ctx.coach === 'object' && ctx.coach) || {};
  switch (intent.kind) {
    case 'tab': {
      const names = { cuisine: "l'onglet cuisine", cine: "l'actu ciné", coach: 'votre coach bien-être', planning: 'votre planning', radar: 'le radar investissement', briefing: 'le briefing', bourse: 'les indicateurs de bourse', politique: "l'actualité politique" };
      return { answer: `Voici ${names[intent.tab]}, Monsieur.`, action: 'tab', tab: intent.tab };
    }
    case 'planning-add': {
      if (!intent.title || !intent.date) return { answer: SORRY + ' Précisez par exemple : ajoute dentiste demain à 15 heures.' };
      return {
        answer: `C'est noté, Monsieur : ${intent.title}, ${planning.spokenDate(intent.date, now)}${planning.spokenTime(intent.time)}.`,
        action: 'planning-add', event: { title: intent.title, date: intent.date, time: intent.time }, tab: 'planning',
      };
    }
    case 'planning-remove': {
      const words = intent.query.replace(/\b(supprime|efface|annule|retire|enleve|le|la|les|mon|ma|mes|du|de|des|rendez[- ]vous|rdv|evenement|planning|agenda)\b/g, ' ').split(/\s+/).filter((w) => w.length > 2);
      const hit = events.find((e) => words.length && words.every((w) => planning.strip(e.title).includes(w)))
        || events.find((e) => words.some((w) => planning.strip(e.title).includes(w)));
      if (!hit) return { answer: 'Je ne trouve pas cet événement dans votre planning, Monsieur.', action: 'tab', tab: 'planning' };
      return { answer: `J'ai supprimé ${hit.title}, ${planning.spokenDate(hit.date, now)}${planning.spokenTime(hit.time)}.`, action: 'planning-remove', removeId: hit.id, tab: 'planning' };
    }
    case 'planning-query': {
      const first = intent.date || planning.iso(now);
      const [y, mo, d0] = first.split('-').map(Number);
      const parts = [];
      for (let i = 0; i < (intent.week ? 7 : 1); i++) {
        const d = planning.iso(new Date(y, mo - 1, d0 + i));
        const list = planning.eventsOn(events, d);
        if (list.length) parts.push(`${cap(planning.spokenDate(d, now))}, ${list.map((e) => `${e.title}${planning.spokenTime(e.time)}`).join(', puis ')}`);
      }
      const label = intent.week ? 'cette semaine' : planning.spokenDate(first, now);
      if (!parts.length) return { answer: `Votre planning est libre ${label}, Monsieur.`, action: 'tab', tab: 'planning' };
      return { answer: `Au programme, Monsieur. ${parts.join('. ')}.`, action: 'tab', tab: 'planning' };
    }
    case 'coach-log': {
      const h = lifestyle.HABITS.find((x) => x.id === intent.habit);
      const before = Number(coach[intent.habit]) || 0;
      const after = Math.min(h.target * 2, before + intent.delta);
      let txt = 'C\'est noté, Monsieur.';
      if (h.target > 1) txt += ` Vous en êtes à ${after} ${h.unit} sur ${h.target}.${after >= h.target ? ' Objectif atteint, bravo !' : ''}`;
      else txt += ' Bravo, objectif du jour validé.';
      return { answer: txt, action: 'coach-log', habit: intent.habit, delta: intent.delta, tab: 'coach' };
    }
    case 'coach-status': {
      const done = lifestyle.HABITS.filter((h) => (Number(coach[h.id]) || 0) >= h.target);
      const water = Number(coach.eau) || 0;
      const todo = lifestyle.HABITS.filter((h) => !done.includes(h)).slice(0, 2).map((h) => habitLabel(h.id));
      return {
        answer: `Vous avez validé ${done.length} habitude${done.length > 1 ? 's' : ''} sur ${lifestyle.HABITS.length} aujourd'hui, Monsieur, avec ${water} verre${water > 1 ? 's' : ''} d'eau. ${todo.length ? `Il reste : ${todo.join(', et ')}.` : 'Journée parfaite !'}`,
        action: 'tab', tab: 'coach',
      };
    }
    case 'coach-tip': {
      const tips = briefing.lifestyle ? briefing.lifestyle.tips : lifestyle.TIPS;
      const tip = intent.other ? tips[Math.floor(Math.random() * tips.length)] : lifestyle.tipOfDay();
      return { answer: `Le conseil de votre coach : ${tip}`, action: 'tab', tab: 'coach' };
    }
    case 'recipe': {
      let r = null, prefix = '';
      if (intent.query && !intent.other) {
        const found = lifestyle.findRecipes(intent.query);
        if (found.length) r = found[0];
        else if (/\b(avec|a base de|au|aux|a la)\b/.test(intent.query)) prefix = "Je n'ai pas de recette avec cet ingrédient dans mon carnet, Monsieur. ";
      }
      if (!r) {
        const list = lifestyle.seasonalRecipes();
        r = intent.other ? list[Math.floor(Math.random() * list.length)] : lifestyle.recipeOfDay();
      }
      return { answer: `${prefix}Je vous propose : ${lifestyle.recipeSpeech(r, intent.full)}`, action: 'tab', tab: 'cuisine', recipeId: r.id };
    }
    case 'cinema': {
      const items = briefing.cinema || [];
      if (!items.length) return { answer: "Je n'ai pas d'actualité cinéma pour le moment, Monsieur.", action: 'tab', tab: 'cine' };
      return { answer: `L'actu ciné : ${listTitles(items)}.`, action: 'tab', tab: 'cine' };
    }
    case 'politics': {
      const items = briefing.politics || [];
      if (!items.length) return { answer: "Je n'ai pas d'actualité politique pour le moment, Monsieur.", action: 'tab', tab: 'politique' };
      return { answer: `Côté politique : ${listTitles(items)}.`, action: 'tab', tab: 'politique', visual: { type: 'politics', index: 0 } };
    }
    default:
      return null;
  }
}

function localAnswer(intent, briefing) {
  const { markets, radar, news } = briefing;
  if (intent.kind === 'asset') {
    const m = markets.find((x) => x.symbol === intent.symbol);
    return { answer: describeAsset(m), visual: { type: 'line', symbol: m.symbol } };
  }
  if (intent.kind === 'radar') return { answer: describeRadar(radar, markets), visual: { type: 'radar' }, action: 'radar' };
  if (intent.kind === 'news') return { answer: describeNews(news), visual: { type: 'news', index: 0 } };
  return { answer: describeOverview(markets), visual: { type: 'overview' } };
}

// ---------- Contexte et prompt système ----------
function contextJson(briefing, ctx) {
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return JSON.stringify({
    date: new Date().toISOString().slice(0, 16),
    marches: briefing.markets.map((m) => ({
      s: m.symbol, n: m.name, cours: r2(m.price), varJour: r2(m.changePct), var1m: r2(m.monthPct),
      var3m: m.stats && m.stats.perf3m, var1a: m.stats && m.stats.perf1y, rsi: m.stats && m.stats.rsi,
      tendance: m.stats && m.stats.trend, risque: m.stats && m.stats.risk, live: m.live,
    })),
    politique: (briefing.politics || []).slice(0, 5).map((n) => n.title),
    cinema: (briefing.cinema || []).slice(0, 5).map((n) => n.title),
    radar: { top: briefing.radar.topPick && { s: briefing.radar.topPick.symbol, t: briefing.radar.topPick.title }, alertes: briefing.radar.warnings.slice(0, 4).map((w) => ({ s: w.symbol, t: w.title })) },
    actus: briefing.news.slice(0, 6).map((n) => ({ t: n.title, src: n.source })),
    planningUtilisateur: planning.sanitize(ctx && ctx.planning).slice(0, 40),
  });
}

const SYSTEM = `Tu es Rocket, l'assistant vocal personnel de l'utilisateur, façon J.A.R.V.I.S. Tu réponds à tous les types de questions : culture générale, sciences, histoire, géographie, langues, santé, technologie, conseils pratiques, actualité, économie et Bourse, cuisine, sport, divertissement… Tu t'adresses à l'utilisateur en l'appelant « Monsieur » et en le vouvoyant. Tu réponds en français, et ta réponse est lue à voix haute.
Si la demande contient plusieurs questions, réponds à chacune, dans l'ordre.
Si la demande est vraiment incompréhensible, réponds exactement : « Désolé Monsieur, je n'ai pas compris. »
Pour les questions sur les marchés, sois précis, chiffré et daté. Les données du jour (13 marchés avec statistiques, radar, actualités économiques, politiques et cinéma, planning de l'utilisateur) sont fournies en contexte : utilise-les en priorité. Pour tout le reste, utilise tes connaissances, et fais une recherche web pour l'actualité récente ou les chiffres précis (CDS, inflation, météo, résultats sportifs…).
Pour les données chiffrées, montre un graphique quand c'est utile : pour un actif coté, indique son symbole Yahoo Finance ; pour une donnée non cotée, fournis des points réels datés (au moins 2, tirés de ta source ; tu peux déduire l'historique à partir des variations publiées) avec la source ; pour une valeur unique, un chiffre clé. Ne jamais inventer de valeurs.
Investissement : reste pédagogique, explique les risques, ne promets jamais de gain et précise que ce n'est pas un conseil personnalisé. Si tu ne trouves pas l'information, dis-le simplement.
Style : 2 à 6 phrases (un peu plus s'il y a plusieurs questions), sans markdown, sans liste, sans émoji, sans URL. Écris « 1,25 pour cent », « 45 points de base », et les nombres sans séparateur de milliers.`;

function historyText(history) {
  const h = (Array.isArray(history) ? history : []).slice(-6)
    .filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string')
    .map((x) => `Monsieur : ${x.q.slice(0, 300)}\nRocket : ${x.a.slice(0, 600)}`);
  return h.length ? `Échanges précédents :\n${h.join('\n')}\n\n` : '';
}

// ---------- Faux Claude (tests) : réponse en flux, lente, avec un graphique ----------
async function viaFake(question, onText) {
  const filter = createSpokenFilter(onText);
  const parts = ['Voici la première phrase de la réponse, Monsieur. ', 'La deuxième phrase arrive un peu plus tard. ', 'Et voici la troisième et dernière phrase.', '\n[[VISUEL]] {"figure":{"label":"Test","value":"42","unit":"%","source":"Test"}}'];
  for (const [i, p] of parts.entries()) {
    await new Promise((r) => setTimeout(r, i === 0 ? 300 : 2500));
    filter.feed(p);
  }
  const r = filter.end();
  return buildResult({ answer: r.text, ...(r.visual || {}) });
}

// ---------- Claude Code ----------
// La réponse arrive en flux : chaque morceau de texte est envoyé au navigateur, qui commence à parler
// dès la première phrase.
async function viaClaudeCode(question, history, briefing, emit, ctx, onText) {
  const prompt = `Données du jour (JSON) : ${contextJson(briefing, ctx)}\n\n${historyText(history)}Question : ${question}`;
  emit({ type: 'status', text: 'Rocket réfléchit…' });
  const filter = createSpokenFilter(onText);
  const out = await claudeCode.ask({
    prompt, system: SYSTEM + '\n' + VISUAL_INSTRUCTIONS,
    onStatus: (text) => emit({ type: 'status', text }),
    onText: (t) => filter.feed(t),
  });
  if (!filter.text.trim()) filter.feed(out.text); // rien reçu en flux : on prend le texte final
  const r = filter.end();
  return buildResult({ answer: r.text, ...(r.visual || {}) });
}

async function buildResult(out) {
  let visual = null;
  if (out.figure && out.figure.value) visual = research.figureVisual(out.figure);
  if (!visual && out.chart && out.chart.series) visual = research.pointsVisual(out.chart);
  if (!visual && Array.isArray(out.market) && out.market.length) {
    visual = await research.marketVisual(out.market.filter((m) => m && research.SYMBOL_RE.test(String(m.symbol || ''))));
  }
  return { answer: String(out.answer || '').trim(), visual: visual || undefined };
}

// ---------- API Anthropic ----------
let client = null;
async function viaApi(question, history, briefing, emit, cx, onText) {
  const Anthropic = require('@anthropic-ai/sdk');
  if (!client) client = new Anthropic();
  const ctx = { visual: null, status: (text) => emit({ type: 'status', text }) };
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
    ...research.TOOLS,
  ];
  const messages = [{ role: 'user', content: `Données du jour (JSON) : ${contextJson(briefing, cx)}\n\n${historyText(history)}Question : ${question}` }];
  emit({ type: 'status', text: 'Rocket réfléchit…' });
  const filter = createSpokenFilter(onText);
  let answer = '';
  for (let turn = 0; turn < 10; turn++) {
    // Réponse en flux : le texte part vers le navigateur au fur et à mesure.
    const stream = client.beta.messages.stream({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM + '\n' + VISUAL_INSTRUCTIONS,
      tools,
      messages,
      output_config: { effort: process.env.ROCKET_CLAUDE_EFFORT || 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    stream.on('text', (delta) => filter.feed(delta));
    const res = await stream.finalMessage();
    for (const b of res.content) {
      if (b.type === 'server_tool_use') {
        if (b.name === 'web_search') ctx.status(`Recherche web : ${String((b.input && b.input.query) || '').slice(0, 70)}`);
        if (b.name === 'web_fetch') { try { ctx.status(`Lecture de ${new URL(b.input.url).hostname.replace(/^www\./, '')}`); } catch (e) { ctx.status('Lecture d\'une page'); } }
      }
    }
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (res.stop_reason === 'refusal') { answer = SORRY; break; }
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    if (res.stop_reason !== 'tool_use') { answer = text; break; }
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((b) => b.type === 'tool_use');
    const results = await Promise.all(calls.map(async (c) => {
      try {
        const r = await research.runTool(c.name, c.input, ctx);
        return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(r) };
      } catch (e) {
        return { type: 'tool_result', tool_use_id: c.id, content: `Erreur : ${e.message}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: results });
    answer = text;
  }
  if (!filter.text.trim()) filter.feed(answer);
  const r = filter.end();
  const built = await buildResult({ answer: r.text || answer, ...(r.visual || {}) });
  return { answer: cleanSpoken(built.answer) || SORRY, visual: ctx.visual || built.visual || undefined };
}

function cleanSpoken(s) {
  return String(s || '').replace(/\*\*?|__|#+\s|`/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- Point d'entrée ----------
async function ask(input, briefing, emit) {
  const r = await answer(input, briefing, emit);
  if (r && r.answer) r.answer = fixGrammar(r.answer);
  return r;
}

// Découpe « quelle heure est-il et comment va le CAC 40 » en plusieurs demandes.
const SPLIT_RE = /\s*(?:\?+|;|\bet aussi\b|\bpuis\b|\bensuite\b|\bet (?=(?:quel|quelle|quels|quelles|comment|combien|qui|quand|ou|où|est-ce|pourquoi|donne|dis|ajoute|note|ouvre|affiche|montre|mets|lance|raconte|fais|calcule|c'est quoi|qu'est-ce)\b))\s*/i;
function splitQuestions(q) {
  return String(q).split(SPLIT_RE).map((x) => x.replace(/^[\s,.]+|[\s,.]+$/g, '').trim()).filter((x) => x.length > 1).slice(0, 5);
}

// Réponses rapides et locales (sans Claude) : heure, calculs, météo, petites conversations.
async function fastAnswer(question, context) {
  const city = context && typeof context.city === 'string' ? context.city.slice(0, 60) : '';
  const kt = norm(question);
  const quick = knowledge.timeAnswer(kt) || knowledge.mathAnswer(kt) || knowledge.smallTalk(kt) || (await knowledge.weatherAnswer(kt, city));
  return quick ? { answer: quick } : null;
}

// Une demande : renvoie { answer, ... } ou { claude: true } si elle doit partir chez Claude.
async function answerLocal(question, { deezerUser, context }, briefing, emit) {
  const mi = music.parseMusic(question);
  if (mi) {
    emit({ type: 'status', text: 'Deezer…' });
    const r = await music.runMusic(mi, typeof deezerUser === 'string' ? deezerUser.slice(0, 300) : '');
    if (r) return r;
  }
  const intent = detectIntent(question);
  if (intent.kind === 'action') {
    const txt = { stop: 'Bien, Monsieur.', play: intent.from === 'resume' ? 'Je reprends la matinale, Monsieur.' : 'Voici votre matinale, Monsieur.', next: 'Passons à la suite.' }[intent.action];
    return { answer: txt, action: intent.action, from: intent.from };
  }
  const life = lifeAnswer(intent, briefing, context);
  // Les recettes introuvables dans le carnet, le ciné et la politique « complexes » vont à Claude s'il est là.
  const lifeToClaude = mode !== 'local' && ((intent.kind === 'recipe' && /^Je n'ai pas de recette/.test(life && life.answer)) || (['cinema', 'politics'].includes(intent.kind) && intent.complex));
  if (life && !lifeToClaude) return life;
  const fast = await fastAnswer(question, context);
  if (fast) return fast;
  const definition = knowledge.WIKI_RE.test(norm(question).replace(/[?!.]+$/, ''));
  if (mode !== 'local' && (intent.kind === 'free' || intent.complex || lifeToClaude || definition)) return { claude: true, intent, life };
  if (intent.kind === 'free' || definition) {
    emit({ type: 'status', text: 'Recherche…' });
    const k = await knowledge.answer(question, { city: context && context.city });
    if (k) return { answer: k };
    if (intent.kind === 'free') return { answer: SORRY };
  }
  return localAnswer(intent, briefing);
}

async function askClaude(question, { history, context }, briefing, emit, intent, life) {
  let sent = false;
  const onText = (t) => { if (t) { sent = true; emit({ type: 'delta', text: t }); } };
  try {
    const r = mode === 'fake' ? await viaFake(question, onText)
      : mode === 'claude-code' ? await viaClaudeCode(question, history, briefing, emit, context, onText)
        : await viaApi(question, history, briefing, emit, context, onText);
    r.answer = cleanSpoken(r.answer) || SORRY;
    if (sent) r.streamed = true;
    if (life) { r.action = life.action; r.tab = life.tab; }
    else if (intent && !r.visual && intent.kind !== 'free') r.visual = localAnswer(intent, briefing).visual;
    return r;
  } catch (e) {
    console.error('[Rocket] Claude indisponible :', e.message);
    // Déjà en partie lu à voix haute : on n'ajoute qu'une phrase d'excuse.
    if (sent) {
      const sorry = ' Désolé Monsieur, la réponse a été interrompue.';
      emit({ type: 'delta', text: sorry });
      return { answer: sorry.trim(), streamed: true };
    }
    if (life) return life;
    const k = await knowledge.answer(question, { city: context && context.city });
    if (k) return { answer: k };
    if (intent && intent.kind !== 'free' && intent.kind !== 'definition') return localAnswer(intent, briefing);
    return { answer: "Désolé Monsieur, je n'arrive pas à joindre Claude pour le moment." };
  }
}

const ACTION_KEYS = ['action', 'from', 'tab', 'event', 'removeId', 'habit', 'delta', 'recipeId', 'music', 'visual'];

async function answer(input, briefing, emit) {
  const question = String(input.question || '').slice(0, 1000).trim();
  if (!question || !norm(question)) return { answer: SORRY };
  const parts = splitQuestions(question);
  if (parts.length <= 1) {
    const r = await answerLocal(question, input, briefing, emit);
    return r.claude ? askClaude(question, input, briefing, emit, r.intent, r.life) : r;
  }
  // Plusieurs demandes : chacune est traitée ; celles qui demandent Claude partent ensemble.
  const results = [];
  for (const p of parts) results.push(await answerLocal(p, input, briefing, emit));
  const forClaude = parts.filter((p, i) => results[i].claude);
  // Dès qu'une partie part en flux, tout part en flux et dans l'ordre : le navigateur ne répète rien.
  let streamed = false;
  if (forClaude.length) {
    const say = (t) => { if (t) { streamed = true; emit({ type: 'delta', text: t + ' ' }); } };
    const first = results.findIndex((r) => r.claude);
    results.slice(0, first).forEach((r) => say(r.answer));
    const c = await askClaude(forClaude.join(' ; '), input, briefing, emit, null, null);
    if (c.streamed) { streamed = true; emit({ type: 'delta', text: ' ' }); } else say(c.answer);
    results.slice(first + 1).forEach((r) => { if (!r.claude) say(r.answer); });
    results.forEach((r, i) => { if (r.claude) results[i] = i === first ? c : null; });
  }
  const done = results.filter(Boolean);
  const merged = { answer: done.map((r) => r.answer).filter(Boolean).join(' '), actions: [], streamed };
  for (const r of done) {
    const a = {};
    for (const k of ACTION_KEYS) if (r[k] !== undefined) a[k] = r[k];
    if (Object.keys(a).length) merged.actions.push(a);
  }
  // Compatibilité : la dernière action est aussi à la racine.
  Object.assign(merged, merged.actions[merged.actions.length - 1] || {});
  return merged;
}

module.exports = { init, ask, getMode, modeLabel, detectIntent, norm, describeAsset, describeOverview, localAnswer, lifeAnswer, contextJson, splitQuestions, SYSTEM, SORRY };
