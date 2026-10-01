'use strict';
// Règle des commandes : Rocket n'exécute une demande que si la phrase
// commence par « Ok Rocket » et se termine par « s'il te plaît ».
(function (root) {
  // Ce que la reconnaissance vocale entend souvent à la place de « Rocket » (« roquette »…).
  const NAME = "(?:rocket|rockets|roquettes?|rockett?e?s?|rokk?ett?e?s?|rocquettes?|roket|rock[- ]?it|raquette)";
  const START = new RegExp(`^\\s*(?:ok|okay|oké|okey|o\\.\\s?k\\.?)\\s*[,.!:;-]*\\s*${NAME}(?![a-zà-ÿ])[\\s,.!:;-]*`, 'i');
  // « roquette » → « Rocket », sauf quand on parle de la salade (« de la roquette », « salade de roquette »).
  const NAME_ANY = new RegExp(`(^|[^a-zà-ÿ])(?<!(?:\\bla|\\bde|\\bdu|avec|salade|\\bet)\\s)${NAME}(?![a-zà-ÿ])`, 'gi');
  function normalize(text) {
    return String(text || '').replace(NAME_ANY, (m, pre) => pre + 'Rocket');
  }
  const END = /[\s,.;:-]*s\s?['’`]?\s?il\s+te\s+pla[iî]t[\s.!?]*$/i;

  // { wake: commence par « Ok Rocket », complete: règle respectée, question: la demande seule }
  function parse(text) {
    const t = normalize(text).trim();
    const s = t.match(START);
    if (!s) return { wake: false, complete: false, question: '' };
    const rest = t.slice(s[0].length);
    const e = rest.match(END);
    if (!e) return { wake: true, complete: false, question: rest.trim() };
    const question = rest.slice(0, e.index).trim().replace(/[,;:]+$/, '').trim();
    return { wake: true, complete: true, question };
  }

  const HINT = "Commencez par « Ok Rocket » et terminez par « s'il te plaît ».";
  const api = { parse, normalize, START, END, HINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Command = api;
})(typeof window !== 'undefined' ? window : globalThis);
