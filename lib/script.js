'use strict';
// Écriture du script du podcast : répliques de Rocket + visuel associé.

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

// Un seul animateur : Rocket, qui s'adresse à « Monsieur ».
function buildScript({ markets, news, radar, politics = [], recipe = null, tip = '', date = new Date() }) {
  const by = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  const seg = [];
  const say = (text, visual) => seg.push({ speaker: 'rocket', host: 'Rocket', text: fixGrammar(text), visual });
  const sorted = [...markets].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const cac = by['^FCHI'], dax = by['^GDAXI'], sx = by['^STOXX50E'], spx = by['^GSPC'], ndx = by['^IXIC'], dji = by['^DJI'];
  const nik = by['^N225'], hsi = by['^HSI'], eur = by['EURUSD=X'], tnx = by['^TNX'], brent = by['BZ=F'], gold = by['GC=F'], btc = by['BTC-USD'];

  say(`Bonjour Monsieur. Ici Rocket, nous sommes ${spokenDate(date)}. Voici votre morning : les Bourses européennes, Wall Street, l'Asie, les taux et les devises, les matières premières, le radar investissement, puis l'actualité économique et politique.`, { type: 'intro', label: 'Ouverture' });

  say(`Commençons par la vue d'ensemble. L'ambiance est ${mood(markets)} sur les marchés. La plus forte hausse revient à ${best.spoken}, ${best.changePct >= 0 ? 'en progression de' : 'qui limite ses pertes à'} ${pct(best.changePct)}, tandis que ${worst.spoken} ${worst.changePct < 0 ? `ferme la marche avec un repli de ${pct(worst.changePct)}` : `est le moins dynamique, à plus ${pct(worst.changePct)}`}.`, { type: 'overview', label: "Vue d'ensemble" });

  say(`À Paris, ${move(cac)}, à ${level(cac)}. ${monthSentence(cac)}`, { type: 'line', symbol: '^FCHI', label: 'Europe' });

  const same = Math.sign(cac.changePct) === Math.sign(dax.changePct);
  say(`À Francfort, ${move(dax)}. ${cap(move(sx))}. ${same ? 'Paris et Francfort évoluent donc dans le même sens.' : 'Paris et Francfort divergent, signe que les investisseurs font le tri.'}`, { type: 'compare', symbols: ['^FCHI', '^GDAXI', '^STOXX50E'], title: 'Europe', label: 'Europe' });

  const techLead = ndx.changePct > dji.changePct;
  say(`Direction Wall Street, où ${move(spx)}, à ${level(spx)}. ${cap(move(ndx))}, et ${move(dji)}. ${techLead ? 'La tech mène la danse devant les valeurs plus défensives.' : 'Les valeurs défensives du Dow Jones résistent mieux que la tech.'}`, { type: 'compare', symbols: ['^GSPC', '^IXIC', '^DJI'], title: 'Wall Street', label: 'Wall Street' });

  say(`En Asie, ${move(nik)} à Tokyo, et à Hong Kong, ${move(hsi)}.`, { type: 'line', symbol: '^N225', label: 'Asie' });

  const eurComment = eur.changePct > 0.1
    ? "Un euro qui se renforce, c'est un peu plus de pouvoir d'achat hors zone euro."
    : eur.changePct < -0.1 ? "Un dollar plus fort, c'est plutôt une bonne nouvelle pour les exportateurs européens." : 'La parité reste calme.';
  const bp = Math.round(Math.abs(tnx.change) * 100);
  const tnxWord = bp < 2 ? 'est stable' : tnx.change > 0 ? `se tend de ${bp} points de base` : `se détend de ${bp} points de base`;
  say(`Côté devises, l'euro-dollar s'établit à ${level(eur)}, ${eur.changePct >= 0 ? 'en hausse' : 'en baisse'} de ${pct(eur.changePct, 2)}. ${eurComment} Le taux américain à 10 ans ${tnxWord}, à ${level(tnx)}.`, { type: 'line', symbol: 'EURUSD=X', label: 'Taux et devises' });

  say(`Pour les matières premières, ${move(brent)}, à ${level(brent)} le baril, et ${move(gold)}, à ${level(gold)}. Enfin, sur vingt-quatre heures, ${move(btc)}, à ${level(btc)}.`, { type: 'compare', symbols: ['BZ=F', 'GC=F', 'BTC-USD'], title: 'Matières premières', label: 'Matières premières' });

  const tp = radar.topPick;
  const w = radar.warnings.slice(0, 2);
  say(`${tp ? `Au radar investissement, le signal le plus intéressant du jour concerne ${by[tp.symbol] ? by[tp.symbol].spoken : tp.name} : ${tp.title.toLowerCase()}. ${tp.text}` : 'Au radar investissement, aucun signal marquant ce matin : la patience est aussi une stratégie.'} ${w.length ? 'Vigilance sur ' + w.map((x) => `${by[x.symbol] ? by[x.symbol].spoken : x.name}, ${x.title.toLowerCase()}`).join(', et sur ') + '.' : ''} Ce sont des signaux techniques, pas des conseils personnalisés, Monsieur.`, { type: 'radar', label: 'Radar invest' });

  const intros = ['À la une ce matin : ', 'Autre sujet suivi de près : ', 'On retiendra aussi : ', 'Également dans l\'actualité : ', 'Et enfin : '];
  news.slice(0, 4).forEach((n, i) => {
    const src = n.source && n.source !== 'Démo' ? ` Une information de ${n.source}.` : '';
    say(`${i === 0 ? "Place à l'actualité économique. " : ''}${intros[i]}${n.title.replace(/[.!?]*$/, '.')}${src}`, { type: 'news', index: i, label: 'Actualité' });
  });

  if (politics.length) {
    say(`Côté politique : ${politics.slice(0, 2).map((p) => p.title.replace(/[.!?]*$/, '')).join('. Et aussi : ')}.`, { type: 'politics', index: 0, label: 'Politique' });
  }

  const extra = [];
  if (recipe) extra.push(`Pour ce soir, je vous suggère ${recipe.title.charAt(0).toLowerCase() + recipe.title.slice(1)}, prêt en ${recipe.time} minutes.`);
  if (tip) extra.push(`Et le conseil bien-être du jour : ${tip}`);
  say(`C'est l'heure du récapitulatif : la meilleure performance du jour pour ${best.spoken}, ${best.changePct >= 0 ? 'plus' : 'moins'} ${pct(best.changePct)}, et la plus faible pour ${worst.spoken}, ${worst.changePct >= 0 ? 'plus' : 'moins'} ${pct(worst.changePct)}. ${extra.join(' ')}`, { type: 'overview', recap: true, label: 'Récapitulatif' });
  say('Excellente journée, Monsieur. Rocket reste à votre disposition : dites simplement « Ok Rocket », votre demande, puis « s\'il te plaît ».', { type: 'outro', label: 'Récapitulatif' });

  return seg;
}

module.exports = { buildScript, spokenDate, num, pct, move, mood, fixGrammar, level };
