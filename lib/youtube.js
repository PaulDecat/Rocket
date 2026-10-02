'use strict';
// YouTube piloté par Rocket : une fenêtre Edge/Chrome dédiée, réutilisée à chaque demande.
// Rocket ouvre YouTube, accepte les conditions (cookies), cherche la vidéo, la lance,
// et reste sur le même onglet pour les demandes suivantes.

const fs = require('fs');
const path = require('path');

const BASE = (process.env.ROCKET_YT_BASE || 'https://www.youtube.com').replace(/\/$/, '');
const PROFILE = path.join(__dirname, '..', '.rocket-youtube'); // profil séparé : les conditions acceptées y restent

let ctx = null, page = null, launching = null, lastTitle = '';
let chain = Promise.resolve(); // une seule opération à la fois

function serial(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

// Navigateur à piloter : Chrome si installé, sinon Edge (présent sur tous les Windows récents).
function findBrowser() {
  if (process.env.ROCKET_YT_BROWSER) return process.env.ROCKET_YT_BROWSER;
  const env = process.env;
  const candidates = process.platform === 'win32'
    ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap((d) => [
      path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ])
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((f) => { try { return fs.existsSync(f); } catch (e) { return false; } }) || null;
}

async function ensurePage() {
  if (page && !page.isClosed()) return page;
  if (!ctx) {
    if (!launching) {
      launching = (async () => {
        const exe = findBrowser();
        if (!exe) throw new Error('Chrome ou Edge introuvable sur cet ordinateur.');
        const { chromium } = require('playwright-core');
        const c = await chromium.launchPersistentContext(PROFILE, {
          executablePath: exe,
          headless: process.env.ROCKET_YT_HEADLESS === '1',
          viewport: null,
          // Playwright coupe le son et affiche « contrôlé par un logiciel » par défaut : on retire ces options.
          ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
          args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check'],
        });
        c.on('close', () => { ctx = null; page = null; });
        return c;
      })().finally(() => { launching = null; });
    }
    ctx = await launching;
  }
  page = ctx.pages().find((p) => !p.isClosed()) || await ctx.newPage();
  page.on('close', () => { page = null; });
  return page;
}

// Fenêtre de consentement de Google/YouTube : « Tout accepter ».
async function acceptConsent(p) {
  const selectors = [
    'button:has-text("Tout accepter")', 'button:has-text("Accepter tout")', 'button:has-text("Accept all")',
    'button[aria-label*="Accepter"]', 'button[aria-label*="Accept the use"]', 'form[action*="consent"] button',
  ];
  for (let round = 0; round < 2; round++) {
    for (const sel of selectors) {
      const b = p.locator(sel).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 3000 }).catch(() => {});
        await p.waitForLoadState('domcontentloaded').catch(() => {});
        return true;
      }
    }
    if (round === 0) await p.waitForTimeout(800);
  }
  return false;
}

async function startVideo(p) {
  await p.waitForSelector('video', { timeout: 20000 });
  await p.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return;
    v.muted = false;
    if (v.volume < 0.2) v.volume = 0.8;
    const pr = v.play();
    if (pr && pr.catch) pr.catch(() => {});
  });
  // Publicités : clic sur « Passer » dès qu'il apparaît (pendant 30 s, sans bloquer la réponse).
  (async () => {
    for (let i = 0; i < 30 && !p.isClosed(); i++) {
      const skip = p.locator('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern').first();
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await p.waitForTimeout(1000).catch(() => {});
    }
  })();
}

// Cherche puis lance une vidéo. Renvoie { title }.
function play(query) {
  return serial(async () => {
    const p = await ensurePage();
    await p.goto(`${BASE}/results?search_query=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (await acceptConsent(p)) {
      // Après le consentement, YouTube revient parfois sur l'accueil : on refait la recherche.
      if (!/results\?/.test(p.url())) await p.goto(`${BASE}/results?search_query=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    const link = p.locator('ytd-video-renderer a#video-title[href*="/watch"], ytd-video-renderer a#thumbnail[href*="/watch"], a#video-title[href*="/watch"], a[href*="/watch?v="]').first();
    await link.waitFor({ state: 'attached', timeout: 20000 });
    const href = await link.getAttribute('href');
    let title = ((await link.getAttribute('title').catch(() => '')) || (await link.textContent().catch(() => '')) || '').trim();
    await p.goto(new URL(href, BASE + '/').href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await acceptConsent(p);
    await startVideo(p);
    if (!title) title = (await p.title().catch(() => '')).replace(/\s*-\s*YouTube\s*$/, '');
    lastTitle = title || query;
    await p.bringToFront().catch(() => {});
    return { title: lastTitle };
  });
}

function control(action) {
  return serial(async () => {
    if (!page || page.isClosed()) return { ok: false };
    if (action === 'next') {
      const btn = page.locator('.ytp-next-button').first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
      else await page.keyboard.press('Shift+N').catch(() => {});
      await page.waitForTimeout(1500).catch(() => {});
      await startVideo(page).catch(() => {});
      lastTitle = (await page.title().catch(() => '')).replace(/\s*-\s*YouTube\s*$/, '') || lastTitle;
      return { ok: true, title: lastTitle };
    }
    await page.evaluate((a) => {
      const v = document.querySelector('video');
      if (!v) return;
      if (a === 'pause') v.pause();
      if (a === 'resume') { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
      if (a === 'louder') v.volume = Math.min(1, v.volume + 0.2);
      if (a === 'quieter') v.volume = Math.max(0, v.volume - 0.2);
    }, action).catch(() => {});
    return { ok: true, title: lastTitle };
  });
}

async function state() {
  if (!page || page.isClosed()) return { open: false };
  const s = await page.evaluate(() => { const v = document.querySelector('video'); return v ? { playing: !v.paused, time: v.currentTime } : null; }).catch(() => null);
  return { open: true, url: page.url(), title: lastTitle, ...(s || {}) };
}

async function close() { if (ctx) await ctx.close().catch(() => {}); ctx = null; page = null; }

function strip(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim(); }

// Demandes de vidéos : « lance la vidéo de… », « mets la bande-annonce de Dune », « … sur YouTube ».
function parseVideo(text) {
  const t = strip(text).replace(/[?!.]+$/, '');
  // Commandes de lecture d'abord (« mets la vidéo en pause » n'est pas une recherche).
  if (/^(?:ouvre|lance|va sur) youtube$/.test(t)) return { action: 'open' };
  if (/\b(video|youtube)\b/.test(t) && /\b(pause|arrete|stoppe|coupe|stop)\b/.test(t)) return { action: 'pause' };
  if (/^(?:reprends|relance|remets|reprendre|redemarre)(?: la| le)? (?:video|youtube)$/.test(t)) return { action: 'resume' };
  if (/\b(video suivante|passe a la video suivante)\b/.test(t)) return { action: 'next' };
  if (/\b(monte|augmente)\b.*\b(son|volume)\b|\bplus fort\b/.test(t)) return { action: 'louder' };
  if (/\b(baisse|diminue)\b.*\b(son|volume)\b|\bmoins fort\b/.test(t)) return { action: 'quieter' };
  let m = t.match(/^(?:(?:mets|met|lance|relance|joue|montre|ouvre|regarde|affiche|trouve|cherche|passe)(?:[- ]moi)?\s+)?(?:une |la |le |les |des |l')?(videos?|clips?|bandes?[- ]annonces?|trailers?)\s+(?:de |d'|du |des |sur |avec |pour |intitulee? )?(.+?)(?:\s+sur youtube)?$/);
  if (m && /^(mets|met|lance|relance|joue|montre|ouvre|regarde|affiche|trouve|cherche|passe)/.test(t)) {
    const kind = m[1].startsWith('bande') || m[1].startsWith('trailer') ? 'bande annonce ' : m[1].startsWith('clip') ? 'clip ' : '';
    return { action: 'play', query: (kind + m[2]).trim() };
  }
  m = t.match(/^(?:(?:mets|met|lance|joue|montre|ouvre|cherche|passe|regarde)(?:[- ]moi)?\s+)?(.+?)\s+sur youtube$/);
  if (m) return { action: 'play', query: m[1].replace(/^(la |le |les |l'|une |un )/, '') };
  return null;
}

// Musique demandée à Rocket (analyse de music.js) → recherche YouTube.
function musicToQuery(mi) {
  if (!mi) return null;
  if (mi.action === 'play' && mi.item) return 'musique du moment playlist';
  if (mi.action !== 'search') return null;
  if (mi.kind === 'artist') return `${mi.query} musique`;
  if (mi.kind === 'playlist') return mi.genre ? `musique ${mi.query} playlist` : `${mi.query} playlist`;
  if (mi.kind === 'album') return `${mi.query} album complet`;
  return mi.query;
}

module.exports = { play, control, state, close, parseVideo, musicToQuery, findBrowser, BASE };
