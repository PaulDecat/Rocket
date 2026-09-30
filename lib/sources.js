'use strict';
// Données de marché (Yahoo Finance), actualités (RSS) et données de démo.

const INSTRUMENTS = [
  { symbol: '^FCHI', name: 'CAC 40', short: 'CAC', group: 'europe', unit: 'pts', decimals: 2, spoken: 'le CAC 40', base: 7600 },
  { symbol: '^GDAXI', name: 'DAX', short: 'DAX', group: 'europe', unit: 'pts', decimals: 2, spoken: 'le DAX allemand', base: 19500 },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', short: 'SX5E', group: 'europe', unit: 'pts', decimals: 2, spoken: "l'Euro Stoxx 50", base: 5000 },
  { symbol: '^GSPC', name: 'S&P 500', short: 'SPX', group: 'us', unit: 'pts', decimals: 2, spoken: 'le S&P 500', base: 5900 },
  { symbol: '^IXIC', name: 'Nasdaq', short: 'NDX', group: 'us', unit: 'pts', decimals: 2, spoken: 'le Nasdaq', base: 19000 },
  { symbol: '^DJI', name: 'Dow Jones', short: 'DJI', group: 'us', unit: 'pts', decimals: 2, spoken: 'le Dow Jones', base: 43000 },
  { symbol: '^N225', name: 'Nikkei 225', short: 'N225', group: 'asia', unit: 'pts', decimals: 2, spoken: 'le Nikkei', base: 39000 },
  { symbol: '^HSI', name: 'Hang Seng', short: 'HSI', group: 'asia', unit: 'pts', decimals: 2, spoken: 'le Hang Seng', base: 21000 },
  { symbol: 'EURUSD=X', name: 'EUR / USD', short: 'EURUSD', group: 'fx', unit: '$', decimals: 4, spoken: "l'euro-dollar", base: 1.09 },
  { symbol: '^TNX', name: 'Taux US 10 ans', short: 'US10Y', group: 'fx', unit: '%', decimals: 3, spoken: 'le taux américain à 10 ans', base: 4.3 },
  { symbol: 'BZ=F', name: 'Pétrole Brent', short: 'BRENT', group: 'commodities', unit: '$', decimals: 2, spoken: 'le Brent', base: 75 },
  { symbol: 'GC=F', name: 'Or', short: 'GOLD', group: 'commodities', unit: '$', decimals: 2, spoken: "l'once d'or", base: 2600 },
  { symbol: 'BTC-USD', name: 'Bitcoin', short: 'BTC', group: 'commodities', unit: '$', decimals: 0, spoken: 'le bitcoin', base: 90000 },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  // ROCKET_OFFLINE=1 simule une coupure réseau (tests du mode démo).
  if (process.env.ROCKET_OFFLINE === '1') throw new Error('Hors ligne (ROCKET_OFFLINE)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Pseudo-aléatoire déterministe (mode démo) ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function todayKey() { return new Date().toISOString().slice(0, 10); }

const DEMO_VOL = { '^TNX': 0.012, 'EURUSD=X': 0.004, 'BTC-USD': 0.03, 'BZ=F': 0.018, 'GC=F': 0.009 };

function demoHistory(inst, days = 260) {
  const rnd = mulberry32(hashStr(inst.symbol + todayKey()));
  const vol = DEMO_VOL[inst.symbol] || 0.011;
  const drift = (rnd() - 0.45) * 0.0012;
  const pts = [];
  let v = inst.base * (0.85 + rnd() * 0.2);
  const d = new Date(); d.setUTCHours(21, 0, 0, 0);
  const dates = [];
  while (dates.length < days) {
    const wd = d.getUTCDay();
    if (inst.symbol === 'BTC-USD' || (wd !== 0 && wd !== 6)) dates.unshift(d.getTime());
    d.setUTCDate(d.getUTCDate() - 1);
  }
  for (const t of dates) {
    const g = (rnd() + rnd() + rnd() - 1.5) * 1.15;
    v = v * (1 + drift + g * vol);
    pts.push({ t, v: round(v, inst.decimals + 2) });
  }
  // recale le niveau final près du niveau de référence
  const k = inst.base / pts[pts.length - 1].v * (0.97 + rnd() * 0.06);
  return pts.map((p) => ({ t: p.t, v: round(p.v * k, inst.decimals + 2) }));
}

function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

function summarize(inst, history, live) {
  const n = history.length;
  const price = history[n - 1].v;
  const prevClose = n > 1 ? history[n - 2].v : price;
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const ref = history[Math.max(0, n - 1 - 22)].v;
  const monthPct = ref ? ((price - ref) / ref) * 100 : 0;
  return {
    symbol: inst.symbol, name: inst.name, short: inst.short, group: inst.group, unit: inst.unit,
    decimals: inst.decimals, spoken: inst.spoken,
    price: round(price, inst.decimals + 2), prevClose: round(prevClose, inst.decimals + 2),
    change: round(change, inst.decimals + 2), changePct: round(changePct, 3), monthPct: round(monthPct, 3),
    history, live,
  };
}

function parseYahooChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) throw new Error('Réponse Yahoo vide');
  const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const pts = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const v = closes[i];
    if (v != null && isFinite(v)) pts.push({ t: r.timestamp[i] * 1000, v });
  }
  return { meta: r.meta || {}, points: pts };
}

async function fetchYahoo(symbol, range = '1y', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Yahoo HTTP ' + res.status);
  return parseYahooChart(await res.json());
}

async function fetchInstrument(inst) {
  try {
    const { meta, points } = await fetchYahoo(inst.symbol, '1y', '1d');
    if (points.length < 30) throw new Error('Historique trop court');
    const last = meta.regularMarketPrice;
    if (last != null && isFinite(last)) {
      const lastPt = points[points.length - 1];
      const mt = (meta.regularMarketTime || 0) * 1000;
      const sameDay = mt && new Date(mt).toISOString().slice(0, 10) === new Date(lastPt.t).toISOString().slice(0, 10);
      if (mt && !sameDay && mt > lastPt.t) points.push({ t: mt, v: last });
      else lastPt.v = last;
    }
    return summarize(inst, points, true);
  } catch (e) {
    return summarize(inst, demoHistory(inst), false);
  }
}

async function getMarkets() {
  return Promise.all(INSTRUMENTS.map(fetchInstrument));
}

// ---------- Intraday ----------
async function getIntraday(symbol, range) {
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol);
  const cfg = range === '5d' ? { range: '5d', interval: '30m' } : { range: '1d', interval: '5m' };
  try {
    const { points } = await fetchYahoo(symbol, cfg.range, cfg.interval);
    if (points.length < 2) throw new Error('vide');
    return { symbol, range: cfg.range, live: true, points };
  } catch (e) {
    return { symbol, range: cfg.range, live: false, points: demoIntraday(inst || { symbol, base: 100, decimals: 2 }, cfg.range) };
  }
}

function demoIntraday(inst, range) {
  const rnd = mulberry32(hashStr(inst.symbol + range + todayKey()));
  const step = range === '5d' ? 30 : 5;
  const count = range === '5d' ? 17 * 5 : 102;
  const vol = (DEMO_VOL[inst.symbol] || 0.011) / Math.sqrt(range === '5d' ? 17 : 102);
  let v = inst.base;
  const now = Date.now();
  const pts = [];
  for (let i = count - 1; i >= 0; i--) {
    v = v * (1 + (rnd() - 0.5) * 2 * vol);
    pts.push({ t: now - i * step * 60000, v: round(v, (inst.decimals || 2) + 2) });
  }
  return pts;
}

// ---------- Actualités ----------
const FEEDS = [
  'https://news.google.com/rss/search?q=%C3%A9conomie+OR+bourse+OR+march%C3%A9s+when:1d&hl=fr&gl=FR&ceid=FR:fr',
  'https://www.lesechos.fr/rss/rss_finance-marches.xml',
  'https://www.bfmtv.com/rss/economie/',
];

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

function parseRss(xml, feedUrl) {
  const items = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  const isGoogle = /news\.google\./.test(feedUrl);
  while ((m = re.exec(xml))) {
    const b = m[0];
    let title = tag(b, 'title');
    let source = tag(b, 'source');
    const link = tag(b, 'link');
    const pub = tag(b, 'pubDate');
    if (isGoogle) {
      const i = title.lastIndexOf(' - ');
      if (i > 20) { if (!source) source = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
    }
    if (!source) source = feedUrl.includes('lesechos') ? 'Les Echos' : feedUrl.includes('bfmtv') ? 'BFM Business' : hostOf(link);
    const t = Date.parse(pub);
    if (title) items.push({ title, link, source, time: isFinite(t) ? t : Date.now() });
  }
  return items;
}

function normTitle(t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60); }

async function getNews() {
  const results = await Promise.allSettled(FEEDS.map(async (url) => {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('RSS HTTP ' + res.status);
    return parseRss(await res.text(), url);
  }));
  const all = [];
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);
  const seen = new Set();
  const uniq = [];
  for (const it of all.sort((a, b) => b.time - a.time)) {
    const k = normTitle(it.title);
    if (!k || seen.has(k)) continue;
    seen.add(k); uniq.push(it);
  }
  if (!uniq.length) return { live: false, items: demoNews() };
  return { live: true, items: uniq.slice(0, 6) };
}

function demoNews() {
  const now = Date.now();
  return [
    "La BCE maintient ses taux directeurs et reste prudente sur l'inflation",
    "Les valeurs du luxe portées par des signes de reprise de la demande chinoise",
    "Le prix du baril recule après la hausse surprise des stocks américains",
    "L'inflation en zone euro ralentit légèrement, selon Eurostat",
    "Les géants de la tech américaine tirent Wall Street vers de nouveaux sommets",
  ].map((title, i) => ({ title, link: '', source: 'Démo', time: now - i * 3600000 }));
}

module.exports = {
  INSTRUMENTS, getMarkets, getIntraday, getNews, fetchYahoo, fetchWithTimeout,
  parseRss, decodeEntities, demoHistory, demoNews, summarize, UA,
};
