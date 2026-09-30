'use strict';
// Cerveau de Nova : intentions locales, réponses locales, Claude (Claude Code ou API).

const music = require('./music');
const claudeCode = require('./claude-code');
const research = require('./research');
const { mood, level, fixGrammar } = require('./script');

let mode = 'local';

async function init() {
  const forced = (process.env.ASSISTANT || '').toLowerCase();
  if (forced === 'local') mode = 'local';
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
    .replace(/\b(ok|okay|hey|dis)\s+nova\b[\s,]*/g, '').replace(/^nova\s*,\s*/, '').replace(/\s+/g, ' ').trim();
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

function detectIntent(question) {
  const t = norm(question);
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 4 && /^(stop|arrete|arretez|arrete toi|pause|silence|tais[- ]toi|taisez[- ]vous|chut|stoppe|coupe)\b/.test(t)) return { kind: 'action', action: 'stop' };
  if (/\b(lance|reprends|reprend|continue|relance|demarre|joue|redemarre)\b.*\b(briefing|morning|podcast|emission|lecture)\b/.test(t) || /^(reprends|continue|reprise)$/.test(t)) return { kind: 'action', action: 'play' };
  if (words <= 5 && /^(suivant|suivante|passe|la suite|segment suivant|passe au suivant|passe a la suite|next)\b/.test(t)) return { kind: 'action', action: 'next' };
  const complex = isComplex(t);
  if (/\b(radar|invest\w*|opportunite\w*|gros coup|acheter|placement\w*|conseil\w*|vigilance|risques?)\b/.test(t) && !findAsset(t) && !/\bcds\b/.test(t)) return { kind: 'radar', complex };
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
function contextJson(briefing) {
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return JSON.stringify({
    date: new Date().toISOString().slice(0, 16),
    marches: briefing.markets.map((m) => ({
      s: m.symbol, n: m.name, cours: r2(m.price), varJour: r2(m.changePct), var1m: r2(m.monthPct),
      var3m: m.stats && m.stats.perf3m, var1a: m.stats && m.stats.perf1y, rsi: m.stats && m.stats.rsi,
      tendance: m.stats && m.stats.trend, risque: m.stats && m.stats.risk, live: m.live,
    })),
    radar: { top: briefing.radar.topPick && { s: briefing.radar.topPick.symbol, t: briefing.radar.topPick.title }, alertes: briefing.radar.warnings.slice(0, 4).map((w) => ({ s: w.symbol, t: w.title })) },
    actus: briefing.news.slice(0, 6).map((n) => ({ t: n.title, src: n.source })),
  });
}

const SYSTEM = `Tu es Nova, l'assistante vocale de Rocket, une application de morning économique façon J.A.R.V.I.S. Tu réponds en français à un particulier, et ta réponse est lue à voix haute.
Sois précise, chiffrée et datée. Les données du jour (13 marchés avec statistiques, radar, actualités) sont fournies en contexte : utilise-les en priorité. Pour tout le reste (CDS, spreads, inflation, PIB, taux directeurs, entreprises…), fais une recherche web.
Montre un graphique dès que possible : pour un actif coté, indique son symbole Yahoo Finance ; pour une donnée non cotée, fournis des points réels datés (au moins 2, tirés de ta source ; tu peux déduire l'historique à partir des variations publiées) avec la source ; pour une valeur unique, un chiffre clé. Ne jamais inventer de valeurs.
Investissement : reste pédagogique, explique les risques, ne promets jamais de gain et précise que ce n'est pas un conseil personnalisé. Si tu ne trouves pas l'information, dis-le simplement.
Style : 2 à 6 phrases, sans markdown, sans liste, sans émoji, sans URL. Écris « 1,25 pour cent », « 45 points de base », et les nombres sans séparateur de milliers.`;

function historyText(history) {
  const h = (Array.isArray(history) ? history : []).slice(-6)
    .filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string')
    .map((x) => `Utilisateur : ${x.q.slice(0, 300)}\nNova : ${x.a.slice(0, 600)}`);
  return h.length ? `Échanges précédents :\n${h.join('\n')}\n\n` : '';
}

// ---------- Claude Code ----------
async function viaClaudeCode(question, history, briefing, emit) {
  const prompt = `Données du jour (JSON) : ${contextJson(briefing)}\n\n${historyText(history)}Question : ${question}\n\nRéponds au format JSON demandé : answer (2 à 6 phrases), et si pertinent market (symboles Yahoo à tracer), chart (points réels sourcés) ou figure (chiffre clé).`;
  emit({ type: 'status', text: 'Nova réfléchit avec Claude…' });
  const out = await claudeCode.ask({ prompt, system: SYSTEM, onStatus: (text) => emit({ type: 'status', text }) });
  return buildResult(out);
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
async function viaApi(question, history, briefing, emit) {
  const Anthropic = require('@anthropic-ai/sdk');
  if (!client) client = new Anthropic();
  const ctx = { visual: null, status: (text) => emit({ type: 'status', text }) };
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
    ...research.TOOLS,
  ];
  const messages = [{ role: 'user', content: `Données du jour (JSON) : ${contextJson(briefing)}\n\n${historyText(history)}Question : ${question}` }];
  emit({ type: 'status', text: 'Nova réfléchit avec Claude…' });
  let answer = '';
  for (let turn = 0; turn < 10; turn++) {
    const res = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    for (const b of res.content) {
      if (b.type === 'server_tool_use') {
        if (b.name === 'web_search') ctx.status(`Recherche web : ${String((b.input && b.input.query) || '').slice(0, 70)}`);
        if (b.name === 'web_fetch') { try { ctx.status(`Lecture de ${new URL(b.input.url).hostname.replace(/^www\./, '')}`); } catch (e) { ctx.status('Lecture d\'une page'); } }
      }
    }
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (res.stop_reason === 'refusal') { answer = "Je ne peux pas répondre à cette question."; break; }
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
  return { answer: cleanSpoken(answer) || "Je n'ai pas trouvé de réponse fiable.", visual: ctx.visual || undefined };
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

async function answer({ question, history, deezerUser }, briefing, emit) {
  question = String(question || '').slice(0, 1000).trim();
  if (!question) return { answer: "Je n'ai pas compris la question." };

  const mi = music.parseMusic(question);
  if (mi) {
    emit({ type: 'status', text: 'Deezer…' });
    const r = await music.runMusic(mi, typeof deezerUser === 'string' ? deezerUser.slice(0, 300) : '');
    if (r) return r;
  }

  const intent = detectIntent(question);
  if (intent.kind === 'action') {
    const txt = { stop: "D'accord, j'arrête.", play: 'Je relance le briefing.', next: 'Passons à la suite.' }[intent.action];
    return { answer: txt, action: intent.action };
  }
  const useClaude = mode !== 'local' && (intent.kind === 'free' || intent.complex);
  if (!useClaude) {
    if (intent.kind === 'free') {
      return {
        answer: `Pour répondre à cette question, j'ai besoin de Claude, qui n'est pas connecté. En attendant, voici le point marché. ${describeOverview(briefing.markets)}`,
        visual: { type: 'overview' },
      };
    }
    return localAnswer(intent, briefing);
  }
  try {
    const r = mode === 'claude-code'
      ? await viaClaudeCode(question, history, briefing, emit)
      : await viaApi(question, history, briefing, emit);
    r.answer = cleanSpoken(r.answer);
    if (!r.visual && intent.kind !== 'free') r.visual = localAnswer(intent, briefing).visual;
    return r;
  } catch (e) {
    console.error('[Nova] Claude indisponible :', e.message);
    if (intent.kind !== 'free') {
      const r = localAnswer(intent, briefing);
      return r;
    }
    return { answer: `Je n'arrive pas à joindre Claude pour le moment. ${describeOverview(briefing.markets)}`, visual: { type: 'overview' } };
  }
}

module.exports = { init, ask, getMode, modeLabel, detectIntent, norm, describeAsset, describeOverview, localAnswer, contextJson, SYSTEM };
