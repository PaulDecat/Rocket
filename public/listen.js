'use strict';
// Reconnaissance vocale de Rocket.
// - Listen.once()        : une seule demande (bouton « Parler »).
// - Listen.setLatched()  : écoute continue (bouton « Maintenir »).
// Une demande n'est exécutée que si elle commence par « Ok Rocket » et finit par « s'il te plaît ».
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const BUFFER_MS = 12000; // délai max entre « Ok Rocket » et « s'il te plaît »

  const st = {
    rec: null, running: false, wantRun: false, latched: false, failures: 0, restartTimer: 0,
    capture: null, // écoute ponctuelle : { resolve, timer, idle, text }
    buffer: null, // écoute continue : { text, timer }
    handlers: {}, beepCtx: null,
  };

  function emit(name, ...args) { const f = st.handlers[name]; if (f) try { return f(...args); } catch (e) { console.error(e); } }

  function beep(freq = 880, dur = 0.12, vol = 0.12) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!st.beepCtx) st.beepCtx = new AC();
      const c = st.beepCtx;
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function ensureRec() {
    if (st.rec || !SR) return st.rec;
    const r = new SR();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onstart = () => { st.running = true; st.failures = 0; };
    r.onend = () => { st.running = false; scheduleRestart(); };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        st.wantRun = false;
        finishCapture(null);
        if (st.latched) { st.latched = false; notify(); }
        emit('error', "Le micro est refusé. Autorisez-le dans la barre d'adresse du navigateur (icône du cadenas), puis réessayez.");
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') st.failures++;
    };
    r.onresult = onResult;
    st.rec = r;
    return r;
  }

  function active() { return st.latched || !!st.capture; }
  function notify() { emit('state', { listening: active(), latched: st.latched }); }

  function scheduleRestart() {
    clearTimeout(st.restartTimer);
    if (!active() || !st.wantRun) return;
    st.restartTimer = setTimeout(start, st.failures > 3 ? 3000 : 250);
  }
  function start() {
    if (!SR) return;
    st.wantRun = true;
    const r = ensureRec();
    if (st.running) return;
    try { r.start(); } catch (e) { /* déjà démarrée */ }
  }
  function stopRec() {
    st.wantRun = false;
    clearTimeout(st.restartTimer);
    if (st.rec && st.running) { try { st.rec.stop(); } catch (e) { /* ignore */ } }
  }

  // ---------- Écoute ponctuelle (bouton « Parler ») ----------
  function finishCapture(text) {
    const c = st.capture;
    if (!c) return;
    st.capture = null;
    clearTimeout(c.timer); clearTimeout(c.idle);
    if (!active()) stopRec();
    notify();
    c.resolve(text && text.trim() ? text.trim() : null);
  }

  function once({ maxWaitMs = 15000 } = {}) {
    if (!SR) return Promise.resolve(null);
    if (st.capture) finishCapture(null);
    beep();
    return new Promise((resolve) => {
      st.capture = { resolve, text: '', timer: setTimeout(() => finishCapture(st.capture && st.capture.text), maxWaitMs), idle: 0 };
      notify();
      start();
    });
  }

  // ---------- Écoute continue (bouton « Maintenir ») ----------
  function resetBuffer() { if (st.buffer) clearTimeout(st.buffer.timer); st.buffer = null; }

  function onResult(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0].transcript.trim();
      const final = res.isFinal;
      if (!text) continue;

      if (st.capture) {
        const c = st.capture;
        const full = (c.text + ' ' + text).trim();
        emit('interim', full);
        if (Command.parse(full).wake && !c.waked) { c.waked = true; emit('wake'); }
        if (final) {
          c.text = full;
          if (Command.parse(c.text).complete) { finishCapture(c.text); continue; }
          clearTimeout(c.idle);
          c.idle = setTimeout(() => finishCapture(c.text), 2500);
        }
        continue;
      }

      if (!st.latched) continue;
      // Une demande commence toujours par « Ok Rocket » : le reste est ignoré.
      const startsNew = Command.parse(text).wake;
      if (!st.buffer && !startsNew) continue;
      if (!st.buffer || startsNew) {
        resetBuffer();
        st.buffer = { text: '', timer: setTimeout(() => { const t = st.buffer && st.buffer.text; resetBuffer(); if (t) emit('incomplete', t); }, BUFFER_MS) };
        emit('wake');
      }
      const full = (st.buffer.text + ' ' + text).trim();
      emit('interim', full);
      if (final) {
        st.buffer.text = full;
        const p = Command.parse(full);
        if (p.complete) { resetBuffer(); emit('command', p.question, full); }
      }
    }
  }

  function setLatched(on) {
    st.latched = !!on && !!SR;
    resetBuffer();
    if (st.latched) { beep(660, 0.1, 0.08); start(); }
    else if (!st.capture) stopRec();
    notify();
  }

  function cancel() { finishCapture(null); }

  function init(handlers) { st.handlers = handlers || {}; }

  window.Listen = {
    supported: !!SR, init, once, cancel, setLatched, beep,
    get latched() { return st.latched; },
    get capturing() { return !!st.capture; },
  };
})();
