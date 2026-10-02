'use strict';
// Règle des commandes : Rocket n'exécute une demande que si la phrase commence par « Ok Rocket »
// et se termine par « s'il te plaît ». La reconnaissance vocale déforme souvent ces mots :
// on accepte donc leurs variantes courantes (« roquette », « okay », « s'il vous plaît », « stp »…),
// et « Rocket » seul en début de phrase (le « Ok » est souvent avalé).
(function (root) {
  // Ce que la reconnaissance vocale entend souvent à la place de « Rocket » (« roquette »…).
  const NAME = "(?:rocket|rockets|roquettes?|rockett?e?s?|rokk?ett?e?s?|rocquett?e?s?|roquet|roket|rock[- ]?it|rock et|ro[- ]?quette|raquette)";
  const OK = "(?:ok|okay|oké|okey|okk?ay|o\\.\\s?k\\.?|au cas|hok|hey|eh|dis|alors)";
  const START = new RegExp(`^\\s*(?:${OK}\\s*[,.!:;-]*\\s*)?${NAME}(?![a-zà-ÿ])[\\s,.!:;-]*`, 'i');
  // « roquette » → « Rocket », sauf quand on parle de la salade (« de la roquette », « salade de roquette »).
  const NAME_ANY = new RegExp(`(^|[^a-zà-ÿ])(?<!(?:\\bla|\\bde|\\bdu|avec|salade|\\bet)\\s)${NAME}(?![a-zà-ÿ])`, 'gi');
  function normalize(text) {
    return String(text || '').replace(NAME_ANY, (m, pre) => pre + 'Rocket');
  }
  const END = /[\s,.;:-]*(?:s\s?['’`-]?\s?il[\s-]+(?:te|vous|tu)[\s-]+pla[iî]s?t?|si\s+te\s+pla[iî]t|s['’`]?\s?te\s+pla[iî]t|steu?pla[iî]t|stp|svp)[\s.!?…]*$/i;

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
