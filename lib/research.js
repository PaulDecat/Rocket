'use strict';
// Outils de recherche de Claude (mode API) + construction des graphiques demandés par Claude.

const { fetchYahoo, fetchWithTimeout, INSTRUMENTS, demoHistory } = require('./sources');

const RANGES = {
  '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '6mo': '1d', ytd: '1d', '1y': '1d', '2y': '1wk', '5y': '1wk', '10y': '1mo', max: '1mo',
};
const SYMBOL_RE = /^[A-Za-z0-9^=.\-]{1,20}$/;

function validRange(r) { return Object.prototype.hasOwnProperty.call(RANGES, r) ? r : '1y'; }

async function searchSymbol(query) {
  const q = String(query || '').slice(0, 80);
  const res = await fetchWithTimeout(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=fr-FR`);
  if (!res.ok) throw new Error('Recherche Yahoo HTTP ' + res.status);
  const j = await res.json();
  return (j.quotes || []).slice(0, 8).map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType, exchange: x.exchDisp || x.exchange }));
}

function sample(points, max = 60) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

async function marketHistory(symbol, range = '1y') {
  if (!SYMBOL_RE.test(String(symbol || ''))) throw new Error('Symbole invalide');
  range = validRange(range);
  let points, name = symbol, live = true;
  try {
    const r = await fetchYahoo(symbol, range, RANGES[range]);
    points = r.points;
    name = r.meta.shortName || r.meta.longName || symbol;
  } catch (e) {
    const inst = INSTRUMENTS.find((i) => i.symbol === symbol);
    if (!inst) throw e;
    points = demoHistory(inst); name = inst.name; live = false;
  }
  if (points.length < 2) throw new Error('Pas assez de données');
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol);
  if (inst) name = inst.name;
  const v = points.map((p) => p.v);
  const first = v[0], last = v[v.length - 1];
  return {
    symbol, name, range, live, points,
    stats: {
      first: +first.toFixed(4), last: +last.toFixed(4), changePct: +(((last - first) / first) * 100).toFixed(2),
      high: +Math.max(...v).toFixed(4), low: +Math.min(...v).toFixed(4),
      from: new Date(points[0].t).toISOString().slice(0, 10), to: new Date(points[points.length - 1].t).toISOString().slice(0, 10),
    },
  };
}

// Graphique « custom » à partir de symboles cotés.
async function marketVisual(list, title) {
  const items = (Array.isArray(list) ? list : []).slice(0, 4);
  const got = await Promise.allSettled(items.map((m) => marketHistory(m.symbol, m.range || '1y')));
  const series = [];
  got.forEach((g, i) => {
    if (g.status === 'fulfilled') series.push({ name: items[i].name || g.value.name, symbol: g.value.symbol, points: g.value.points.map((p) => ({ x: p.t, y: p.v })) });
  });
  if (!series.length) return null;
  return { type: 'custom', kind: 'line', title: title || series.map((s) => s.name).join(' / '), unit: '', source: 'Yahoo Finance', series, rebase: series.length > 1, range: items[0].range || '1y' };
}

// Graphique « custom » à partir de points fournis (jamais inventés : source obligatoire).
function pointsVisual(chart) {
  if (!chart || !Array.isArray(chart.series) || !chart.source) return null;
  const series = chart.series.slice(0, 5).map((s) => ({
    name: String(s.name || '').slice(0, 60),
    points: (Array.isArray(s.points) ? s.points : []).slice(0, 400)
      .map((p) => ({ x: typeof p.x === 'number' ? p.x : String(p.x || '').slice(0, 30), y: Number(p.y) }))
      .filter((p) => isFinite(p.y)),
  })).filter((s) => s.points.length >= 1);
  if (!series.length) return null;
  const kind = chart.kind === 'bar' ? 'bar' : 'line';
  if (kind === 'line' && !series.some((s) => s.points.length >= 2)) return null;
  // Axe temporel si les x ressemblent à des dates.
  for (const s of series) {
    s.points.forEach((p) => {
      if (typeof p.x === 'string' && /^\d{4}(-\d{2})?(-\d{2})?$/.test(p.x)) {
        const t = Date.parse(p.x.length === 4 ? p.x + '-01-01' : p.x.length === 7 ? p.x + '-01' : p.x);
        if (isFinite(t)) p.x = t;
      }
    });
  }
  return { type: 'custom', kind, title: String(chart.title || '').slice(0, 100), unit: String(chart.unit || '').slice(0, 20), source: String(chart.source).slice(0, 80), series };
}

function figureVisual(f) {
  if (!f || f.value == null || f.value === '' || !f.label) return null;
  return {
    type: 'figure', label: String(f.label).slice(0, 100), value: String(f.value).slice(0, 30), unit: String(f.unit || '').slice(0, 20),
    date: String(f.date || '').slice(0, 40), change: String(f.change || '').slice(0, 40), source: String(f.source || '').slice(0, 80),
  };
}

// ---------- Définitions d'outils pour l'API Anthropic ----------
const TOOLS = [
  {
    name: 'search_symbol',
    description: "Trouve le symbole Yahoo Finance d'un actif coté (action, indice, devise, matière première, crypto, ETF). Exemple : « LVMH » → MC.PA.",
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_market_history',
    description: "Historique d'un symbole Yahoo Finance : statistiques (premier, dernier, variation, plus haut, plus bas) et points échantillonnés. Prépare aussi le graphique affiché à l'utilisateur.",
    input_schema: { type: 'object', properties: { symbol: { type: 'string' }, range: { type: 'string', enum: Object.keys(RANGES) } }, required: ['symbol'] },
  },
  {
    name: 'show_chart',
    description: "Affiche un graphique à l'utilisateur. Soit `symbols` (comparaison de symboles cotés), soit `series` avec des points RÉELS trouvés dans une source (jamais de valeurs inventées ; `source` obligatoire). Ou `figure` pour un chiffre clé unique.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        symbols: { type: 'array', items: { type: 'string' } },
        range: { type: 'string', enum: Object.keys(RANGES) },
        kind: { type: 'string', enum: ['line', 'bar'] },
        unit: { type: 'string' },
        source: { type: 'string' },
        series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, points: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' }, y: { type: 'number' } }, required: ['x', 'y'] } } }, required: ['name', 'points'] } },
        figure: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' }, date: { type: 'string' }, change: { type: 'string' }, source: { type: 'string' } } },
      },
    },
  },
];

async function runTool(name, input, ctx) {
  input = input || {};
  if (name === 'search_symbol') {
    ctx.status(`Recherche du symbole : ${String(input.query || '').slice(0, 40)}`);
    return { results: await searchSymbol(input.query) };
  }
  if (name === 'get_market_history') {
    ctx.status(`Historique de ${input.symbol}`);
    const h = await marketHistory(input.symbol, input.range);
    ctx.visual = { type: 'custom', kind: 'line', title: h.name, unit: '', source: 'Yahoo Finance', range: h.range, series: [{ name: h.name, symbol: h.symbol, points: h.points.map((p) => ({ x: p.t, y: p.v })) }] };
    return { symbol: h.symbol, name: h.name, range: h.range, stats: h.stats, points: sample(h.points).map((p) => [new Date(p.t).toISOString().slice(0, 10), +p.v.toFixed(4)]) };
  }
  if (name === 'show_chart') {
    ctx.status('Préparation du graphique');
    let v = null;
    if (input.figure) v = figureVisual(input.figure);
    else if (Array.isArray(input.symbols) && input.symbols.length) {
      v = await marketVisual(input.symbols.filter((s) => SYMBOL_RE.test(s)).map((s) => ({ symbol: s, range: validRange(input.range) })), input.title);
    } else v = pointsVisual(input);
    if (!v) return { ok: false, error: 'Graphique refusé : données insuffisantes ou source manquante.' };
    ctx.visual = v;
    return { ok: true };
  }
  return { ok: false, error: 'Outil inconnu' };
}

module.exports = { TOOLS, runTool, searchSymbol, marketHistory, marketVisual, pointsVisual, figureVisual, RANGES, SYMBOL_RE };
