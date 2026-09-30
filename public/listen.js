'use strict';
// Reconnaissance vocale : mot d'appel « OK Nova », capture d'une question, écoute de conversation.
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const KEY = 'rocket.wake';
  const NAMES = '(?:nova|novah|novas|nosa|noa|noah|nora|nowa|novak|nava|neva|écho|echo)';
  const WAKE = new RegExp(`(?:^|\\s)(?:ok|okay|o\\.k\\.?|hey|hé|he|dis|allô|allo)[\\s,.!-]*${NAMES}\\b[\\s,.!?-]*`, 'i');
  const NAME_ONLY = new RegExp(`^\\s*${NAMES}\\s*[,!.]\\s*(.{3,})`, 'i');

  const st = {
    rec: null, running: false, enabled: false, wantRun: false,
    mode: 'wake', // wake | capture
    capture: null, // { resolve, timer, text }
    handlers: {}, lastWakeIdx: -1, restartTimer: 0, failures: 0, beepCtx: null,
  };

  try { st.enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { st.enabled = true; }

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

  function emit(name, ...args) { const f = st.handlers[name]; if (f) try { f(...args); } catch (e) { console.error(e); } }

  function ensureRec() {
    if (st.rec || !SR) return st.rec;
    const r = new SR();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { st.running = true; st.failures = 0; };
    r.onend = () => { st.running = false; scheduleRestart(); };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        st.wantRun = false; st.enabled = false;
        finishCapture(null);
        emit('error', "Le micro est refusé. Autorisez-le dans la barre d'adresse du navigateur (icône du cadenas), puis réactivez OK NOVA.");
        emit('enabled', false);
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        st.failures++;
      }
    };
    r.onresult = onResult;
    st.rec = r;
    return r;
  }

  function scheduleRestart() {
    clearTimeout(st.restartTimer);
    if (!(st.enabled || st.capture) || !st.wantRun) return;
    const delay = st.failures > 3 ? 3000 : 250;
    st.restartTimer = setTimeout(start, delay);
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

  function finishCapture(text) {
    const c = st.capture;
    if (!c) return;
    st.capture = null;
    st.mode = 'wake';
    clearTimeout(c.timer);
    c.resolve(text && text.trim() ? text.trim() : null);
    if (!st.enabled) stopRec();
  }

  function onResult(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0].transcript;
      const final = res.isFinal;

      if (st.capture) {
        const c = st.capture;
        // En capture après un mot d'appel dans la même phrase : ignorer le mot d'appel.
        const cleaned = text.replace(WAKE, ' ').trim();
        emit('interim', cleaned);
        if (final && cleaned) finishCapture(cleaned);
        else if (cleaned) { clearTimeout(c.timer); c.timer = setTimeout(() => finishCapture(cleaned), 2500); }
        continue;
      }

      if (!st.enabled) continue;
      const busy = st.handlers.isBusy ? st.handlers.isBusy() : false;
      const m = text.match(WAKE);
      if (m) {
        const rest = text.slice(m.index + m[0].length).trim();
        if (st.lastWakeIdx !== i) {
          st.lastWakeIdx = i;
          emit('wake'); // l'app coupe la voix et le podcast
        }
        if (final) {
          st.lastWakeIdx = -1;
          if (rest.length > 2) emit('question', rest);
          else {
            beep();
            once({ maxWaitMs: 8000 }).then((q) => { if (q) emit('question', q); else emit('timeout'); });
          }
        }
        continue;
      }
      if (final && !busy) {
        const n = text.match(NAME_ONLY);
        if (n) { emit('wake'); emit('question', n[1].trim()); }
      }
    }
  }

  // Capture une seule question (micro, clic sur le noyau, suite du mot d'appel).
  function once({ maxWaitMs = 8000, beep: doBeep = false, quiet = false } = {}) {
    if (!SR) return Promise.resolve(null);
    if (st.capture) finishCapture(null);
    if (doBeep) beep(doBeep === 'soft' ? 660 : 880, 0.1, doBeep === 'soft' ? 0.06 : 0.12);
    return new Promise((resolve) => {
      st.mode = 'capture';
      st.capture = { resolve, timer: setTimeout(() => finishCapture(null), maxWaitMs) };
      emit('listening', quiet);
      start();
    });
  }

  function cancel() { finishCapture(null); }

  function setEnabled(on) {
    st.enabled = !!on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (on) start(); else if (!st.capture) stopRec();
    emit('enabled', st.enabled);
  }

  function init(handlers) {
    st.handlers = handlers || {};
    if (SR && st.enabled) start();
  }

  window.Listen = {
    supported: !!SR, init, once, cancel, setEnabled, beep,
    get enabled() { return st.enabled && !!SR; },
    get capturing() { return !!st.capture; },
    WAKE, NAME_ONLY,
  };
})();
