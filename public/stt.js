'use strict';
// Micro de Rocket : capture du son, niveau sonore, détection de la parole (VAD)
// et moteur vocal local (Whisper dans le navigateur) pour les navigateurs sans reconnaissance vocale
// fonctionnelle (Opera, Opera GX, Brave, Firefox…).
(function () {
  const TARGET_RATE = 16000;

  // ---------- Micro ----------
  const mic = { stream: null, ctx: null, src: null, analyser: null, data: null, level: 0, proc: null, sink: null };

  function micError(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return "Le micro est bloqué. Cliquez sur l'icône du cadenas (ou du micro) dans la barre d'adresse, autorisez le micro, puis réessayez.";
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return "Aucun micro n'a été trouvé. Branchez un micro ou un casque, puis réessayez.";
    if (n === 'NotReadableError') return 'Le micro est déjà utilisé par une autre application (Discord, Teams…). Fermez-la, puis réessayez.';
    return "Impossible d'ouvrir le micro : " + ((e && e.message) || 'erreur inconnue') + '.';
  }

  async function open() {
    if (mic.stream && mic.stream.active) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      throw new Error("Ce navigateur ne donne pas accès au micro. Ouvrez Rocket à l'adresse http://localhost:3000 dans Chrome, Edge ou Opera.");
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { throw new Error(micError(e)); }
    const AC = window.AudioContext || window.webkitAudioContext;
    mic.stream = stream;
    mic.ctx = new AC();
    if (mic.ctx.state === 'suspended') await mic.ctx.resume().catch(() => {});
    mic.src = mic.ctx.createMediaStreamSource(stream);
    mic.analyser = mic.ctx.createAnalyser();
    mic.analyser.fftSize = 1024;
    mic.data = new Float32Array(mic.analyser.fftSize);
    mic.src.connect(mic.analyser);
  }

  function close() {
    stopSegments();
    if (mic.stream) mic.stream.getTracks().forEach((t) => t.stop());
    if (mic.ctx) mic.ctx.close().catch(() => {});
    Object.assign(mic, { stream: null, ctx: null, src: null, analyser: null, data: null, level: 0 });
  }

  // Niveau sonore 0..1 (pour l'indicateur sur le bouton).
  function level() {
    if (!mic.analyser) return 0;
    mic.analyser.getFloatTimeDomainData(mic.data);
    let sum = 0;
    for (let i = 0; i < mic.data.length; i++) sum += mic.data[i] * mic.data[i];
    const rms = Math.sqrt(sum / mic.data.length);
    mic.level = mic.level * 0.6 + Math.min(1, rms * 8) * 0.4;
    return mic.level;
  }

  function downsample(chunks, rate) {
    let len = 0;
    for (const c of chunks) len += c.length;
    const all = new Float32Array(len);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    if (rate === TARGET_RATE) return all;
    const ratio = rate / TARGET_RATE;
    const out = new Float32Array(Math.floor(len / ratio));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
      let s = 0;
      for (let j = a; j < b; j++) s += all[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  }

  // Détection de la parole : appelle onSegment(audio 16 kHz) à chaque phrase (fin = 0,6 s de silence).
  function startSegments(onSegment, { onSpeechStart, isMuted } = {}) {
    stopSegments();
    if (!mic.ctx) return;
    const rate = mic.ctx.sampleRate;
    const proc = mic.ctx.createScriptProcessor(4096, 1, 1);
    const blockMs = (4096 / rate) * 1000;
    let floor = 0.005, speaking = false, speechMs = 0, silenceMs = 0;
    let pre = [], buf = [];
    proc.onaudioprocess = (ev) => {
      const x = ev.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
      const rms = Math.sqrt(sum / x.length);
      const copy = new Float32Array(x);
      const loud = rms > Math.max(0.012, floor * 3);
      if (!speaking) {
        floor = floor * 0.95 + Math.min(rms, 0.05) * 0.05; // bruit de fond
        pre.push(copy); if (pre.length > 4) pre.shift(); // ~0,3 s avant la parole
        if (loud && !(isMuted && isMuted())) {
          speechMs += blockMs;
          if (speechMs >= 120) { speaking = true; silenceMs = 0; buf = pre.slice(); pre = []; onSpeechStart && onSpeechStart(); }
        } else speechMs = 0;
        return;
      }
      buf.push(copy);
      silenceMs = loud ? 0 : silenceMs + blockMs;
      const dur = buf.length * blockMs;
      if (silenceMs >= 600 || dur >= 12000) {
        speaking = false; speechMs = 0;
        const audio = downsample(buf, rate);
        buf = [];
        if (dur - silenceMs >= 300) onSegment(audio);
      }
    };
    mic.src.connect(proc);
    // Un ScriptProcessor doit être relié à la sortie pour fonctionner : on passe par un gain nul.
    mic.sink = mic.ctx.createGain();
    mic.sink.gain.value = 0;
    proc.connect(mic.sink);
    mic.sink.connect(mic.ctx.destination);
    mic.proc = proc;
  }

  function stopSegments() {
    if (mic.proc) { try { mic.proc.disconnect(); mic.src && mic.src.disconnect(mic.proc); } catch (e) { /* ignore */ } mic.proc.onaudioprocess = null; }
    if (mic.sink) { try { mic.sink.disconnect(); } catch (e) { /* ignore */ } }
    mic.proc = null; mic.sink = null;
  }

  // ---------- Moteur local (Whisper) ----------
  const stt = { worker: null, ready: false, loading: null, quality: null, seq: 0, pending: new Map(), onProgress: null };

  function worker() {
    if (stt.worker) return stt.worker;
    const w = new Worker('/stt-worker.js', { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress' && stt.onProgress) stt.onProgress(m);
      if (m.type === 'ready') { stt.ready = true; if (stt.loading) stt.loading.resolve(); }
      if (m.type === 'result' || m.type === 'error') {
        const p = stt.pending.get(m.id);
        if (p) { stt.pending.delete(m.id); m.type === 'result' ? p.resolve(m.text) : p.reject(new Error(m.message)); }
        else if (m.type === 'error' && stt.loading) stt.loading.reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      const err = new Error('Le moteur vocal local ne démarre pas (' + ((e && e.message) || 'erreur') + ').');
      if (stt.loading) stt.loading.reject(err);
      for (const p of stt.pending.values()) p.reject(err);
      stt.pending.clear();
      stt.worker = null;
    };
    stt.worker = w;
    return w;
  }

  // Prépare le moteur (téléchargement du modèle la première fois).
  function load(onProgress, quality) {
    if (window.__STT_FAKE) { stt.ready = true; return Promise.resolve(); }
    quality = quality || 'fast';
    if (stt.quality !== quality) { stt.ready = false; stt.loading = null; stt.quality = quality; } // changement de modèle
    if (stt.ready) return Promise.resolve();
    stt.onProgress = onProgress || null;
    if (stt.loading) return stt.loading.promise;
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    stt.loading = { promise, resolve, reject };
    promise.catch(() => { stt.loading = null; });
    worker().postMessage({ type: 'load', quality: quality || 'fast' });
    return promise;
  }

  function transcribe(audio) {
    if (window.__STT_FAKE) return Promise.resolve(window.__STT_FAKE(audio));
    const id = ++stt.seq;
    return new Promise((resolve, reject) => {
      stt.pending.set(id, { resolve, reject });
      worker().postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
    });
  }

  window.Mic = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    open, close, level, startSegments, stopSegments,
    get active() { return !!(mic.stream && mic.stream.active); },
  };
  window.LocalSTT = { load, transcribe, get ready() { return stt.ready; } };
})();
