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
function test(name, fn) {
  try { fn(); n++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
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

test('script du podcast : déroulé complet et alternance', () => {
  const seg = script.buildScript({ markets, news: briefing.news, radar, date: new Date(2026, 5, 1) });
  assert.ok(seg.length >= 20);
  assert.ok(/lundi 1er juin/.test(seg[0].text));
  assert.strictEqual(seg[0].host, 'Nova');
  assert.strictEqual(seg[1].host, 'Atlas');
  assert.strictEqual(seg[seg.length - 1].text, 'Merci Nova. Excellente journée à tous, et à demain matin.');
  assert.ok(seg.every((s) => s.visual && s.visual.type));
  assert.ok(seg.every((s) => !/\bà le\b|%|\d\s\d{3}\b/.test(s.text)), 'formes orales');
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

console.log(`\n${n} test(s) unitaires réussis${process.exitCode ? ' — ÉCHECS ci-dessus' : ''}.`);
