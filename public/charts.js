'use strict';
// Moteur de graphiques canvas : redessin à la demande, animation courte, réticule au survol.
(function () {
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const nfCache = {};
  function fmt(v, d = 2) {
    if (v == null || !isFinite(v)) return '—';
    const k = d;
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    return nfCache[k].format(v);
  }
  function autoDec(v) { const a = Math.abs(v); return a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(t, span) {
    const d = new Date(t);
    if (span < 1.5 * 864e5) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    if (span < 10 * 864e5) return `${JOURS[d.getDay()]} ${pad2(d.getHours())}h`;
    if (span < 200 * 864e5) return `${d.getDate()} ${MOIS[d.getMonth()]}`;
    if (span < 3 * 365 * 864e5) return `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return String(d.getFullYear());
  }
  function fmtDateLong(t, span) {
    const d = new Date(t);
    const day = `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
    return span < 10 * 864e5 ? `${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : day;
  }
  function rgba(rgb, a) { return `rgba(${rgb}, ${a})`; }
  const ease = (x) => 1 - Math.pow(1 - x, 3);

  class HudChart {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.spec = null;
      this.hover = null;
      this.progress = 1;
      this.raf = 0;
      this.animStart = 0;
      this.w = 0; this.h = 0;
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      else window.addEventListener('resize', () => this.resize());
      window.addEventListener('themechange', () => this.request());
      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
        this.request();
      });
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.request(); });
      this.resize();
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === this.w && h === this.h && this.dpr === dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = w * dpr; this.c.height = h * dpr;
      this.request();
    }

    // Un seul requestAnimationFrame à la fois.
    request() {
      if (this.raf) return;
      this.raf = requestAnimationFrame((now) => {
        this.raf = 0;
        if (this.animStart) {
          const p = Math.min(1, (now - this.animStart) / 700);
          this.progress = ease(p);
          if (p >= 1) this.animStart = 0;
        }
        this.draw();
        if (this.animStart) this.request();
      });
    }

    show(spec, animate = true) {
      this.spec = spec ? this.normalize(spec) : null;
      this.hover = null;
      if (animate && this.spec && !matchMedia('(prefers-reduced-motion: reduce)').matches) { this.progress = 0; this.animStart = performance.now(); }
      else { this.progress = 1; this.animStart = 0; }
      this.resize();
      this.request();
    }

    clear() { this.show(null, false); }

    normalize(spec) {
      const s = { ...spec };
      if (s.type === 'line' || s.type === 'multi') {
        s.series = (s.series || []).map((x) => ({ ...x, points: (x.points || []).filter((p) => p && isFinite(p.v)).map((p) => ({ t: p.t, v: p.v })) })).filter((x) => x.points.length > 1);
        if (s.type === 'multi' && s.rebase) {
          s.series = s.series.map((x) => { const b = x.points[0].v; return { ...x, points: x.points.map((p) => ({ t: p.t, v: (p.v / b) * 100 })) }; });
          s.unit = 'base 100';
          s.decimals = 1;
        }
      }
      return s;
    }

    draw() {
      const g = this.g, dpr = this.dpr || 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      const s = this.spec;
      if (!s) return;
      const C = window.Theme ? Theme.colors() : {};
      this.C = C;
      if (s.type === 'bars') return this.drawBars(s, C);
      if (s.type === 'vbars') return this.drawVBars(s, C);
      if ((s.series || []).length) return this.drawLines(s, C);
    }

    drawLines(s, C) {
      const g = this.g, W = this.w, H = this.h;
      const multi = s.series.length > 1 || s.type === 'multi';
      const L = 8, R = 70, T = multi ? 30 : 14, B = 26;
      const pw = W - L - R, ph = H - T - B;
      if (pw < 20 || ph < 20) return;
      let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (const x of s.series) for (const p of x.points) {
        if (p.t < tMin) tMin = p.t; if (p.t > tMax) tMax = p.t;
        if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v;
      }
      if (vMax === vMin) { vMax += 1; vMin -= 1; }
      const m = (vMax - vMin) * 0.08; vMin -= m; vMax += m;
      const span = tMax - tMin || 1;
      const X = (t) => L + ((t - tMin) / span) * pw;
      const Y = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * ph;
      const dec = s.decimals != null ? s.decimals : autoDec(vMax);
      const font = C.fontNum || 'sans-serif';

      // Grille + axe des prix
      g.font = `11px ${font}`;
      g.textBaseline = 'middle';
      g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const v = vMin + ((vMax - vMin) * i) / 4;
        const y = Math.round(Y(v)) + 0.5;
        g.strokeStyle = rgba(C.accentRgb || '128,128,128', C.theme === 'light' ? 0.1 : 0.08);
        g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
        g.fillStyle = C.muted; g.textAlign = 'left';
        g.fillText(fmt(v, dec), L + pw + 8, y);
      }
      // Dates
      g.textBaseline = 'top'; g.textAlign = 'center';
      const n = Math.max(2, Math.min(6, Math.floor(pw / 90)));
      for (let i = 0; i <= n; i++) {
        const t = tMin + (span * i) / n;
        const x = X(t);
        g.fillStyle = C.muted;
        g.textAlign = i === 0 ? 'left' : i === n ? 'right' : 'center';
        g.fillText(fmtDate(t, span), x, T + ph + 8);
      }

      const palette = [C.accent, `rgb(${C.altRgb})`, `rgb(${C.amberRgb})`, C.green, `rgb(${C.rocketRgb})`];
      const clipW = pw * this.progress;
      g.save();
      g.beginPath(); g.rect(L - 2, 0, clipW + 4, H); g.clip();
      s.series.forEach((ser, si) => {
        const pts = ser.points;
        const up = pts[pts.length - 1].v >= pts[0].v;
        const col = multi ? palette[si % palette.length] : (s.color || (up ? C.green : C.red));
        const colRgb = multi ? null : (up ? C.greenRgb : C.redRgb);
        g.beginPath();
        pts.forEach((p, i) => { const x = X(p.t), y = Y(p.v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        if (!multi) {
          g.save();
          g.lineTo(X(pts[pts.length - 1].t), T + ph); g.lineTo(X(pts[0].t), T + ph); g.closePath();
          const grad = g.createLinearGradient(0, T, 0, T + ph);
          grad.addColorStop(0, rgba(colRgb, C.theme === 'light' ? 0.18 : 0.26));
          grad.addColorStop(1, rgba(colRgb, 0));
          g.fillStyle = grad; g.fill();
          g.restore();
          g.beginPath();
          pts.forEach((p, i) => { const x = X(p.t), y = Y(p.v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        }
        g.strokeStyle = col; g.lineWidth = multi ? 2 : 2.2; g.lineJoin = 'round';
        if (C.glow) { g.shadowColor = col; g.shadowBlur = 10; }
        g.stroke();
        g.shadowBlur = 0;
        ser._col = col;
      });
      g.restore();

      // Dernier cours étiqueté
      if (this.progress >= 1) {
        s.series.forEach((ser) => {
          const p = ser.points[ser.points.length - 1];
          const x = X(p.t), y = Y(p.v);
          g.fillStyle = ser._col;
          g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
          if (!multi) {
            const label = fmt(p.v, dec);
            g.font = `600 12px ${font}`;
            const tw = g.measureText(label).width + 10;
            const ly = Math.max(T + 9, Math.min(T + ph - 9, y));
            g.fillStyle = ser._col;
            g.fillRect(L + pw + 3, ly - 10, Math.min(tw, R - 4), 20);
            g.fillStyle = C.theme === 'light' ? '#fff' : '#000';
            g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText(label, L + pw + 8, ly);
          }
        });
      }

      // Légende
      if (multi) {
        g.font = `600 12px ${C.font || 'sans-serif'}`;
        g.textBaseline = 'middle'; g.textAlign = 'left';
        let lx = L;
        s.series.forEach((ser) => {
          const last = ser.points[ser.points.length - 1].v, first = ser.points[0].v;
          const pct = ((last - first) / first) * 100;
          const txt = `${ser.name}  ${pct >= 0 ? '+' : ''}${fmt(pct, 1)} %`;
          g.fillStyle = ser._col; g.fillRect(lx, 9, 12, 3);
          g.fillStyle = C.text; g.fillText(txt, lx + 16, 11);
          lx += g.measureText(txt).width + 34;
        });
        if (s.unit) { g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText(s.unit, L + pw + R - 4, 11); }
      }

      // Réticule
      const hv = this.hover;
      if (hv && this.progress >= 1 && hv.x >= L && hv.x <= L + pw) {
        const t = tMin + ((hv.x - L) / pw) * span;
        const ref = s.series[0].points;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < ref.length; i++) { const d = Math.abs(ref[i].t - t); if (d < bd) { bd = d; bi = i; } }
        const pt = ref[bi];
        const x = Math.round(X(pt.t)) + 0.5;
        g.strokeStyle = C.borderStrong; g.setLineDash([3, 4]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke();
        g.setLineDash([]);
        const lines = [fmtDateLong(pt.t, span)];
        s.series.forEach((ser) => {
          let q = ser.points[0], qd = Infinity;
          for (const p of ser.points) { const d = Math.abs(p.t - pt.t); if (d < qd) { qd = d; q = p; } }
          g.fillStyle = ser._col; g.beginPath(); g.arc(X(q.t), Y(q.v), 4, 0, Math.PI * 2); g.fill();
          lines.push(`${multi ? ser.name + ' : ' : ''}${fmt(q.v, dec)}${s.unit && !multi ? ' ' + s.unit : ''}`);
        });
        g.font = `12px ${C.font || 'sans-serif'}`;
        const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 16, bh = lines.length * 17 + 8;
        let bx = x + 10; if (bx + bw > L + pw) bx = x - 10 - bw;
        const by = T + 4;
        g.fillStyle = C.surface2 || '#222'; g.strokeStyle = C.borderStrong;
        g.beginPath(); g.rect(bx, by, bw, bh); g.fill(); g.stroke();
        g.textAlign = 'left'; g.textBaseline = 'top';
        lines.forEach((l, i) => { g.fillStyle = i ? C.strong : C.muted; g.fillText(l, bx + 8, by + 5 + i * 17); });
      }
    }

    // Barres horizontales de variation : items [{label, value}]
    drawBars(s, C) {
      const g = this.g, W = this.w, H = this.h;
      const items = s.items || [];
      if (!items.length) return;
      const labelW = Math.min(160, W * 0.3), valW = 84;
      const rowH = Math.max(14, Math.min(46, (H - 12) / items.length));
      const T = Math.max(6, (H - rowH * items.length) / 2);
      const maxAbs = Math.max(0.5, ...items.map((i) => Math.abs(i.value)));
      const plotL = labelW + 12, plotW = W - plotL - valW - 8;
      const zero = plotL + plotW / 2;
      g.textBaseline = 'middle';
      g.strokeStyle = C.borderStrong; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(zero) + 0.5, T); g.lineTo(Math.round(zero) + 0.5, T + rowH * items.length); g.stroke();
      const fs = rowH < 22 ? 12 : rowH < 34 ? 14 : 16;
      items.forEach((it, i) => {
        const y = T + i * rowH + rowH / 2;
        const bh = Math.max(6, Math.min(26, rowH * 0.58));
        const len = (Math.abs(it.value) / maxAbs) * (plotW / 2 - 2) * this.progress;
        const up = it.value >= 0;
        g.font = `${fs}px ${C.font}`;
        g.fillStyle = C.strong; g.textAlign = 'right';
        g.fillText(it.label, labelW, y);
        g.fillStyle = up ? C.green : C.red;
        if (C.glow) { g.shadowColor = g.fillStyle; g.shadowBlur = 8; }
        g.fillRect(up ? zero : zero - len, y - bh / 2, len, bh);
        g.shadowBlur = 0;
        g.font = `600 ${fs - 1}px ${C.fontNum}`;
        g.textAlign = 'right';
        g.fillText(`${up ? '+' : ''}${fmt(it.value, 2)} %`, W - 6, y);
      });
    }

    // Barres verticales par catégorie : series [{name, points:[{x (libellé), y}]}]
    drawVBars(s, C) {
      const g = this.g, W = this.w, H = this.h;
      const ser = s.series || [];
      if (!ser.length) return;
      const cats = ser[0].points.map((p) => String(p.label));
      const L = 8, R = 60, T = ser.length > 1 ? 30 : 12, B = 30;
      const pw = W - L - R, ph = H - T - B;
      let vMax = 0, vMin = 0;
      ser.forEach((x) => x.points.forEach((p) => { vMax = Math.max(vMax, p.y); vMin = Math.min(vMin, p.y); }));
      if (vMax === vMin) vMax = 1;
      const m = (vMax - vMin) * 0.1; vMax += vMax > 0 ? m : 0; vMin -= vMin < 0 ? m : 0;
      const Y = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * ph;
      const dec = s.decimals != null ? s.decimals : autoDec(Math.max(Math.abs(vMax), Math.abs(vMin)));
      const palette = [C.accent, `rgb(${C.altRgb})`, `rgb(${C.amberRgb})`, C.green, `rgb(${C.rocketRgb})`];
      g.font = `11px ${C.fontNum}`; g.textBaseline = 'middle'; g.textAlign = 'left';
      for (let i = 0; i <= 4; i++) {
        const v = vMin + ((vMax - vMin) * i) / 4, y = Math.round(Y(v)) + 0.5;
        g.strokeStyle = rgba(C.accentRgb, 0.08); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
        g.fillStyle = C.muted; g.fillText(fmt(v, dec), L + pw + 8, y);
      }
      const groupW = pw / cats.length, barW = Math.min(46, (groupW * 0.7) / ser.length);
      cats.forEach((cat, ci) => {
        const gx = L + ci * groupW + groupW / 2 - (barW * ser.length) / 2;
        ser.forEach((x, si) => {
          const p = x.points[ci]; if (!p) return;
          const y0 = Y(0), y1 = Y(p.y * this.progress);
          g.fillStyle = palette[si % palette.length];
          if (C.glow) { g.shadowColor = g.fillStyle; g.shadowBlur = 8; }
          g.fillRect(gx + si * barW + 2, Math.min(y0, y1), barW - 4, Math.abs(y1 - y0));
          g.shadowBlur = 0;
          if (this.progress >= 1 && barW > 26) {
            g.fillStyle = C.strong; g.textAlign = 'center'; g.font = `600 11px ${C.fontNum}`;
            g.fillText(fmt(p.y, dec), gx + si * barW + barW / 2, Math.min(y0, y1) - 8);
          }
        });
        g.fillStyle = C.muted; g.textAlign = 'center'; g.font = `12px ${C.font}`;
        g.fillText(cat.length > 14 ? cat.slice(0, 13) + '…' : cat, L + ci * groupW + groupW / 2, T + ph + 14);
      });
      if (ser.length > 1) {
        let lx = L; g.textAlign = 'left'; g.font = `600 12px ${C.font}`;
        ser.forEach((x, si) => { g.fillStyle = palette[si % palette.length]; g.fillRect(lx, 9, 12, 3); g.fillStyle = C.text; g.fillText(x.name, lx + 16, 11); lx += g.measureText(x.name).width + 34; });
      }
      if (s.unit) { g.fillStyle = C.muted; g.textAlign = 'right'; g.font = `12px ${C.font}`; g.fillText(s.unit, W - 4, T - 6 > 6 ? T - 6 : 8); }
    }
  }

  // Mini-sparkline (dessinée une seule fois).
  function sparkline(canvas, values, up) {
    const C = window.Theme ? Theme.colors() : {};
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 56, h = canvas.clientHeight || 26;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!values || values.length < 2) return;
    const min = Math.min(...values), max = Math.max(...values), r = max - min || 1;
    g.beginPath();
    values.forEach((v, i) => { const x = (i / (values.length - 1)) * (w - 2) + 1, y = h - 2 - ((v - min) / r) * (h - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = up ? C.green : C.red; g.lineWidth = 1.5; g.stroke();
  }

  window.HudChart = HudChart;
  window.ChartUtil = { fmt, fmtDate, fmtDateLong, autoDec, sparkline };
})();
