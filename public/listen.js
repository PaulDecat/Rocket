'use strict';
// Écoute de Rocket.
// - Listen.once()       : une seule demande (bouton « Parler »).
// - Listen.setLatched() : écoute continue (bouton « Maintenir »).
// Deux moteurs :
// - « navigateur » : reconnaissance vocale de Chrome / Edge (rapide) ;
// - « local »      : Whisper dans le navigateur (Opera, Opera GX, Brave, Firefox…).
// En mode automatique, si le navigateur ne renvoie aucun texte alors que le micro capte de la voix,
// Rocket passe tout seul au moteur local et transcrit la phrase déjà enregistrée.
// Une demande n'est exécutée que si elle commence par « Ok Rocket » et finit par « s'il te plaît ».
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const UA = navigator.userAgent || '';
  // Navigateurs qui exposent l'API mais ne renvoient jamais de texte.
  const BROKEN_WEB = /\bOPR\/|\bOPX\/|\bOPT\/|Opera|YaBrowser|Vivaldi/.test(UA) || !!navigator.brave;
  const BUFFER_MS = 12000; // délai max entre « Ok Rocket » et « s'il te plaît »
  const KEY = 'rocket.stt';

  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  const st = {
    pref: read(KEY) || 'auto', webFailed: false, webWorked: false, misses: 0,
    rec: null, running: false, wantRun: false, latched: false, failures: 0, restartTimer: 0,
    capture: null, buffer: null, handlers: {}, beepCtx: null,
    lastWebResult: 0, queue: Promise.resolve(), pendingStt: 0,
  };

  function emit(name, ...args) { const f = st.handlers[name]; if (f) try { return f(...args); } catch (e) { console.error(e); } }

  function engine() {
    if (st.pref === 'local') return 'local';
    if (st.pref === 'web') return SR ? 'web' : 'local';
    return SR && !BROKEN_WEB && !st.webFailed ? 'web' : 'local';
  }

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

  function active() { return st.latched || !!st.capture; }
  function notify() { emit('state', { listening: active(), latched: st.latched, engine: engine() }); }

  // Le navigateur ne fonctionne pas : on bascule sur le moteur local pour la suite.
  function markWebFailed(reason) {
    if (st.pref === 'web' || st.webFailed) return;
    st.webFailed = true; // pour cette session seulement
    stopRec();
    console.warn('[Rocket] reconnaissance du navigateur inopérante (' + reason + ') : moteur local');
    emit('engine', 'local', reason);
    prepareLocal();
    notify();
  }

  // ---------- Moteur « navigateur » ----------
  function ensureRec() {
    if (st.rec || !SR) return st.rec;
    const r = new SR();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onstart = () => { st.running = true; st.failures = 0; };
    r.onend = () => { st.running = false; scheduleRestart(); };
    r.onerror = (e) => {
      if (e.error === 'not-allowed') {
        // Le micro a été refusé (Mic.open aurait déjà affiché un message s'il s'agissait du micro lui-même).
        st.wantRun = false;
        markWebFailed('not-allowed');
      } else if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
        markWebFailed(e.error);
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') st.failures++;
    };
    r.onresult = (e) => {
      st.lastWebResult = Date.now();
      st.webWorked = true; st.misses = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (text) feed(text, e.results[i].isFinal);
      }
    };
    st.rec = r;
    return r;
  }
  function scheduleRestart() {
    clearTimeout(st.restartTimer);
    if (!active() || !st.wantRun || engine() !== 'web') return;
    st.restartTimer = setTimeout(startRec, st.failures > 3 ? 3000 : 250);
  }
  function startRec() {
    if (!SR || engine() !== 'web') return;
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

  // ---------- Moteur « local » ----------
  let localPrepared = false;
  function prepareLocal() {
    if (localPrepared) return;
    localPrepared = true;
    if (active()) emit('status', 'Préparation du moteur vocal local…');
    LocalSTT.load((p) => {
      const pct = Math.round((p.loaded / p.total) * 100);
      emit('status', `Téléchargement du moteur vocal (une seule fois) : ${pct} %`);
    }).then(() => { if (active()) emit('status', 'Moteur vocal prêt. Parlez, Monsieur.'); })
      .catch((e) => { localPrepared = false; emit('error', "Le moteur vocal local n'a pas pu se charger (" + e.message + '). Vérifiez la connexion Internet, ou ouvrez Rocket dans Chrome ou Edge.'); });
  }

  function transcribeLocal(audio) {
    st.pendingStt++;
    emit('transcribing', true);
    // Les phrases sont transcrites dans l'ordre.
    st.queue = st.queue.then(() => LocalSTT.transcribe(audio)).then((text) => {
      text = String(text || '').replace(/^\s*[[(].*?[\])]\s*$/, '').trim(); // ignore « [Musique] », « (bruit) »
      if (text) feed(text, true);
      else if (st.capture) armIdle();
    }).catch((e) => emit('error', 'Transcription impossible : ' + e.message))
      .finally(() => { st.pendingStt--; emit('transcribing', st.pendingStt > 0); });
  }

  // Chaque phrase captée par le micro.
  function onSegment(audio) {
    if (engine() === 'local') return transcribeLocal(audio);
    // Moteur navigateur : s'il n'a jamais rien renvoyé et reste muet sur deux vraies phrases
    // (plus de 0,8 s), il ne fonctionne pas dans ce navigateur.
    const dur = (audio.length / 16000) * 1000;
    if (st.webWorked || dur < 800) return;
    const since = Date.now() - dur - 1500;
    setTimeout(() => {
      if (st.webWorked || st.lastWebResult >= since || !active()) return;
      // La phrase n'est pas perdue : le moteur local la transcrit.
      st.misses++;
      if (st.misses >= 2) markWebFailed('aucun texte reçu');
      else prepareLocal();
      transcribeLocal(audio);
    }, 1500);
  }

  // ---------- Logique commune ----------
  function armIdle() {
    const c = st.capture;
    if (!c) return;
    clearTimeout(c.idle);
    c.idle = setTimeout(() => { if (st.pendingStt === 0) finishCapture(c.text); else armIdle(); }, 2500);
  }

  function feed(text, final) {
    text = Command.normalize(text); // « roquette » → « Rocket »
    if (st.capture) {
      const c = st.capture;
      const full = (c.text + ' ' + text).trim();
      emit('interim', full);
      if (Command.parse(full).wake && !c.waked) { c.waked = true; emit('wake'); }
      if (final) {
        c.text = full;
        if (Command.parse(c.text).complete) { finishCapture(c.text); return; }
        armIdle();
      }
      return;
    }
    if (!st.latched) return;
    // Une demande commence toujours par « Ok Rocket » : le reste est ignoré.
    const startsNew = Command.parse(text).wake;
    if (!st.buffer && !startsNew) return;
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
  function resetBuffer() { if (st.buffer) clearTimeout(st.buffer.timer); st.buffer = null; }

  // Ouvre le micro et lance le moteur choisi.
  async function activate() {
    await Mic.open();
    Mic.startSegments(onSegment, {
      onSpeechStart: () => emit('hearing'),
      // En écoute continue avec le moteur local, on n'écoute pas Rocket parler.
      isMuted: () => engine() === 'local' && !st.capture && !!(st.handlers.isSpeaking && st.handlers.isSpeaking()),
    });
    if (engine() === 'web') startRec(); else prepareLocal();
  }
  function deactivate() {
    stopRec();
    Mic.close();
  }

  function finishCapture(text) {
    const c = st.capture;
    if (!c) return;
    st.capture = null;
    clearTimeout(c.timer); clearTimeout(c.idle);
    if (!active()) deactivate();
    notify();
    c.resolve(text && text.trim() ? text.trim() : null);
  }

  async function once({ maxWaitMs = 15000 } = {}) {
    if (st.capture) finishCapture(null);
    beep();
    const p = new Promise((resolve) => {
      st.capture = { resolve, text: '', idle: 0 };
      // Le premier chargement du moteur local peut prendre une minute : on attend plus longtemps.
      const tick = () => { if (!st.capture) return; if (st.pendingStt > 0 || (engine() === 'local' && !LocalSTT.ready)) st.capture.timer = setTimeout(tick, 5000); else finishCapture(st.capture.text); };
      st.capture.timer = setTimeout(tick, maxWaitMs);
    });
    notify();
    try { await activate(); } catch (e) { emit('error', e.message); finishCapture(null); }
    return p;
  }

  async function setLatched(on) {
    st.latched = !!on;
    resetBuffer();
    if (st.latched) {
      beep(660, 0.1, 0.08);
      notify();
      try { await activate(); } catch (e) { st.latched = false; emit('error', e.message); deactivate(); notify(); }
    } else {
      if (!st.capture) deactivate();
      notify();
    }
  }

  function cancel() { finishCapture(null); }

  function setPref(p) {
    st.pref = ['auto', 'web', 'local'].includes(p) ? p : 'auto';
    write(KEY, st.pref);
    st.webFailed = false; st.misses = 0;
    if (active()) { stopRec(); if (engine() === 'web') startRec(); else prepareLocal(); }
    notify();
  }

  function init(handlers) { st.handlers = handlers || {}; }

  // Au démarrage de Rocket : le moteur local (Opera, Brave, Firefox…) est préparé à l'avance.
  function warm() { if (engine() === 'local') prepareLocal(); }

  window.Listen = {
    // Le micro fonctionne si on peut l'ouvrir : le moteur local prend le relais du navigateur.
    supported: !!(window.Mic && Mic.supported) || !!SR,
    init, once, cancel, setLatched, setPref, beep, warm,
    get latched() { return st.latched; },
    get capturing() { return !!st.capture; },
    get engine() { return engine(); },
    get pref() { return st.pref; },
    get webAvailable() { return !!SR && !BROKEN_WEB; },
  };
})();
