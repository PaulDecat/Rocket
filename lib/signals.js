'use strict';
// Indicateurs techniques et radar investissement.

function sma(values, n) {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

function rsi(values, n = 14) {
  if (values.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / n, avgL = loss / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function volatility(values, n) {
  const v = n ? values.slice(-(n + 1)) : values;
  if (v.length < 3) return null;
  const r = [];
  for (let i = 1; i < v.length; i++) r.push(Math.log(v[i] / v[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(252) * 100;
}

function perf(values, n) {
  if (values.length < 2) return null;
  const i = Math.max(0, values.length - 1 - n);
  return ((values[values.length - 1] - values[i]) / values[i]) * 100;
}

function r1(x) { return x == null || !isFinite(x) ? null : Math.round(x * 100) / 100; }

function computeStats(m) {
  const v = m.history.map((p) => p.v);
  const price = v[v.length - 1];
  const ma50 = sma(v, 50), ma200 = sma(v, 200);
  const high = Math.max(...v), low = Math.min(...v);
  let trend = 'neutre';
  if (ma50 != null && ma200 != null) {
    if (price > ma50 && ma50 > ma200) trend = 'haussière';
    else if (price < ma50 && ma50 < ma200) trend = 'baissière';
  }
  const vol20 = volatility(v, 20), volYear = volatility(v, 0);
  const risk = vol20 == null ? 'modéré' : vol20 < 12 ? 'faible' : vol20 < 25 ? 'modéré' : 'élevé';
  return {
    rsi: r1(rsi(v, 14)), ma50: r1(ma50), ma200: r1(ma200), vol20: r1(vol20), volYear: r1(volYear),
    perf1w: r1(perf(v, 5)), perf1m: r1(perf(v, 21)), perf3m: r1(perf(v, 63)), perf1y: r1(perf(v, v.length - 1)),
    high: r1(high), low: r1(low), fromHigh: r1(((price - high) / high) * 100), fromLow: r1(((price - low) / low) * 100),
    trend, risk,
  };
}

function fr(x, d = 1) { return Number(x).toFixed(d).replace('.', ','); }

function signalsFor(m) {
  const s = m.stats;
  const out = [];
  const add = (kind, title, text, score) => out.push({ symbol: m.symbol, name: m.name, kind, title, text, score: Math.min(99, Math.round(score)) });
  const price = m.price;
  if (s.rsi != null && s.rsi < 30) {
    add('opportunity', 'Zone de survente', `Le RSI est à ${fr(s.rsi, 0)} : ${m.name} a beaucoup baissé en peu de temps. Un rebond technique est possible, mais la baisse peut aussi continuer.`, 70 + (30 - s.rsi) * 2);
  }
  if (s.ma200 != null && price > s.ma200 && s.fromHigh <= -5 && s.rsi != null && s.rsi < 45) {
    add('opportunity', 'Repli dans une tendance de fond haussière', `${m.name} reste au-dessus de sa moyenne 200 jours mais a reculé de ${fr(Math.abs(s.fromHigh))} % depuis son plus haut annuel. Les investisseurs de long terme surveillent souvent ce genre de repli.`, 62 + Math.min(20, Math.abs(s.fromHigh)));
  }
  if (s.trend === 'haussière' && s.perf3m > 6 && s.rsi != null && s.rsi < 70) {
    add('trend', 'Dynamique haussière solide', `+${fr(s.perf3m)} % en trois mois, avec un cours au-dessus de ses moyennes 50 et 200 jours, sans excès de surachat pour l'instant.`, 50 + s.perf3m);
  }
  if (s.rsi != null && s.rsi > 70) {
    add('warning', 'Surachat', `Le RSI atteint ${fr(s.rsi, 0)} : la hausse a été rapide. Acheter maintenant, c'est s'exposer à une consolidation.`, 60 + (s.rsi - 70) * 2);
  }
  if (s.trend === 'baissière') {
    add('warning', 'Tendance baissière installée', `Le cours est sous ses moyennes 50 et 200 jours. Prudence : on dit qu'il ne faut pas rattraper un couteau qui tombe.`, 55 + Math.min(25, Math.abs(s.perf3m || 0)));
  }
  if (s.vol20 != null && s.volYear && s.vol20 > 1.4 * s.volYear && s.vol20 > 15) {
    const ratio = s.vol20 / s.volYear;
    add('warning', 'Volatilité en forte hausse', `La volatilité sur 20 jours (${fr(s.vol20, 0)} %) est nettement supérieure à sa moyenne annuelle : les mouvements sont plus brusques qu'à l'habitude.`, 58 + ratio * 5);
  }
  if (Math.abs(m.changePct) >= 2.5) {
    add('warning', 'Mouvement violent sur la séance', `${m.changePct > 0 ? '+' : ''}${fr(m.changePct)} % sur la dernière séance : un tel écart signale souvent une nouvelle importante ou un marché nerveux.`, 60 + Math.abs(m.changePct) * 3);
  }
  if (s.fromHigh > -1 && s.trend === 'haussière') {
    add('trend', "Au sommet de l'année", `${m.name} évolue à moins de 1 % de son plus haut annuel : la tendance est porteuse, mais le point d'entrée est moins avantageux.`, 52);
  }
  return out;
}

function conviction(score) { return score >= 75 ? 'forte' : score >= 60 ? 'moyenne' : 'faible'; }

const DISCLAIMER = "Signaux techniques automatiques à visée pédagogique. Ce ne sont pas des conseils en investissement personnalisés : investissez uniquement ce que vous pouvez vous permettre de perdre.";

function buildRadar(markets) {
  const all = [];
  for (const m of markets) {
    if (!m.stats) m.stats = computeStats(m);
    for (const s of signalsFor(m)) {
      s.conviction = conviction(s.score);
      s.risk = m.stats.risk;
      s.changePct = m.changePct;
      all.push(s);
    }
  }
  const by = (k) => all.filter((s) => s.kind === k).sort((a, b) => b.score - a.score);
  const opportunities = by('opportunity'), trends = by('trend'), warnings = by('warning');
  return {
    topPick: opportunities[0] || trends[0] || null,
    opportunities, trends, warnings, disclaimer: DISCLAIMER,
  };
}

module.exports = { sma, rsi, volatility, perf, computeStats, signalsFor, buildRadar, conviction, DISCLAIMER };
