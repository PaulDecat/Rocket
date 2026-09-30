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

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), ASSISTANT: 'local', TTS_PROVIDER: 'browser', ROCKET_OFFLINE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const t = setTimeout(() => reject(new Error('Le serveur ne démarre pas :\n' + out)), 20000);
    child.stdout.on('data', (d) => { out += d; if (/Réponses :/.test(out)) { clearTimeout(t); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // Pas de micro dans le navigateur de test : on désactive « OK Nova ».
    await ctx.addInitScript(() => { try { localStorage.setItem('rocket.wake', 'off'); } catch (e) { /* ignore */ } });
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

    await test('lancement : le podcast avance, Nova et Atlas alternent, les visuels changent', async () => {
      await page.click('.theme-card[data-theme-id="clean"]');
      await page.click('#startBtn');
      await page.waitForFunction(() => document.getElementById('splash').hidden);
      const seen = new Set(), visuals = new Set();
      for (let i = 0; i < 6; i++) {
        seen.add(await page.textContent('#subSpeaker'));
        visuals.add(await page.evaluate(() => JSON.stringify(RocketApp.state.visual)));
        await page.evaluate(() => RocketApp.jump(RocketApp.state.idx + 1));
        await page.waitForTimeout(250);
      }
      assert.ok(seen.has('NOVA') && seen.has('ATLAS'), [...seen].join(','));
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
      assert.ok(/demain matin/.test(await page.textContent('#subText')));
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
      assert.ok(/RSI 14/.test(txt) && /Niveau de risque/.test(txt) && /Analyse de Nova/.test(txt));
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

    await test('question « comment va le CAC 40 ? » : réponse locale + courbe', async () => {
      await page.fill('#askInput', 'comment va le CAC 40 ?');
      await page.press('#askInput', 'Enter');
      await page.waitForFunction(() => /CAC 40 est à/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
      const v = await page.evaluate(() => RocketApp.state.visual);
      assert.deepStrictEqual(v, { type: 'line', symbol: '^FCHI' });
    });

    await test('« reprends le briefing » puis « stop »', async () => {
      await page.evaluate(() => RocketApp.ask('reprends le briefing'));
      await page.waitForFunction(() => RocketApp.state.playing, null, { timeout: 15000 });
      await page.evaluate(() => RocketApp.ask('stop'));
      await page.waitForFunction(() => !RocketApp.state.playing, null, { timeout: 8000 });
    });

    await test('question libre sans Claude : réponse de repli claire', async () => {
      await page.evaluate(() => RocketApp.ask('Montre-moi le CDS à 5 ans de la France'));
      await page.waitForFunction(() => /besoin de Claude/.test(document.getElementById('subText').textContent), null, { timeout: 8000 });
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

  await test('sécurité : /api/ask refusé (403) depuis une autre machine du réseau', async () => {
    const ip = lanIp();
    if (!ip) { console.log('    (pas d’interface réseau : test ignoré)'); return; }
    const r = await fetch(`http://${ip}:${PORT}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"question":"test"}' });
    assert.strictEqual(r.status, 403);
    const r2 = await fetch(`http://${ip}:${PORT}/api/music/open`, { method: 'POST', body: '{}' });
    assert.strictEqual(r2.status, 403);
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
  server.kill();
  console.log(`\n${n} test(s) de bout en bout réussis${failed ? `, ${failed} échec(s)` : ''}.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
