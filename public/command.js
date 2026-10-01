'use strict';
// Règle des commandes : Rocket n'exécute une demande que si la phrase
// commence par « Ok Rocket » et se termine par « s'il te plaît ».
(function (root) {
  // Variantes fréquentes de la reconnaissance vocale (« okay », « Roquette »…).
  const START = /^\s*(?:ok|okay|oké|okey|o\.\s?k\.?)\s*[,.!:;-]*\s*(?:rocket|roquette|rockett|rokket|rocquette|rockette|rock it)\b[\s,.!:;-]*/i;
  const END = /[\s,.;:-]*s\s?['’`]?\s?il\s+te\s+pla[iî]t[\s.!?]*$/i;

  // { wake: commence par « Ok Rocket », complete: règle respectée, question: la demande seule }
  function parse(text) {
    const t = String(text || '').trim();
    const s = t.match(START);
    if (!s) return { wake: false, complete: false, question: '' };
    const rest = t.slice(s[0].length);
    const e = rest.match(END);
    if (!e) return { wake: true, complete: false, question: rest.trim() };
    const question = rest.slice(0, e.index).trim().replace(/[,;:]+$/, '').trim();
    return { wake: true, complete: true, question };
  }

  const HINT = "Commencez par « Ok Rocket » et terminez par « s'il te plaît ».";
  const api = { parse, START, END, HINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Command = api;
})(typeof window !== 'undefined' ? window : globalThis);
