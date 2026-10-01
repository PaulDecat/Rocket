// Moteur vocal local de Rocket : Whisper (OpenAI) exécuté dans le navigateur avec Transformers.js.
// Le modèle (~80 Mo) est téléchargé une seule fois, puis gardé en cache par le navigateur.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

env.allowLocalModels = false;
env.useBrowserCache = true;

// Modèles des démonstrations officielles de Transformers.js (WebGPU et WebAssembly).
const MODEL_GPU = 'onnx-community/whisper-base';
const MODEL_WASM = 'Xenova/whisper-base';
let asr = null;
let loading = null;

function load() {
  if (asr) return Promise.resolve(asr);
  if (loading) return loading;
  const progress_callback = (p) => {
    if (p && p.status === 'progress' && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  const make = (model, device, dtype) => pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback });
  loading = (async () => {
    // WebGPU (carte graphique) si disponible, sinon WebAssembly (processeur).
    if (self.navigator && self.navigator.gpu) {
      try { asr = await make(MODEL_GPU, 'webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }); }
      catch (e) { asr = null; }
    }
    if (!asr) asr = await make(MODEL_WASM, 'wasm', 'q8');
    // Échauffement : la toute première transcription est lente (compilation) ; on la fait tout de suite
    // sur une demi-seconde de silence, pour que votre première vraie phrase soit rapide.
    try { await asr(new Float32Array(8000), { language: 'french', task: 'transcribe' }); } catch (e) { /* ignore */ }
    self.postMessage({ type: 'ready' });
    return asr;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'load') { await load(); return; }
    if (m.type === 'transcribe') {
      const model = await load();
      const out = await model(m.audio, { language: 'french', task: 'transcribe', chunk_length_s: 30 });
      self.postMessage({ type: 'result', id: m.id, text: String((out && out.text) || '').trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
