'use strict';
// Synthèse vocale : voix du serveur (Microsoft / ElevenLabs) avec repli sur les voix du navigateur.
(function () {
  const KEY = 'rocket.voice';
  const FEMALE = /(amelie|amélie|audrey|aurelie|aurélie|marie|julie|denise|vivienne|eloise|éloïse|hortense|virginie|celine|céline|chantal|joana|lea|léa|sylvie|charline|ariane|google français)/i;
  const MALE = /(thomas|henri|remy|rémy|paul|nicolas|daniel|jacques|claude|guillaume|mathieu|antoine|jean|fabrice|olivier)/i;

  const state = {
    mode: 'edge', // edge | elevenlabs | browser
    serverFails: 0,
    settings: { lead: '', co: '', rate: 1.05, solo: false },
    audio: null, ctx: null, analyser: null, data: null,
    seq: 0, current: null, paused: false,
    cache: new Map(), browserVoices: [],
    synthSpeaking: false, synthPulse: 0,
  };

  try { Object.assign(state.settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state.settings)); } catch (e) { /* ignore */ } }

  function configure(cfg) {
    state.mode = cfg.tts || 'edge';
    const def = cfg.defaultVoices || {};
    const ids = (cfg.voices || []).map((v) => v.id);
    if (!ids.includes(state.settings.lead)) state.settings.lead = def.lead || '';
    if (!ids.includes(state.settings.co)) state.settings.co = def.co || '';
  }

  function loadBrowserVoices() {
    if (!('speechSynthesis' in window)) return;
    state.browserVoices = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  }
  if ('speechSynthesis' in window) {
    loadBrowserVoices();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', loadBrowserVoices);
  }

  function pickBrowserVoice(speaker) {
    const list = state.browserVoices;
    if (!list.length) return null;
    const score = (v) => {
      let s = 0;
      if (/^fr[-_]FR/i.test(v.lang)) s += 3; else s += 1;
      if (/(natural|neural|premium|enhanced|online|siri)/i.test(v.name)) s += 3;
      if (speaker === 'lead' ? FEMALE.test(v.name) : MALE.test(v.name)) s += 2;
      if (speaker === 'lead' ? MALE.test(v.name) : FEMALE.test(v.name)) s -= 2;
      if (v.localService) s += 0.5;
      return s;
    };
    return [...list].sort((a, b) => score(b) - score(a))[0];
  }

  // À appeler depuis un clic (autorisation du son).
  function unlock() {
    if (!state.audio) {
      state.audio = new Audio();
      state.audio.preload = 'auto';
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.ctx = new AC();
        const src = state.ctx.createMediaElementSource(state.audio);
        state.analyser = state.ctx.createAnalyser();
        state.analyser.fftSize = 512;
        state.data = new Uint8Array(state.analyser.fftSize);
        src.connect(state.analyser);
        state.analyser.connect(state.ctx.destination);
      } catch (e) { state.ctx = null; state.analyser = null; }
    }
    if (state.ctx && state.ctx.state === 'suspended') state.ctx.resume().catch(() => {});
    if ('speechSynthesis' in window) loadBrowserVoices();
  }

  function speakerKey(speaker) { return state.settings.solo ? 'lead' : speaker === 'co' ? 'co' : 'lead'; }
  function rateParam() { return Math.round((state.settings.rate - 1) * 100); }
  function cacheKey(text, speaker) { const sp = speakerKey(speaker); return [sp, state.settings[sp], state.settings.rate, text].join('|'); }

  function fetchAudio(text, speaker) {
    const key = cacheKey(text, speaker);
    if (state.cache.has(key)) return state.cache.get(key);
    const sp = speakerKey(speaker);
    const p = fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker: sp, voice: state.settings[sp], rate: rateParam() }),
    }).then((r) => {
      if (!r.ok) throw new Error('TTS ' + r.status);
      return r.blob();
    }).then((b) => URL.createObjectURL(b));
    p.catch(() => state.cache.delete(key));
    state.cache.set(key, p);
    // Garder un cache raisonnable.
    if (state.cache.size > 12) {
      const first = state.cache.keys().next().value;
      const old = state.cache.get(first);
      state.cache.delete(first);
      old.then((u) => setTimeout(() => URL.revokeObjectURL(u), 60000)).catch(() => {});
    }
    return p;
  }

  function useServer() { return state.mode !== 'browser' && state.serverFails < 2; }

  function prefetch(text, speaker) {
    if (!text || !useServer()) return;
    fetchAudio(text, speaker).catch(() => {});
  }

  function speakServer(text, speaker, onProgress, seq) {
    return fetchAudio(text, speaker).then((url) => new Promise((resolve, reject) => {
      if (seq !== state.seq) return resolve(false);
      const a = state.audio;
      let last = -1;
      const cleanup = () => { a.onended = a.onerror = a.ontimeupdate = null; state.current = null; };
      const tick = () => {
        if (!a.duration || !isFinite(a.duration)) return;
        const f = Math.min(1, a.currentTime / a.duration);
        if (Math.abs(f - last) > 0.005) { last = f; onProgress && onProgress(f); }
      };
      state.current = { tick, resolve: (v) => { cleanup(); resolve(v); } };
      a.ontimeupdate = tick;
      a.onended = () => { onProgress && onProgress(1); cleanup(); resolve(true); };
      a.onerror = () => { cleanup(); reject(new Error('Lecture audio impossible')); };
      a.src = url;
      a.playbackRate = 1;
      const pr = a.play();
      if (pr && pr.catch) pr.catch((e) => { cleanup(); reject(e); });
    }));
  }

  function splitSentences(text) {
    const parts = text.match(/[^.!?;:]+[.!?;:]*\s*/g) || [text];
    const out = [];
    let buf = '';
    for (const p of parts) { if ((buf + p).length > 180 && buf) { out.push(buf); buf = p; } else buf += p; }
    if (buf.trim()) out.push(buf);
    return out;
  }

  function speakBrowser(text, speaker, onProgress, seq) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { onProgress && onProgress(1); return setTimeout(() => resolve(true), Math.min(8000, text.length * 45)); }
      speechSynthesis.cancel();
      const sp = speakerKey(speaker);
      const voice = pickBrowserVoice(sp);
      const chunks = splitSentences(text);
      let offset = 0, i = 0;
      const finish = (v) => { state.synthSpeaking = false; state.current = null; resolve(v); };
      state.current = { tick: null, resolve: finish };
      const next = () => {
        if (seq !== state.seq) return finish(false);
        if (i >= chunks.length) { onProgress && onProgress(1); return finish(true); }
        const chunk = chunks[i++];
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = 'fr-FR';
        if (voice) u.voice = voice;
        u.rate = state.settings.rate;
        u.pitch = sp === 'co' && !state.settings.solo ? 0.85 : 1.05;
        // Garde-fou : certains navigateurs n'émettent jamais « end » (aucune voix installée, onglet en arrière-plan…).
        let done = false, started = false;
        const budget = (chunk.length * 85) / state.settings.rate + 2500;
        const watchdog = setInterval(() => {
          if (done || seq !== state.seq) { clearInterval(watchdog); return; }
          if (state.paused) return;
          if (!started && !speechSynthesis.speaking) { finishChunk(); return; }
          if (performance.now() - t0 > budget * 1.6) finishChunk();
        }, 1000);
        const t0 = performance.now();
        const finishChunk = () => {
          if (done) return;
          done = true; clearInterval(watchdog);
          offset += chunk.length;
          if (onProgress) onProgress(Math.min(1, offset / text.length));
          next();
        };
        u.onstart = () => { started = true; };
        u.onboundary = (e) => { started = true; if (onProgress) onProgress(Math.min(1, (offset + (e.charIndex || 0)) / text.length)); };
        u.onend = finishChunk;
        u.onerror = finishChunk;
        state.synthSpeaking = true;
        speechSynthesis.speak(u);
      };
      next();
    });
  }

  // Lit un texte ; résout true à la fin, false si interrompu.
  async function speak(text, speaker = 'lead', onProgress) {
    stop();
    const seq = ++state.seq;
    state.paused = false;
    unlock();
    if (useServer()) {
      try {
        const r = await speakServer(text, speaker, onProgress, seq);
        state.serverFails = 0;
        return r;
      } catch (e) {
        if (seq !== state.seq) return false;
        state.serverFails++;
        console.warn('[Voix] serveur indisponible, repli navigateur', e);
      }
    }
    return speakBrowser(text, speaker, onProgress, seq);
  }

  function stop() {
    state.seq++;
    if (state.audio) { try { state.audio.pause(); } catch (e) { /* ignore */ } }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (state.current) { const c = state.current; state.current = null; c.resolve(false); }
    state.synthSpeaking = false;
    state.paused = false;
  }

  function pause() {
    state.paused = true;
    if (state.audio && !state.audio.paused) state.audio.pause();
    if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.pause();
  }
  function resume() {
    state.paused = false;
    if (state.audio && state.audio.src && state.current) state.audio.play().catch(() => {});
    if ('speechSynthesis' in window && speechSynthesis.paused) speechSynthesis.resume();
  }

  function speaking() {
    return !state.paused && !!state.current;
  }

  // Niveau sonore 0..1 (pour animer le noyau).
  function level() {
    if (!speaking()) return 0;
    if (state.synthSpeaking || !state.analyser) {
      state.synthPulse += 0.35;
      return 0.35 + 0.25 * Math.abs(Math.sin(state.synthPulse)) * Math.abs(Math.sin(state.synthPulse * 0.37));
    }
    state.analyser.getByteTimeDomainData(state.data);
    let sum = 0;
    for (let i = 0; i < state.data.length; i++) { const v = (state.data[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / state.data.length) * 4);
  }

  function tick() { if (state.current && state.current.tick) state.current.tick(); }

  function set(k, v) { state.settings[k] = v; save(); }

  window.Voice = {
    configure, unlock, speak, prefetch, stop, pause, resume, level, tick, speaking, set,
    get settings() { return { ...state.settings }; },
    get mode() { return useServer() ? state.mode : 'browser'; },
    get solo() { return !!state.settings.solo; },
  };
})();
