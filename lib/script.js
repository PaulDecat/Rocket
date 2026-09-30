'use strict';
// Écriture du script du podcast : répliques de Nova (lead) et Atlas (co) + visuel associé.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function spokenDate(d = new Date()) {
  const day = d.getDate();
  return `${JOURS[d.getDay()]} ${day === 1 ? '1er' : day} ${MOIS[d.getMonth()]}`;
}

// Nombre à l'oral : pas de séparateur de milliers, virgule décimale.
function num(v, d = 2) {
  const s = Math.abs(v) >= 1000 ? Number(v).toFixed(Math.min(d, 0)) : Number(v).toFixed(d);
  return s.replace('-', 'moins ').replace('.', ',').replace(/,0+$/, '');
}
function pct(v, d = 1) { return `${num(Math.abs(v), d)} pour cent`; }

function level(m) {
  if (m.unit === 'pts') return `${num(m.price, 0)} points`;
  if (m.unit === '%') return `${num(m.price, 2)} pour cent`;
  if (m.symbol === 'EURUSD=X') return `${num(m.price, 4)} dollar pour un euro`;
  return `${num(m.price, m.price >= 1000 ? 0 : 2)} dollars`;
}

function fixGrammar(s) {
  return s
    .replace(/(^|[\s(])à le\s/g, '$1au ').replace(/(^|[\s(])à les\s/g, '$1aux ')
    .replace(/(^|[\s(])de le\s/g, '$1du ').replace(/(^|[\s(])de les\s/g, '$1des ')
    .replace(/\+(\d)/g, 'plus $1').replace(/(\d)\s?%/g, '$1 pour cent')
    .replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// « le CAC 40 gagne 0,8 pour cent »
function move(m) {
  const c = m.changePct;
  const a = Math.abs(c);
  if (a < 0.1) return `${m.spoken} est quasiment stable`;
  if (c > 0) return `${m.spoken} ${a >= 1.5 ? "s'envole de" : 'gagne'} ${pct(c)}${a >= 1.5 ? ', une nette hausse' : ''}`;
  return `${m.spoken} ${a >= 1.5 ? 'décroche de' : 'cède'} ${pct(c)}${a >= 1.5 ? ', un net recul' : ''}`;
}

function mood(markets) {
  const eq = markets.filter((m) => ['europe', 'us', 'asia'].includes(m.group));
  const avg = eq.reduce((a, m) => a + m.changePct, 0) / (eq.length || 1);
  if (avg > 0.6) return 'euphorique';
  if (avg > 0.15) return 'plutôt positive';
  if (avg > -0.15) return 'hésitante';
  if (avg > -0.6) return 'plutôt morose';
  return 'nettement négative';
}

function monthSentence(m) {
  const p = m.monthPct;
  if (Math.abs(p) < 0.3) return 'Sur un mois, le bilan est quasiment neutre.';
  return `Sur un mois, ${p > 0 ? 'la progression atteint' : 'le recul atteint'} ${pct(p)}.`;
}

function buildScript({ markets, news, radar, date = new Date() }) {
  const by = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  const seg = [];
  const say = (speaker, text, visual) => seg.push({ speaker, host: speaker === 'lead' ? 'Nova' : 'Atlas', text: fixGrammar(text), visual });
  const sorted = [...markets].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const cac = by['^FCHI'], dax = by['^GDAXI'], sx = by['^STOXX50E'], spx = by['^GSPC'], ndx = by['^IXIC'], dji = by['^DJI'];
  const nik = by['^N225'], hsi = by['^HSI'], eur = by['EURUSD=X'], tnx = by['^TNX'], brent = by['BZ=F'], gold = by['GC=F'], btc = by['BTC-USD'];

  say('lead', `Bonjour et bienvenue dans Rocket, votre morning économique. Nous sommes ${spokenDate(date)}, je suis Nova, et comme chaque matin je suis accompagnée d'Atlas.`, { type: 'intro', label: 'Ouverture' });
  say('co', "Bonjour Nova, bonjour à tous. Au programme ce matin : les Bourses européennes, Wall Street, l'Asie, les taux et les devises, les matières premières, et bien sûr l'actualité économique.", { type: 'intro', label: 'Ouverture' });

  say('lead', `Commençons par la vue d'ensemble. L'ambiance est ${mood(markets)} sur les marchés. La plus forte hausse revient à ${best.spoken}, ${best.changePct >= 0 ? 'en progression de' : 'qui limite ses pertes à'} ${pct(best.changePct)}, tandis que ${worst.spoken} ${worst.changePct < 0 ? `ferme la marche avec un repli de ${pct(worst.changePct)}` : `est le moins dynamique, à plus ${pct(worst.changePct)}`}.`, { type: 'overview', label: "Vue d'ensemble" });

  say('lead', `À Paris, ${move(cac)}, à ${level(cac)}. ${monthSentence(cac)}`, { type: 'line', symbol: '^FCHI', label: 'Europe' });

  const same = Math.sign(cac.changePct) === Math.sign(dax.changePct);
  say('co', `À Francfort, ${move(dax)}. ${cap(move(sx))}. ${same ? 'Paris et Francfort évoluent donc dans le même sens.' : 'Paris et Francfort divergent, signe que les investisseurs font le tri.'}`, { type: 'compare', symbols: ['^FCHI', '^GDAXI', '^STOXX50E'], title: 'Europe', label: 'Europe' });

  say('lead', `Direction Wall Street, où ${move(spx)}, à ${level(spx)}. ${monthSentence(spx)}`, { type: 'line', symbol: '^GSPC', label: 'Wall Street' });

  const techLead = ndx.changePct > dji.changePct;
  say('co', `${cap(move(ndx))}, et ${move(dji)}. ${techLead ? 'Les valeurs de croissance et la tech mènent la danse devant les valeurs plus défensives.' : 'Les valeurs défensives du Dow Jones résistent mieux que la tech.'}`, { type: 'compare', symbols: ['^GSPC', '^IXIC', '^DJI'], title: 'Wall Street', label: 'Wall Street' });

  say('lead', `En Asie, ${move(nik)} à Tokyo, et à Hong Kong, ${move(hsi)}.`, { type: 'line', symbol: '^N225', label: 'Asie' });

  const eurComment = eur.changePct > 0.1
    ? "Un euro qui se renforce, c'est un peu plus de pouvoir d'achat pour nos importations et nos voyages hors zone euro."
    : eur.changePct < -0.1
      ? "Un dollar plus fort, c'est plutôt une bonne nouvelle pour les entreprises européennes exportatrices."
      : 'La parité reste calme.';
  say('co', `Côté devises, l'euro-dollar s'établit à ${level(eur)}, ${eur.changePct >= 0 ? 'en hausse' : 'en baisse'} de ${pct(eur.changePct, 2)}. ${eurComment}`, { type: 'line', symbol: 'EURUSD=X', label: 'Taux et devises' });

  const bp = Math.round(Math.abs(tnx.change) * 100);
  const tnxWord = bp < 2 ? 'est stable' : tnx.change > 0 ? `se tend de ${bp} points de base` : `se détend de ${bp} points de base`;
  say('lead', `Sur le marché obligataire, le taux américain à 10 ans ${tnxWord}, à ${level(tnx)}. ${tnx.change > 0.02 ? 'Des taux en hausse pèsent en général sur les valeurs de croissance.' : tnx.change < -0.02 ? "Une détente des taux soutient d'ordinaire les actions." : ''}`, { type: 'line', symbol: '^TNX', label: 'Taux et devises' });

  say('co', `Pour les matières premières, ${move(brent)}, à ${level(brent)} le baril. ${cap(move(gold))}, à ${level(gold)}.`, { type: 'compare', symbols: ['BZ=F', 'GC=F', 'BTC-USD'], title: 'Matières premières', label: 'Matières premières' });

  say('lead', `Enfin, sur vingt-quatre heures, ${move(btc)}, à ${level(btc)}. ${monthSentence(btc)}`, { type: 'line', symbol: 'BTC-USD', label: 'Matières premières' });

  const tp = radar.topPick;
  say('lead', tp
    ? `Passons au radar investissement. Le signal le plus intéressant du jour concerne ${by[tp.symbol] ? by[tp.symbol].spoken : tp.name} : ${tp.title.toLowerCase()}. ${tp.text}`
    : "Passons au radar investissement. Aucun signal marquant ce matin : la patience est aussi une stratégie.", { type: 'radar', label: 'Radar invest' });

  const w = radar.warnings.slice(0, 2);
  say('co', `${w.length ? 'Côté vigilance, ' + w.map((x) => `${by[x.symbol] ? by[x.symbol].spoken : x.name} : ${x.title.toLowerCase()}`).join(' ; et ') + '.' : 'Pas d\'alerte particulière côté vigilance.'} Rappelons que ce sont des signaux techniques, pas des conseils personnalisés.`, { type: 'radar', label: 'Radar invest' });

  const intros = ['À la une ce matin : ', 'Autre sujet suivi de près : ', 'On retiendra aussi : ', 'Également dans l\'actualité : ', 'Et enfin : '];
  const items = news.slice(0, 5);
  if (items.length) {
    say('co', "Place à l'actualité économique. Nova, qu'est-ce qui fait les titres ce matin ?", { type: 'news', index: 0, label: 'Actualité' });
    items.forEach((n, i) => {
      const src = n.source && n.source !== 'Démo' ? ` Une information à lire chez ${n.source}.` : '';
      say(i % 2 === 0 ? 'lead' : 'co', `${intros[i]}${n.title.replace(/[.!?]*$/, '.')}${src}`, { type: 'news', index: i, label: 'Actualité' });
    });
  }

  say('lead', `C'est l'heure du récapitulatif : la meilleure performance du jour pour ${best.spoken}, ${best.changePct >= 0 ? 'plus' : 'moins'} ${pct(best.changePct)}, et la plus faible pour ${worst.spoken}, ${worst.changePct >= 0 ? 'plus' : 'moins'} ${pct(worst.changePct)}. Merci Atlas.`, { type: 'overview', recap: true, label: 'Récapitulatif' });
  say('co', 'Merci Nova. Excellente journée à tous, et à demain matin.', { type: 'outro', label: 'Récapitulatif' });

  return seg;
}

module.exports = { buildScript, spokenDate, num, pct, move, mood, fixGrammar, level };
