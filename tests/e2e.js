'use strict';
// Tests de bout en bout (Playwright). Lancement : node tests/e2e.js
// Playwright n'est pas une dépendance de Rocket : s'il est absent, les tests sont ignorés.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const assert = require('assert');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); } catch (e2) {
    console.log('Playwright non installé : tests de bout en bout ignorés (npm install -g playwright pour les lancer).');
    process.exit(0);
  }
}

const PORT = 3000 + Math.floor(Math.random() * 500) + 200;
const BASE = `http://localhost:${PORT}`;
let n = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); n++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
}

function startServer(port = PORT, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port), ASSISTANT: 'local', TTS_PROVIDER: 'browser', ROCKET_OFFLINE: '1', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const t = setTimeout(() => reject(new Error('Le serveur ne démarre pas :\n' + out)), 20000);
    child.stdout.on('data', (d) => { out += d; if (/Réponses :/.test(out)) { clearTimeout(t); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}

// Fichiers WAV servant de faux micro à Chromium : silence, ou « phrases » (bouffées de son).
function writeWav(file, seconds, burst) {
  const rate = 48000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // 1,5 s de « voix » (son modulé) puis 1,5 s de silence.
    const on = burst && (t % 3) < 1.5;
    seed = (seed * 16807) % 2147483647;
    const v = on ? 0.35 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) + 0.05 * (seed / 2147483647 - 0.5) : 0;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  require('fs').writeFileSync(file, buf);
  return file;
}
const SILENCE_WAV = writeWav(path.join(os.tmpdir(), 'rocket-silence.wav'), 4, false);
const SPEECH_WAV = writeWav(path.join(os.tmpdir(), 'rocket-speech.wav'), 6, true);
const micArgs = (wav) => ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`];

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ args: micArgs(SILENCE_WAV) });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // Pas de micro dans le navigateur de test : on désactive « OK Nova ».
    // Faux micro : on « dit » une phrase avec window.__say(texte).
    await ctx.addInitScript(() => {
      window.webkitSpeechRecognition = class {
        constructor() { window.__sr = this; }
        start() { this.running = true; setTimeout(() => this.onstart && this.onstart(), 0); }
        stop() { this.running = false; setTimeout(() => this.onend && this.onend(), 0); }
      };
      window.SpeechRecognition = window.webkitSpeechRecognition;
      window.__say = (text) => {
        const res = [{ transcript: text }];
        res.isFinal = true;
        window.__sr.onresult({ resultIndex: 0, results: [res] });
      };
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await test('la page charge en moins de 2 s', async () => {
      const t0 = Date.now();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#startBtn');
      assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
    });

    await test('écran de démarrage : 4 styles, mode DÉMO hors ligne', async () => {
      assert.strictEqual(await page.locator('.theme-card').count(), 4);
      await page.waitForFunction(() => /prêt/.test(document.getElementById('splashStatus').textContent));
      assert.strictEqual((await page.textContent('#livePill')).trim(), 'DÉMO');
      assert.ok(/démo/.test(await page.textContent('#splashStatus')));
    });

    await test('démarrage : la matinale ne se lance pas toute seule', async () => {
      await page.click('.theme-card[data-theme-id="clean"]');
      await page.click('#startBtn');
      await page.waitForFunction(() => document.getElementById('splash').hidden);
      await page.waitForTimeout(1500);
      assert.strictEqual(await page.evaluate(() => RocketApp.state.playing), false);
      await page.waitForFunction(() => /lance la matinale/.test(document.getElementById('subText').textContent), null, { timeout: 15000 });
    });

    await test('« Ok Rocket, lance la matinale, s’il te plaît » : Rocket seul, les visuels changent', async () => {
      await page.fill('#askInput', "Ok roquette, lance la matinale, s'il te plaît");
      await page.press('#askInput', 'Enter');
      await page.waitForFunction(() => RocketApp.state.playing, null, { timeout: 15000 });
      const seen = new Set(), visuals = new Set();
      for (let i = 0; i < 6; i++) {
        seen.add(await page.textContent('#subSpeaker'));
        visuals.add(await page.evaluate(() => JSON.stringify(RocketApp.state.visual)));
        await page.evaluate(() => RocketApp.jump(RocketApp.state.idx + 1));
        await page.waitForTimeout(250);
      }
      assert.deepStrictEqual([...seen], ['ROCKET']);
      assert.strictEqual(await page.locator('#badgeLead, #badgeCo').count(), 0, 'plus de Nova ni d’Atlas');
      assert.ok(visuals.size >= 4, 'visuels : ' + visuals.size);
      const idx = await page.evaluate(() => RocketApp.state.idx);
      assert.ok(idx >= 5);
      const cur = await page.locator('#chapters li.current').count();
      assert.strictEqual(cur, 1);
    });

    await test('sous-titres synchronisés (mot courant surligné)', async () => {
      await page.waitForFunction(() => document.querySelector('#subText .w-done, #subText .w-cur'), null, { timeout: 8000 });
    });

    await test('lecture complète jusqu’à la fin', async () => {
      const len = await page.evaluate(() => RocketApp.state.script.length);
      await page.evaluate((len) => RocketApp.jump(len - 1), len);
      await page.waitForFunction(() => !RocketApp.state.playing, null, { timeout: 20000 });
      assert.ok(/Excellente journée, Monsieur/.test(await page.textContent('#subText')));
    });

    await test('fiche détaillée : 6 périodes, RSI, risque, Échap ferme', async () => {
      await page.click('.market-row[data-sym="^FCHI"]');
      await page.waitForSelector('#periodTabs:not([hidden])');
      assert.strictEqual(await page.locator('#periodTabs button').count(), 6);
      for (const p of ['1J', '5J', '3M', '6M', '1A']) {
        await page.click(`#periodTabs [data-period="${p}"]`);
        await page.waitForTimeout(150);
      }
      const txt = await page.textContent('#detailStats');
      assert.ok(/RSI 14/.test(txt) && /Niveau de risque/.test(txt) && /Analyse de Rocket/.test(txt));
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#periodTabs').isHidden());
    });

    await test('bandeau : clic sur un marché ouvre la fiche', async () => {
      await page.evaluate(() => document.querySelector('.ticker-item[data-sym="BTC-USD"]').click());
      await page.waitForFunction(() => RocketApp.state.detail && RocketApp.state.detail.symbol === 'BTC-USD');
      await page.click('#stageClose');
    });

    await test('onglet Radar : trois colonnes + le coup à surveiller', async () => {
      await page.click('.tab[data-view="radar"]');
      await page.waitForSelector('.radar-view');
      assert.strictEqual(await page.locator('.radar-col').count(), 3);
      assert.ok(/LE COUP À SURVEILLER/.test(await page.textContent('.radar-hero')));
      assert.ok(/pas des conseils/.test(await page.textContent('.disclaimer')));
      await page.click('.tab[data-view="briefing"]');
    });

    const sub = () => page.textContent('#subText');
    const typeCommand = async (text) => { await page.fill('#askInput', text); await page.press('#askInput', 'Enter'); };

    await test('règle : sans « Ok Rocket … s’il te plaît », rien n’est exécuté', async () => {
      await typeCommand('comment va le CAC 40 ?');
      assert.ok(/Commencez par « Ok Rocket »/.test(await sub()));
      await typeCommand('Ok Rocket, comment va le CAC 40');
      assert.ok(/Terminez votre demande par « s'il te plaît »/.test(await sub()));
      assert.strictEqual(await page.inputValue('#askInput'), 'Ok Rocket, comment va le CAC 40', 'la demande reste à compléter');
    });

    await test('« Ok Rocket, comment va le CAC 40, s’il te plaît » : réponse + courbe', async () => {
      await typeCommand("Ok Rocket, comment va le CAC 40, s'il te plaît");
      await page.waitForFunction(() => RocketApp.state.history.some((h) => /CAC 40 est à/.test(h.a)), null, { timeout: 8000 });
      assert.deepStrictEqual(await page.evaluate(() => RocketApp.state.visual), { type: 'line', symbol: '^FCHI' });
    });

    await test('demande incomprise : « Désolé Monsieur, je n’ai pas compris »', async () => {
      await typeCommand("Ok Rocket, blablabla machin truc, s'il te plaît");
      await page.waitForFunction(() => /Désolé Monsieur, je n'ai pas compris/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      await typeCommand("Ok Rocket s'il te plaît");
      await page.waitForFunction(() => /Désolé Monsieur, je n'ai pas compris/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
    });

    await test('« reprends le briefing » puis « stop »', async () => {
      await page.evaluate(() => RocketApp.submit("Ok Rocket, reprends le briefing, s'il te plaît"));
      await page.waitForFunction(() => RocketApp.state.playing, null, { timeout: 15000 });
      await page.evaluate(() => RocketApp.submit("Ok Rocket, stop, s'il te plaît"));
      await page.waitForFunction(() => !RocketApp.state.playing, null, { timeout: 8000 });
    });

    await test('bouton « Parler » : change de couleur quand il est appuyé', async () => {
      const color = () => page.evaluate(() => getComputedStyle(document.getElementById('talkBtn')).backgroundColor);
      const before = await color();
      await page.click('#talkBtn');
      await page.waitForFunction(() => document.getElementById('talkBtn').classList.contains('pressed'));
      await page.waitForTimeout(300); // fin de la transition de couleur
      assert.notStrictEqual(await color(), before);
      assert.strictEqual(await page.getAttribute('#talkBtn', 'aria-pressed'), 'true');
      await page.click('#talkBtn'); // second appui : annule
      await page.waitForFunction(() => !document.getElementById('talkBtn').classList.contains('pressed'));
    });

    await test('bouton « Maintenir » : garde « Parler » enfoncé, puis le relâche', async () => {
      await page.click('#lockBtn');
      const st = () => page.evaluate(() => ({ talk: document.getElementById('talkBtn').classList.contains('pressed'), lock: document.getElementById('lockBtn').classList.contains('pressed') }));
      assert.deepStrictEqual(await st(), { talk: true, lock: true });
      await page.click('#talkBtn'); // « Parler » reste enfoncé tant que « Maintenir » est actif
      assert.deepStrictEqual(await st(), { talk: true, lock: true });
      await page.click('#lockBtn');
      assert.deepStrictEqual(await st(), { talk: false, lock: false });
    });

    await test('voix : plusieurs questions à la suite, « roquette » compris comme « Rocket »', async () => {
      await page.click('#talkBtn');
      await page.evaluate(() => window.__say("Ok roquette, ouvre la cuisine, s'il te plaît"));
      await page.waitForFunction(() => RocketApp.state.view === 'cuisine', null, { timeout: 8000 });
      // Après la réponse, Rocket réécoute tout seul pour la question suivante.
      await page.waitForFunction(() => document.getElementById('talkBtn').classList.contains('pressed') && /Une autre question/.test(document.getElementById('subText').textContent), null, { timeout: 15000 });
      await page.evaluate(() => window.__say("Ok Rocket, combien font 12 fois 7, s'il te plaît"));
      await page.waitForFunction(() => RocketApp.state.history.some((h) => /Cela fait 84/.test(h.a)), null, { timeout: 15000 });
      await page.waitForFunction(() => document.getElementById('talkBtn').classList.contains('pressed'), null, { timeout: 15000 });
      await page.evaluate(() => window.__say("Ok Rocket, ouvre le coach, s'il te plaît"));
      await page.waitForFunction(() => RocketApp.state.view === 'coach', null, { timeout: 15000 });
      // Sans nouvelle question, le bouton revient à son état initial.
      await page.waitForFunction(() => !document.getElementById('talkBtn').classList.contains('pressed'), null, { timeout: 20000 });
    });

    await test('plusieurs questions dans une même phrase + questions générales', async () => {
      await page.fill('#askInput', "Ok Rocket, quelle heure est-il et comment va le CAC 40, s'il te plaît");
      await page.press('#askInput', 'Enter');
      await page.waitForFunction(() => RocketApp.state.history.some((h) => /Il est \d+ heure/.test(h.a) && /CAC 40 est à/.test(h.a)), null, { timeout: 15000 });
      await page.fill('#askInput', "Ok Rocket, calcule 15 pour cent de 80, s'il te plaît");
      await page.press('#askInput', 'Enter');
      await page.waitForFunction(() => /Cela fait 12/.test(document.getElementById('subText').textContent), null, { timeout: 15000 });
      await page.fill('#askInput', "Ok Rocket, raconte une blague, s'il te plaît");
      await page.press('#askInput', 'Enter');
      await page.waitForFunction(() => /\?/.test(document.getElementById('subText').textContent), null, { timeout: 15000 });
    });

    await test('questions envoyées rapidement : aucune n’est perdue', async () => {
      await page.evaluate(() => { RocketApp.ask('quelle heure est-il'); RocketApp.ask('combien font 2 plus 3'); });
      await page.waitForFunction(() => /Cela fait 5/.test(document.getElementById('subText').textContent), null, { timeout: 20000 });
    });

    await test('voix en écoute continue : seules les phrases « Ok Rocket … s’il te plaît » sont exécutées', async () => {
      await page.waitForFunction(() => !RocketApp.state.asking && !Listen.capturing, null, { timeout: 20000 });
      await page.click('#lockBtn');
      await page.evaluate(() => window.__say('comment va le bitcoin'));
      await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => RocketApp.state.asking), false);
      await page.evaluate(() => window.__say('Ok Rocket, comment va le bitcoin'));
      await page.evaluate(() => window.__say("s'il te plaît"));
      await page.waitForFunction(() => RocketApp.state.history.some((h) => /bitcoin est à/.test(h.a)), null, { timeout: 8000 });
      assert.ok(await page.evaluate(() => document.getElementById('talkBtn').classList.contains('pressed')), '« Parler » reste enfoncé');
      await page.click('#lockBtn');
      await page.click('.tab[data-view="briefing"]');
    });

    await test('micro : l’indicateur de niveau est présent sur « Parler »', async () => {
      assert.strictEqual(await page.locator('#talkBtn .talk-meter').count(), 1);
    });

    await test('mini-onglets Bourse / Politique', async () => {
      await page.click('.mini-tab[data-mini="politique"]');
      assert.ok(await page.locator('#panePolitique').isVisible());
      assert.ok(await page.locator('#paneBourse').isHidden());
      assert.ok((await page.locator('#politicsList li').count()) >= 3);
      await page.click('#politicsList [data-pol="0"]');
      assert.strictEqual(await page.evaluate(() => RocketApp.state.visual.type), 'politics');
      await page.click('.mini-tab[data-mini="bourse"]');
      assert.ok(await page.locator('#paneBourse').isVisible());
    });

    await test('onglets Cuisine, Ciné, Coach, Planning', async () => {
      await page.click('.tab[data-view="cuisine"]');
      await page.waitForSelector('.recipe h4');
      const t1 = await page.textContent('.recipe h4');
      await page.click('[data-act="random-recipe"]');
      assert.notStrictEqual(await page.textContent('.recipe h4'), t1);
      await page.click('.tab[data-view="cine"]');
      assert.ok((await page.locator('.page-cine .card').count()) >= 3);
      await page.click('.tab[data-view="coach"]');
      await page.click('[data-habit="eau"][data-d="1"]');
      await page.click('[data-habit="eau"][data-d="1"]');
      assert.ok(/2\/8/.test(await page.textContent('.habits')));
      await page.click('.tab[data-view="planning"]');
      await page.fill('.plan-form input[name="title"]', 'Réunion test');
      await page.fill('.plan-form input[name="time"]', '23:59');
      await page.click('.plan-form button[type="submit"]');
      assert.ok(/Réunion test/.test(await page.textContent('.plan-days')));
      assert.strictEqual((await page.textContent('#planningBadge')).trim(), '1');
    });

    await test('commandes vocales du planning, du coach et de la cuisine', async () => {
      await typeCommand("Ok Rocket, ajoute dentiste demain à 15h, s'il te plaît");
      await page.waitForFunction(() => /C'est noté, Monsieur : Dentiste, demain à 15 heures/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      assert.strictEqual(await page.evaluate(() => RocketApp.state.view), 'planning');
      assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rocket.planning')).some((e) => e.title === 'Dentiste' && e.time === '15:00')));
      await typeCommand("Ok Rocket, qu'est-ce que j'ai demain, s'il te plaît");
      await page.waitForFunction(() => /Dentiste à 15 heures/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      await typeCommand("Ok Rocket, supprime le dentiste, s'il te plaît");
      await page.waitForFunction(() => /J'ai supprimé Dentiste/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      await typeCommand("Ok Rocket, j'ai bu un verre d'eau, s'il te plaît");
      await page.waitForFunction(() => /3 verres sur 8/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      assert.strictEqual(await page.evaluate(() => RocketApp.state.view), 'coach');
      await typeCommand("Ok Rocket, une recette avec des courgettes, s'il te plaît");
      await page.waitForFunction(() => /Ratatouille/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      assert.strictEqual(await page.textContent('.recipe h4'), 'Ratatouille provençale');
      await typeCommand("Ok Rocket, affiche la politique, s'il te plaît");
      await page.waitForFunction(() => !document.getElementById('panePolitique').hidden, null, { timeout: 8000 });
      await page.click('.mini-tab[data-mini="bourse"]');
    });

    await test('rappel vocal du planning à l’heure du rendez-vous', async () => {
      await page.evaluate(() => {
        const now = new Date();
        const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const list = JSON.parse(localStorage.getItem('rocket.planning'));
        list.push({ id: 'r1', title: 'Appeler le garage', date: now.toLocaleDateString('sv-SE'), time: hm });
        localStorage.setItem('rocket.planning', JSON.stringify(list));
        RocketApp.checkReminders(now);
      });
      await page.waitForFunction(() => /Monsieur, rappel : Appeler le garage/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      await page.click('.tab[data-view="briefing"]');
    });

    await test('les 4 thèmes s’appliquent et sont mémorisés', async () => {
      for (const t of ['light', 'terminal', 'jarvis', 'clean']) {
        await page.click('#styleBtn');
        await page.click(`#styleMenu [data-theme-id="${t}"]`);
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), t);
        assert.ok(bg);
      }
      await page.evaluate(() => Theme.apply('terminal'));
      await page.reload();
      assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'terminal');
      await page.evaluate(() => Theme.apply('clean'));
    });

    await test('performance : < 30 ms de JS/style/layout par seconde pendant la lecture, un seul rAF', async () => {
      await page.click('#startBtn');
      await page.waitForFunction(() => document.getElementById('splash').hidden);
      // Répliques de durée réaliste (le navigateur de test n'a pas de voix).
      await page.evaluate(() => { Voice.speak = () => new Promise((r) => setTimeout(() => r(true), 8000)); RocketApp.jump(3); });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.waitForTimeout(1500);
      const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const m0 = await get();
      const rafCount = await page.evaluate(() => new Promise((res) => {
        let pending = 0; const orig = window.requestAnimationFrame; let max = 0;
        window.requestAnimationFrame = (cb) => { pending++; max = Math.max(max, pending); return orig((t) => { pending--; cb(t); }); };
        setTimeout(() => { window.requestAnimationFrame = orig; res(max); }, 3000);
      }));
      const m1 = await get();
      const d = (k) => ((m1[k] - m0[k]) * 1000) / 3;
      const msPerSec = d('ScriptDuration') + d('LayoutDuration') + d('RecalcStyleDuration');
      console.log(`    (JS+style+layout ${msPerSec.toFixed(1)} ms/s ; total avec rendu logiciel headless ${d('TaskDuration').toFixed(1)} ms/s ; ${rafCount} rAF simultanés max)`);
      assert.ok(msPerSec < 30, `${msPerSec.toFixed(1)} ms/s`);
      assert.ok(rafCount <= 2, `rAF simultanés : ${rafCount}`);
    });

    await ctx.close();

    await test('téléphone (390 px) : une colonne, aucun débordement', async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const p = await m.newPage();
      await p.goto(BASE);
      await p.waitForFunction(() => /prêt/.test(document.getElementById('splashStatus').textContent));
      await p.click('#startBtn');
      await p.waitForTimeout(800);
      for (const v of ['briefing', 'radar']) {
        await p.click(`.tab[data-view="${v}"]`);
        await p.waitForTimeout(300);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 0, `débordement de ${over}px (${v})`);
      }
      const small = await p.evaluate(() => [...document.querySelectorAll('.ctrl, .icon-btn, .tab, .market-row, .wake-btn')]
        .filter((e) => e.offsetParent && (e.getBoundingClientRect().height < 36)).map((e) => e.id || e.className));
      assert.deepStrictEqual(small, []);
      await m.close();
    });
  } finally {
    await browser.close();
  }

  // ---------- Micro réel simulé (bouffées de son) : moteur local et bascule automatique ----------
  const sb = await chromium.launch({ args: micArgs(SPEECH_WAV) });
  try {
    const OPERA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0 (Edition Yx GX)';
    const fakeWhisper = (phrase) => (p) => p.addInitScript((t) => {
      window.__sttCalls = 0;
      // La première phrase est la commande ; ensuite, le faux micro ne « dit » plus rien de compréhensible.
      window.__STT_FAKE = (audio) => { window.__sttCalls++; if (window.__sttCalls === 1) window.__lastAudioLen = audio.length; return window.__sttCalls === 1 ? t : ''; };
    }, phrase);
    const mutedSR = () => (ctx) => ctx.addInitScript(() => {
      // API présente mais muette, comme dans Opera GX.
      window.webkitSpeechRecognition = class { start() { setTimeout(() => this.onstart && this.onstart(), 0); } stop() { setTimeout(() => this.onend && this.onend(), 0); } };
      window.SpeechRecognition = window.webkitSpeechRecognition;
    });
    const launch = async (ua, phrase) => {
      const c = await sb.newContext({ viewport: { width: 1280, height: 860 }, userAgent: ua });
      await mutedSR()(c);
      const p = await c.newPage();
      await fakeWhisper(phrase)(p);
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(BASE);
      await p.waitForFunction(() => /prêt/.test(document.getElementById('splashStatus').textContent));
      await p.click('#startBtn');
      await p.waitForFunction(() => document.getElementById('splash').hidden);
      await p.evaluate(() => RocketApp.stopPlayback());
      return { c, p };
    };

    await test('Opera GX : « Parler » utilise le moteur local, le micro capte et la commande s’exécute', async () => {
      const { c, p } = await launch(OPERA_UA, "Ok Rocket, ouvre le coach, s'il te plaît");
      assert.strictEqual(await p.evaluate(() => Listen.engine), 'local');
      await p.click('#talkBtn');
      await p.waitForFunction(() => parseFloat(getComputedStyle(document.getElementById('talkBtn')).getPropertyValue('--lvl')) > 0.05, null, { timeout: 8000 });
      await p.waitForFunction(() => RocketApp.state.view === 'coach', null, { timeout: 15000 });
      const len = await p.evaluate(() => window.__lastAudioLen);
      assert.ok(len > 16000 * 0.8 && len < 16000 * 4, `durée transmise : ${len / 16000} s`);
      // Rocket réécoute pour une autre question, puis relâche le bouton faute de demande.
      await p.waitForFunction(() => !document.getElementById('talkBtn').classList.contains('pressed'), null, { timeout: 30000 });
      await c.close();
    });

    await test('Opera GX : écoute continue avec « Maintenir »', async () => {
      const { c, p } = await launch(OPERA_UA, "Ok Rocket, ouvre la cuisine, s'il te plaît");
      await p.click('#lockBtn');
      await p.waitForFunction(() => RocketApp.state.view === 'cuisine', null, { timeout: 15000 });
      assert.ok(await p.evaluate(() => document.getElementById('talkBtn').classList.contains('pressed')));
      await p.click('#lockBtn');
      assert.ok(!(await p.evaluate(() => document.getElementById('talkBtn').classList.contains('pressed'))));
      await c.close();
    });

    await test('Chrome muet : bascule automatique sur le moteur local sans répéter la phrase', async () => {
      const { c, p } = await launch(undefined, "Ok Rocket, ouvre le planning, s'il te plaît");
      assert.strictEqual(await p.evaluate(() => Listen.engine), 'web');
      await p.click('#talkBtn');
      await p.waitForFunction(() => RocketApp.state.view === 'planning', null, { timeout: 20000 });
      await c.close();
    });

    await test('micro refusé : message clair', async () => {
      const c = await sb.newContext({ viewport: { width: 1280, height: 860 } });
      const p = await c.newPage();
      await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('refus'), { name: 'NotAllowedError' })); });
      await p.goto(BASE);
      await p.waitForFunction(() => /prêt/.test(document.getElementById('splashStatus').textContent));
      await p.click('#startBtn');
      await p.evaluate(() => RocketApp.stopPlayback());
      await p.click('#talkBtn');
      await p.waitForFunction(() => /micro est bloqué/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      await c.close();
    });
  } finally {
    await sb.close();
  }

  await test('sécurité : /api/ask refusé (403) depuis une autre machine du réseau', async () => {
    const ip = lanIp();
    if (!ip) { console.log('    (pas d’interface réseau : test ignoré)'); return; }
    const r = await fetch(`http://${ip}:${PORT}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"question":"test"}' });
    assert.strictEqual(r.status, 403);
    const r2 = await fetch(`http://${ip}:${PORT}/api/music/open`, { method: 'POST', body: '{}' });
    assert.strictEqual(r2.status, 403);
  });

  await test('iPhone / Siri : réponse avec la clé, refus sans clé, planning transmis au navigateur', async () => {
    const ip = lanIp();
    const key = require('fs').readFileSync(path.join(__dirname, '..', '.rocket-key'), 'utf8').trim();
    const setup = await (await fetch(`${BASE}/api/siri-setup`)).json();
    assert.strictEqual(setup.key, key);
    if (!ip) { console.log('    (pas d’interface réseau : partie Wi-Fi ignorée)'); return; }
    const url = `http://${ip}:${PORT}/api/siri`;
    assert.strictEqual((await fetch(url, { method: 'POST', body: '{"question":"quelle heure est-il"}' })).status, 403);
    assert.strictEqual((await fetch(`http://${ip}:${PORT}/api/siri-setup`)).status, 403);
    const ask = (question) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rocket-Key': key }, body: JSON.stringify({ question }) });
    const r = await ask('Ok Rocket, combien font 12 fois 7, s’il te plaît');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await r.text(), 'Cela fait 84, Monsieur.');
    const add = await (await ask('ajoute dentiste demain à 15h')).text();
    assert.ok(/C'est noté, Monsieur : Dentiste, demain à 15 heures/.test(add), add);
    const pending = await (await fetch(`${BASE}/api/pending`)).json();
    assert.strictEqual(pending.actions[0].event.title, 'Dentiste');
    assert.strictEqual((await fetch(`http://${ip}:${PORT}/api/pending`)).status, 403);
  });

  await test('sécurité : validation des entrées et chemins', async () => {
    assert.strictEqual((await fetch(`${BASE}/api/music/open`, { method: 'POST', body: '{"kind":"x","id":"1;rm"}' })).status, 400);
    assert.strictEqual((await fetch(`${BASE}/api/intraday?symbol=../../etc`)).status, 400);
    assert.notStrictEqual((await fetch(`${BASE}/..%2f..%2fserver.js`)).status, 200);
    const cfg = await fetch(`${BASE}/api/config`);
    assert.strictEqual(cfg.headers.get('cache-control'), 'no-store');
    assert.strictEqual((await fetch(`${BASE}/app.js`)).headers.get('cache-control'), 'no-cache');
  });

  if (errors.length) { failed++; console.error('  ✗ erreurs JavaScript dans la page :\n    ' + errors.join('\n    ')); }
  // ---------- v5 : réponse en flux (faux Claude lent) ----------
  const FAST_PORT = PORT + 1;
  const fastServer = await startServer(FAST_PORT, { ROCKET_FAKE_CLAUDE: '1' });
  const fb = await chromium.launch({ args: micArgs(SILENCE_WAV) });
  try {
    await test('rapidité : Rocket commence à parler avant la fin de la réponse de Claude', async () => {
      const c = await fb.newContext({ viewport: { width: 1280, height: 860 } });
      const p = await c.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(`http://localhost:${FAST_PORT}`);
      await p.waitForFunction(() => /prêt/.test(document.getElementById('splashStatus').textContent));
      await p.click('#startBtn');
      await p.waitForFunction(() => document.getElementById('splash').hidden);
      // On remplace la voix par une voix factice qui note l'ordre des phrases.
      await p.evaluate(() => {
        window.__spoken = [];
        Voice.speak = (t, cb) => { window.__spoken.push({ t, at: performance.now() }); return new Promise((r) => setTimeout(() => { cb && cb(1); r(true); }, 400)); };
      });
      const t0 = await p.evaluate(() => performance.now());
      await p.fill('#askInput', "Ok Rocket, pourquoi le ciel est bleu et quelle heure est-il, s'il te plaît");
      await p.press('#askInput', 'Enter');
      // La 1re phrase est dite alors que la réponse complète n'est pas encore arrivée.
      await p.waitForFunction(() => window.__spoken.some((x) => /première phrase/.test(x.t)), null, { timeout: 5000 });
      const st = await p.evaluate(() => ({ asking: RocketApp.state.asking, at: window.__spoken[0].at }));
      assert.ok(st.asking, 'la réponse était encore en cours');
      console.log(`    (première phrase dite après ${((st.at - t0) / 1000).toFixed(2)} s ; réponse complète après ~7,5 s)`);
      await p.waitForFunction(() => !RocketApp.state.asking && window.__spoken.some((x) => /Il est \d+ heure/.test(x.t)), null, { timeout: 20000 });
      const order = await p.evaluate(() => window.__spoken.map((x) => x.t));
      assert.deepStrictEqual(order.length, 4, order.join(' | '));
      assert.ok(/première/.test(order[0]) && /deuxième/.test(order[1]) && /troisième/.test(order[2]) && /Il est/.test(order[3]), order.join(' | '));
      assert.ok(!order.some((x) => /VISUEL/.test(x)), 'la consigne de graphique n’est jamais lue');
      assert.strictEqual(await p.evaluate(() => RocketApp.state.visual && RocketApp.state.visual.type), 'figure');
      await c.close();
    });
  } finally {
    await fb.close();
    fastServer.kill();
  }

  server.kill();
  console.log(`\n${n} test(s) de bout en bout réussis${failed ? `, ${failed} échec(s)` : ''}.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
