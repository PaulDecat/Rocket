'use strict';
// Gestion des thèmes : Theme.apply(nom), Theme.colors() pour les canvas.
(function () {
  const LIST = [
    { id: 'clean', name: 'Épuré sombre', desc: 'Sobre et lisible', bg: '#0d1117', surface: '#151b23', accent: '#4c9dff', line: '#3fb950' },
    { id: 'light', name: 'Clair', desc: 'Pour le plein jour', bg: '#f3f5f8', surface: '#ffffff', accent: '#2563eb', line: '#059669' },
    { id: 'terminal', name: 'Terminal', desc: 'Salle de marché', bg: '#000000', surface: '#111111', accent: '#ff9f1a', line: '#00d26a' },
    { id: 'jarvis', name: 'J.A.R.V.I.S.', desc: 'HUD futuriste animé', bg: '#020a16', surface: '#0a2038', accent: '#00e5ff', line: '#2dffb3' },
  ];
  const KEY = 'rocket.theme';
  let cached = null;

  function current() {
    const t = document.documentElement.getAttribute('data-theme');
    return LIST.some((x) => x.id === t) ? t : 'clean';
  }

  function colors() {
    if (cached && cached.theme === current()) return cached;
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    cached = {
      theme: current(),
      bg: v('--bg'), surface: v('--surface'), surface2: v('--surface-2'), surface3: v('--surface-3'), border: v('--border'), borderStrong: v('--border-strong'),
      accent: v('--accent'), accentRgb: v('--accent-rgb'), altRgb: v('--alt-rgb'), rocketRgb: v('--rocket-rgb'),
      strong: v('--strong'), text: v('--text'), muted: v('--muted'),
      green: v('--green'), greenRgb: v('--green-rgb'), red: v('--red'), redRgb: v('--red-rgb'), amberRgb: v('--amber-rgb'),
      font: v('--font'), fontNum: v('--font-num'), glow: v('--chart-glow') === '1',
    };
    return cached;
  }

  function apply(id) {
    if (!LIST.some((x) => x.id === id)) id = 'clean';
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    cached = null;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', LIST.find((x) => x.id === id).bg);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
  }

  window.Theme = { LIST, current, colors, apply };
})();
