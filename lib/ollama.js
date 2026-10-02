'use strict';
// « Cerveau hors ligne » de Rocket : une IA locale gratuite (Ollama) installée sur l'ordinateur.
// Utilisée quand Claude n'est pas connecté (ou ne répond pas). Rien n'est envoyé sur Internet.

const HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
// Modèles préférés, dans l'ordre (bons en français).
const PREFERRED = ['qwen2.5:7b', 'qwen2.5', 'mistral', 'llama3.1', 'llama3.2', 'gemma2', 'gemma3', 'qwen2.5:3b', 'phi3'];

let cache = { at: 0, model: null };

async function get(path, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(HOST + path, { signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// Renvoie le nom du modèle à utiliser, ou null si Ollama n'est pas lancé / sans modèle.
async function model() {
  if (Date.now() - cache.at < 30000) return cache.model;
  let m = null;
  try {
    const r = await get('/api/tags', 1500);
    const names = ((await r.json()).models || []).map((x) => x.name);
    const wanted = process.env.ROCKET_OLLAMA_MODEL;
    m = (wanted && names.find((n) => n === wanted || n.startsWith(wanted)))
      || PREFERRED.map((p) => names.find((n) => n === p || n.startsWith(p + ':') || n.startsWith(p))).find(Boolean)
      || names.find((n) => !/embed/i.test(n)) || null;
  } catch (e) { m = null; }
  cache = { at: Date.now(), model: m };
  return m;
}

// Réponse en flux : onText reçoit chaque morceau de texte.
async function chat({ system, prompt, onText, timeoutMs = 120000 }) {
  const m = await model();
  if (!m) throw new Error('IA locale indisponible');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(HOST + '/api/chat', {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: m, stream: true, keep_alive: '30m',
        options: { temperature: 0.4, num_ctx: 4096 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error('IA locale : HTTP ' + r.status);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.error) throw new Error(ev.error);
        const piece = ev.message && ev.message.content;
        if (piece) { text += piece; if (onText) onText(piece); }
      }
    }
    return { text, model: m };
  } finally { clearTimeout(timer); }
}

// Précharge le modèle en mémoire au démarrage (la 1re réponse est alors rapide).
async function warm() {
  const m = await model();
  if (!m) return null;
  fetch(HOST + '/api/generate', { method: 'POST', body: JSON.stringify({ model: m, prompt: '', keep_alive: '30m' }) }).catch(() => {});
  return m;
}

module.exports = { model, chat, warm, HOST, reset: () => { cache = { at: 0, model: null }; } };
