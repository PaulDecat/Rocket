'use strict';
// Tests unitaires (sans dépendance) : node tests/unit.js
const assert = require('assert');
const sources = require('../lib/sources');
const signals = require('../lib/signals');
const script = require('../lib/script');
const music = require('../lib/music');
const assistant = require('../lib/assistant');
const research = require('../lib/research');

let n = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of queue) {
    try { await fn(); n++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
  }
}

const markets = sources.INSTRUMENTS.map((i) => sources.summarize(i, sources.demoHistory(i), false));
markets.forEach((m) => { m.stats = signals.computeStats(m); });
const radar = signals.buildRadar(markets);
const briefing = { markets, radar, news: sources.demoNews() };

test('données de démo déterministes et complètes', () => {
  const a = sources.demoHistory(sources.INSTRUMENTS[0]), b = sources.demoHistory(sources.INSTRUMENTS[0]);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(markets.length, 13);
  assert.ok(markets.every((m) => m.history.length >= 200 && isFinite(m.changePct)));
});

test('RSI : bornes et cas extrêmes', () => {
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.strictEqual(signals.rsi(up), 100);
  const r = signals.rsi(markets[0].history.map((p) => p.v));
  assert.ok(r > 0 && r < 100);
});

test('SMA et volatilité', () => {
  assert.strictEqual(signals.sma([1, 2, 3, 4], 2), 3.5);
  assert.ok(signals.volatility([100, 101, 99, 102, 100, 103], 0) > 0);
});

test('radar structuré avec disclaimer', () => {
  assert.ok(Array.isArray(radar.opportunities) && Array.isArray(radar.trends) && Array.isArray(radar.warnings));
  assert.ok(/pas des conseils/.test(radar.disclaimer));
  for (const s of [...radar.opportunities, ...radar.trends, ...radar.warnings]) assert.ok(s.score <= 99 && s.conviction);
});

test('signal de survente déclenché', () => {
  const hist = Array.from({ length: 260 }, (_, i) => ({ t: i * 864e5, v: i < 240 ? 100 + i * 0.1 : 124 - (i - 240) * 2 }));
  const m = sources.summarize(sources.INSTRUMENTS[0], hist, true);
  m.stats = signals.computeStats(m);
  const sig = signals.signalsFor(m);
  assert.ok(sig.some((s) => s.title === 'Zone de survente'));
});

test('script du podcast : un seul animateur, Rocket', () => {
  const lifestyle = require('../lib/lifestyle');
  const seg = script.buildScript({ markets, news: briefing.news, radar, politics: sources.demoNews(), recipe: lifestyle.recipeOfDay(), tip: lifestyle.tipOfDay(), date: new Date(2026, 5, 1) });
  assert.ok(seg.length >= 12);
  assert.ok(/Ici Rocket/.test(seg[0].text) && /lundi 1er juin/.test(seg[0].text));
  assert.ok(seg.every((s) => s.host === 'Rocket'), 'un seul animateur');
  assert.ok(seg.every((s) => !/Nova|Atlas/.test(s.text)), 'plus de Nova ni d’Atlas');
  assert.ok(seg.some((s) => s.visual.type === 'politics'), 'segment politique');
  assert.ok(/Ok Rocket/.test(seg[seg.length - 1].text));
  assert.ok(seg.every((s) => s.visual && s.visual.type));
  assert.ok(seg.every((s) => !/\bà le\b|%|\d\s\d{3}\b/.test(s.text)), 'formes orales');
});

test('règle « Ok Rocket … s’il te plaît »', () => {
  const C = require('../public/command');
  assert.deepStrictEqual(C.parse("Ok Rocket, comment va le CAC 40, s'il te plaît"), { wake: true, complete: true, question: 'comment va le CAC 40' });
  assert.strictEqual(C.parse('okay Roquette mets du jazz s’il te plait.').question, 'mets du jazz');
  assert.deepStrictEqual(C.parse('Ok Rocket comment va le CAC'), { wake: true, complete: false, question: 'comment va le CAC' });
  assert.strictEqual(C.parse("comment va le CAC, s'il te plaît").complete, false);
  assert.strictEqual(C.parse("Nova, comment va le CAC, s'il te plaît").complete, false);
  assert.strictEqual(C.parse("Ok Rocket s'il te plaît").question, '');
});

test('planning : phrases en français', () => {
  const P = require('../lib/planning');
  const now = new Date(2026, 9, 1, 9, 0); // jeudi 1er octobre 2026
  assert.deepStrictEqual(P.parseAdd('ajoute rendez-vous chez le dentiste demain à 15h', now), { title: 'Rendez-vous chez le dentiste', date: '2026-10-02', time: '15:00' });
  assert.deepStrictEqual(P.parseAdd('note réunion avec Paul lundi à 9 heures 30', now), { title: 'Réunion avec Paul', date: '2026-10-05', time: '09:30' });
  assert.deepStrictEqual(P.parseAdd('ajoute dîner chez Julie samedi à huit heures du soir', now), { title: 'Dîner chez Julie', date: '2026-10-03', time: '20:00' });
  assert.deepStrictEqual(P.parseAdd('ajoute rendez-vous chez le médecin le 3/11 à 10h15', now), { title: 'Rendez-vous chez le médecin', date: '2026-11-03', time: '10:15' });
  assert.strictEqual(P.parseAdd('ajoute anniversaire de maman le 12 octobre', now).date, '2026-10-12');
  assert.strictEqual(P.parseAdd('mets Gims', now), null);
});

test('cuisine et coach', () => {
  const L = require('../lib/lifestyle');
  assert.ok(L.RECIPES.length >= 12);
  assert.ok(L.seasonalRecipes(new Date(2026, 9, 1)).every((r) => r.season.includes('automne') || r.season.includes('toutes')));
  assert.strictEqual(L.findRecipes('une recette avec des courgettes')[0].id, 'ratatouille');
  assert.ok(L.TIPS.length >= 15 && L.HABITS.length >= 5);
});

test('grammaire orale', () => {
  assert.strictEqual(script.fixGrammar('revient à le DAX'), 'revient au DAX');
  assert.strictEqual(script.fixGrammar('+2,5 %'), 'plus 2,5 pour cent');
});

test('musique : commandes reconnues', () => {
  const p = music.parseMusic;
  assert.deepStrictEqual(p('mets Gims'), { action: 'search', kind: 'artist', query: 'gims' });
  assert.strictEqual(p('joue la chanson Bella de Gims').kind, 'track');
  assert.strictEqual(p("lance l'album Civilisation d'Orelsan").kind, 'album');
  assert.strictEqual(p('mets la playlist Chill').query, 'chill');
  assert.strictEqual(p('mets du jazz').kind, 'playlist');
  assert.strictEqual(p('mets de la musique').action, 'play');
  assert.strictEqual(p('coupe la musique').action, 'stop');
  assert.strictEqual(p('reprends la musique').action, 'resume');
  assert.strictEqual(p('chanson suivante').action, 'next');
  assert.strictEqual(p('quelles sont mes playlists').action, 'list');
  assert.deepStrictEqual(p('mets ma playlist Sport'), { action: 'user', name: 'sport' });
  assert.deepStrictEqual(p('mets mes coups de cœur'), { action: 'user', name: 'loved' });
  assert.deepStrictEqual(p('OK Nova, mets la play-list Chill'), { action: 'search', kind: 'playlist', query: 'chill' });
});

test('musique : jamais confondue avec le briefing', () => {
  for (const q of ['lance le briefing', 'reprends le briefing', 'passe au suivant', 'mets le radar', 'stop', 'mets en pause', 'comment va le CAC 40 ?']) {
    assert.strictEqual(music.parseMusic(q), null, q);
  }
});

test('musique : playlists du profil', () => {
  const pls = [{ id: 1, title: 'Coups de cœur', loved: true }, { id: 2, title: 'Sport 🏃 2025' }, { id: 3, title: 'Chill du soir' }];
  assert.strictEqual(music.findPlaylist(pls, 'loved').id, 1);
  assert.strictEqual(music.findPlaylist(pls, 'sport').id, 2);
  assert.strictEqual(music.findPlaylist(pls, 'chil').id, 3);
});

test('assistant : intentions locales', () => {
  const d = assistant.detectIntent;
  assert.strictEqual(d('ouvre la cuisine').tab, 'cuisine');
  assert.strictEqual(d('affiche la politique').tab, 'politique');
  assert.strictEqual(d('ajoute dentiste demain à 15h').kind, 'planning-add');
  assert.strictEqual(d("qu'est-ce que j'ai demain").kind, 'planning-query');
  assert.strictEqual(d('supprime le dentiste').kind, 'planning-remove');
  assert.deepStrictEqual(d("j'ai bu deux verres d'eau"), { kind: 'coach-log', habit: 'eau', delta: 2 });
  assert.strictEqual(d('donne-moi un conseil').kind, 'coach-tip');
  assert.strictEqual(d('un conseil d’investissement').kind, 'radar');
  assert.strictEqual(d('une recette avec des courgettes').kind, 'recipe');
  assert.strictEqual(d('les sorties ciné').kind, 'cinema');
  assert.strictEqual(d("l'actu politique").kind, 'politics');
  assert.strictEqual(d('stop').action, 'stop');
  assert.strictEqual(d('tais-toi').action, 'stop');
  assert.strictEqual(d('reprends le briefing').action, 'play');
  assert.strictEqual(d('suivant').action, 'next');
  assert.strictEqual(d('quel est le gros coup du jour ?').kind, 'radar');
  assert.strictEqual(d('quelles sont les actus ?').kind, 'news');
  assert.strictEqual(d('comment va le CAC 40 ?').symbol, '^FCHI');
  assert.strictEqual(d('et le bitcoin ?').symbol, 'BTC-USD');
  assert.strictEqual(d('comment va la bourse ?').kind, 'overview');
  assert.strictEqual(d('Montre-moi le CDS à 5 ans de la France').kind, 'free');
  assert.ok(!d('comment va le CAC 40 ?').complex);
});

test('assistant : réponses locales chiffrées + visuel', () => {
  const r = assistant.localAnswer({ kind: 'asset', symbol: '^FCHI' }, briefing);
  assert.ok(/CAC 40/.test(r.answer) && /points/.test(r.answer));
  assert.deepStrictEqual(r.visual, { type: 'line', symbol: '^FCHI' });
  assert.strictEqual(assistant.localAnswer({ kind: 'radar' }, briefing).action, 'radar');
});

test('assistant : « Désolé Monsieur, je n’ai pas compris »', async () => {
  const r = await assistant.ask({ question: 'blablabla machin truc' }, briefing, () => {});
  assert.strictEqual(r.answer, "Désolé Monsieur, je n'ai pas compris.");
});

test('assistant : planning et coach à partir du contexte du navigateur', () => {
  const P = require('../lib/planning');
  const today = P.iso(new Date());
  const ctx = { planning: [{ id: 'x1', title: 'Dentiste', date: today, time: '15:00' }], coach: { eau: 3 } };
  const b = { ...briefing, cinema: [], politics: [] };
  assert.ok(/Dentiste à 15 heures/.test(assistant.lifeAnswer(assistant.detectIntent('mon planning'), b, ctx).answer));
  assert.strictEqual(assistant.lifeAnswer(assistant.detectIntent('supprime dentiste'), b, ctx).removeId, 'x1');
  assert.ok(/4 verres sur 8/.test(assistant.lifeAnswer(assistant.detectIntent("j'ai bu un verre d'eau"), b, ctx).answer));
  const add = assistant.lifeAnswer(assistant.detectIntent('ajoute courses demain à 18h'), b, ctx);
  assert.strictEqual(add.action, 'planning-add');
  assert.strictEqual(add.event.title, 'Courses');
});

test('v4 : « roquette » = « Rocket »', () => {
  const C = require('../public/command');
  assert.strictEqual(C.parse("Ok roquette, quelle heure est-il, s'il te plaît").question, 'quelle heure est-il');
  assert.strictEqual(C.parse('OK Roquettes comment va le CAC s’il te plaît').complete, true);
  assert.strictEqual(C.normalize('Ok roquette, une salade de roquette'), 'Ok Rocket, une salade de roquette');
});

test('v4 : culture générale locale (heure, calculs, blagues)', async () => {
  const K = require('../lib/knowledge');
  const cases = { 'combien font 12 fois 7': 'Cela fait 84', 'calcule 15 pour cent de 80': 'Cela fait 12', 'combien font quatre-vingt-dix-sept moins 7': 'Cela fait 90',
    'racine carrée de 144': 'Cela fait 12', 'combien font 2 plus 2 fois 3': 'Cela fait 8', 'quelle heure est-il': 'Il est', 'quel jour sommes-nous': 'Nous sommes le' };
  for (const [q, want] of Object.entries(cases)) assert.ok(String(await K.answer(q)).startsWith(want), q);
  assert.strictEqual(K.evaluate('2+'), null);
  assert.ok(/\?/.test(await K.answer('raconte une blague')));
});

test('v4 : plusieurs questions dans une phrase, matinale sur demande', async () => {
  assert.deepStrictEqual(assistant.splitQuestions('quelle heure est-il et comment va le CAC 40'), ['quelle heure est-il', 'comment va le CAC 40']);
  assert.deepStrictEqual(assistant.splitQuestions('le CAC 40 et le DAX'), ['le CAC 40 et le DAX']);
  const r = await assistant.ask({ question: 'quelle heure est-il et combien font 2 plus 3', context: {} }, briefing, () => {});
  assert.ok(/^Il est .* Cela fait 5/.test(r.answer), r.answer);
  const add = await assistant.ask({ question: 'ajoute dentiste demain à 15h et ouvre la cuisine', context: {} }, { ...briefing, cinema: [], politics: [] }, () => {});
  assert.deepStrictEqual(add.actions.map((a) => a.action), ['planning-add', 'tab']);
  for (const q of ['lance la matinale', 'mets la matinale', 'joue la matinade', 'lance le briefing']) {
    assert.deepStrictEqual(assistant.detectIntent(q), { kind: 'action', action: 'play', from: 'start' }, q);
  }
  assert.strictEqual(assistant.detectIntent('reprends la matinale').from, 'resume');
  assert.strictEqual(require('../lib/music').parseMusic('lance la matinale'), null);
  assert.notStrictEqual(assistant.detectIntent('qui est le premier ministre').kind, 'politics');
});

test('graphiques Claude : jamais sans source', () => {
  assert.strictEqual(research.pointsVisual({ series: [{ name: 'x', points: [{ x: '2024', y: 1 }, { x: '2025', y: 2 }] }] }), null);
  const v = research.pointsVisual({ title: 'CDS', source: 'Test', series: [{ name: 'CDS', points: [{ x: '2024-01-01', y: 30 }, { x: '2025-01-01', y: 35 }] }] });
  assert.strictEqual(v.type, 'custom');
  assert.strictEqual(typeof v.series[0].points[0].x, 'number');
  assert.strictEqual(research.figureVisual({ label: 'CDS 5 ans', value: '38', unit: 'pb' }).type, 'figure');
});

test('flux RSS : parsing Google News', () => {
  const xml = '<rss><channel><item><title>La Bourse de Paris monte fortement ce matin - Les Echos</title><link>https://x.fr/a</link><pubDate>Mon, 01 Jun 2026 07:00:00 GMT</pubDate></item></channel></rss>';
  const it = sources.parseRss(xml, 'https://news.google.com/rss/search?q=x');
  assert.strictEqual(it[0].title, 'La Bourse de Paris monte fortement ce matin');
  assert.strictEqual(it[0].source, 'Les Echos');
  assert.strictEqual(sources.decodeEntities('L&#39;or &amp; l&apos;argent'), "L'or & l'argent");
});

runAll().then(() => console.log(`\n${n} test(s) unitaires réussis${process.exitCode ? ' — ÉCHECS ci-dessus' : ''}.`));
