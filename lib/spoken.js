'use strict';
// Réponses de Claude en flux : le texte parlé est transmis au fil de l'eau, et l'éventuelle
// consigne de graphique (ligne « [[VISUEL]] {json} » à la fin) est mise de côté.

const MARKER = '[[VISUEL]]';

function createSpokenFilter(onSpoken) {
  let pending = '';   // texte reçu mais pas encore transmis (peut contenir le début du marqueur)
  let spoken = '';
  let visual = '';
  let inVisual = false;

  function emit(t) {
    if (!t) return;
    spoken += t;
    if (onSpoken) onSpoken(t);
  }

  function feed(delta) {
    if (!delta) return;
    if (inVisual) { visual += delta; return; }
    pending += delta;
    const i = pending.indexOf(MARKER);
    if (i >= 0) {
      emit(pending.slice(0, i));
      visual += pending.slice(i + MARKER.length);
      pending = '';
      inVisual = true;
      return;
    }
    // On garde la fin si elle pourrait être le début du marqueur (« [[VIS… »).
    let keep = 0;
    for (let k = Math.min(MARKER.length - 1, pending.length); k > 0; k--) {
      if (MARKER.startsWith(pending.slice(-k))) { keep = k; break; }
    }
    emit(pending.slice(0, pending.length - keep));
    pending = pending.slice(pending.length - keep);
  }

  function end() {
    if (!inVisual) emit(pending);
    pending = '';
    let parsed = null;
    const m = visual.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (e) { parsed = null; } }
    return { text: spoken.trim(), visual: parsed };
  }

  return { feed, end, get text() { return spoken; } };
}

const VISUAL_INSTRUCTIONS = `Graphiques : si un graphique aide vraiment, termine ta réponse par une ligne séparée « [[VISUEL]] » suivie d'un objet JSON sur une seule ligne, au choix :
{"market":[{"symbol":"^FCHI","name":"CAC 40","range":"1y"}]} pour des actifs cotés (symboles Yahoo Finance, 4 au plus ; range parmi 1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max),
{"chart":{"title":"…","kind":"line","unit":"…","source":"…","series":[{"name":"…","points":[{"x":"2024-01","y":1.2}]}]}} pour des données réelles non cotées (au moins 2 points datés, source obligatoire),
{"figure":{"label":"…","value":"…","unit":"…","date":"…","change":"…","source":"…"}} pour un chiffre clé.
Cette ligne n'est jamais lue à voix haute. N'écris jamais « [[VISUEL]] » dans un autre cas.
Commence directement par la réponse : pas de phrase d'attente du type « je vais chercher ».`;

module.exports = { createSpokenFilter, MARKER, VISUAL_INSTRUCTIONS };
