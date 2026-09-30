'use strict';
// Fond animé du thème J.A.R.V.I.S. : grands anneaux gradués dessinés une fois, animés en CSS (transform).
(function () {
  const host = document.getElementById('hudBg');
  if (!host) return;
  let built = false;

  function ring(size, draw, cls) {
    const c = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    c.style.width = size + 'px'; c.style.height = size + 'px';
    c.className = cls;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);
    draw(g, size / 2);
    host.appendChild(c);
  }

  function build() {
    if (built) return;
    built = true;
    const S = Math.min(1400, Math.max(window.innerWidth, window.innerHeight) * 1.1);
    ring(S, (g, R) => {
      g.strokeStyle = 'rgba(0,229,255,0.16)';
      g.lineWidth = 1;
      for (const r of [R - 4, R - 60, R * 0.62]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * Math.PI * 2;
        const len = i % 15 === 0 ? 26 : i % 5 === 0 ? 14 : 6;
        g.beginPath();
        g.moveTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8));
        g.lineTo(Math.cos(a) * (R - 8 - len), Math.sin(a) * (R - 8 - len));
        g.stroke();
      }
    }, 'r1');
    ring(S * 0.7, (g, R) => {
      g.strokeStyle = 'rgba(0,229,255,0.2)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(0, 0, R - 10, (i / 6) * Math.PI * 2, (i / 6) * Math.PI * 2 + 0.7);
        g.stroke();
      }
      g.lineWidth = 1;
      g.setLineDash([3, 9]);
      g.beginPath(); g.arc(0, 0, R - 40, 0, Math.PI * 2); g.stroke();
    }, 'r2');
  }

  function sync() {
    if (window.Theme && Theme.current() === 'jarvis') build();
  }
  window.addEventListener('themechange', sync);
  sync();
})();
