'use strict';
// ROCKET v2 — logique de l'interface.
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = ChartUtil.fmt;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const SORRY = "Désolé Monsieur, je n'ai pas compris.";
  const PAGES = ['cuisine', 'cine', 'coach', 'planning'];
  const PAGE_TITLES = { cuisine: ['Cuisine', 'Recettes de saison'], cine: ['Actu ciné', 'Les dernières nouvelles du cinéma'], coach: ['Coach hygiène de vie', 'Vos habitudes du jour'], planning: ['Planning', 'Vos rendez-vous'] };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const S = {
    config: null, briefing: null, bySym: {}, script: [], chapters: [],
    idx: 0, playing: false, paused: false, runToken: 0, resumeWait: null,
    view: 'briefing', visual: null, prevVisual: null, detail: null,
    history: [], asking: false, coreState: 'idle', host: null, mini: 'bourse', autoPaused: false, micErrorAt: 0, queue: [], fromVoice: false, talkId: 0,
    intradayCache: new Map(), started: false,
  };

  // ---------- Formats ----------
  function priceTxt(m, v = m.price) {
    const d = m.decimals;
    if (m.unit === '%') return `${fmt(v, d)} %`;
    if (m.unit === '$' && m.symbol !== 'EURUSD=X') return `${fmt(v, d)} $`;
    return fmt(v, d);
  }
  function pctTxt(v, d = 2) { return `${v > 0 ? '+' : ''}${fmt(v, d)} %`; }
  function dirCls(v) { return v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat'; }
  function arrow(v) { return v > 0.005 ? '▲' : v < -0.005 ? '▼' : '■'; }
  function longDate(d = new Date()) { return `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; }
  function hhmm(t) { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  // ---------- Thèmes ----------
  function renderThemeChoices() {
    const cur = Theme.current();
    $('themeCards').innerHTML = Theme.LIST.map((t) => `
      <button type="button" class="theme-card" role="radio" aria-checked="${t.id === cur}" data-theme-id="${t.id}">
        <div class="preview" style="background:${t.bg}">
          <b style="background:${t.accent}"></b>
          <i><svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="100%"><polyline fill="none" stroke="${t.line}" stroke-width="2.5" points="0,24 15,20 30,22 45,12 60,15 75,6 100,9"/></svg></i>
        </div>
        <div class="name">${t.name}</div><div class="desc">${t.desc}</div>
      </button>`).join('');
    $('styleMenu').innerHTML = Theme.LIST.map((t) => `<button type="button" role="menuitemradio" aria-checked="${t.id === cur}" data-theme-id="${t.id}">${t.name}</button>`).join('');
  }
  function onThemeClick(e) {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    Theme.apply(b.dataset.themeId);
    renderThemeChoices();
    if (e.currentTarget.id === 'styleMenu') toggleStyleMenu(false);
  }
  function toggleStyleMenu(open) {
    const m = $('styleMenu');
    open = open == null ? m.hidden : open;
    m.hidden = !open;
    $('styleBtn').setAttribute('aria-expanded', String(open));
  }

  // ---------- Horloge ----------
  let lastMinute = -1;
  function tickClock() {
    const d = new Date();
    $('secRing').style.strokeDasharray = `${d.getSeconds() || 0.01} 60`;
    if (d.getMinutes() !== lastMinute) {
      lastMinute = d.getMinutes();
      $('clockTime').textContent = hhmm(d);
      $('clockDay').textContent = JOURS[d.getDay()];
      $('clockDate').textContent = longDate(d);
      if (S.started) checkReminders(d);
    }
  }

  // ---------- Données ----------
  async function loadConfig() {
    try {
      S.config = await (await fetch('/api/config')).json();
    } catch (e) {
      S.config = { tts: 'browser', voices: [], defaultVoices: {}, ai: 'local' };
    }
    Voice.configure(S.config);
    fillSettings();
  }

  async function loadBriefing(refresh) {
    const r = await fetch('/api/briefing' + (refresh ? '?refresh' : ''));
    if (!r.ok) throw new Error('Briefing HTTP ' + r.status);
    const b = await r.json();
    S.briefing = b;
    S.bySym = Object.fromEntries(b.markets.map((m) => [m.symbol, m]));
    Views.setData(b);
    if (!S.playing) { S.script = withPlanning(b.script); buildChapters(); }
    S.intradayCache.clear();
    renderAll();
    return b;
  }

  // Ajoute au podcast une réplique « agenda » si des rendez-vous sont prévus aujourd'hui.
  function withPlanning(script) {
    const today = Views.Planning.upcoming(0).filter((e) => e.date === new Date().toLocaleDateString('sv-SE'));
    if (!today.length) return script;
    const seg = {
      speaker: 'rocket', host: 'Rocket', visual: { type: 'page', view: 'planning', label: 'Agenda' },
      text: `Côté agenda, Monsieur, vous avez aujourd'hui ${today.length > 1 ? today.length + ' rendez-vous' : 'un rendez-vous'} : ${today.map((e) => `${e.title}${Views.timeSpoken(e.time)}`).join(', puis ')}.`,
    };
    const i = script.findIndex((x) => x.visual && x.visual.recap);
    const out = script.slice();
    out.splice(i < 0 ? out.length - 1 : i, 0, seg);
    return out;
  }

  function renderAll() {
    renderPill();
    renderMarkets();
    renderPolitics();
    renderMini();
    renderNews();
    updatePlanningBadge();
    renderChapters();
    renderTicker();
    updateProgress();
    if (!S.visual) showVisual({ type: 'intro' }, false);
    else if (S.view === 'radar') showVisual({ type: 'radar' }, false);
    else if (PAGES.includes(S.view) && !S.playing && !$('overlay').contains(document.activeElement)) showVisual({ type: 'page', view: S.view }, false);
  }

  function renderPolitics() {
    const items = S.briefing.politics || [];
    $('politicsList').innerHTML = items.map((n, i) => `
      <li><button type="button" data-pol="${i}"><span class="nt">${esc(n.title)}</span><span class="ns">${esc(n.source)} · ${esc(hhmm(n.time))}</span></button></li>`).join('')
      || '<li class="rc-empty">Pas d\'actualité politique pour le moment.</li>';
  }

  // Mini-onglets « Bourse / Politique »
  function setMini(name) {
    S.mini = name;
    document.querySelectorAll('.mini-tab').forEach((t) => { const on = t.dataset.mini === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
    $('paneBourse').hidden = name !== 'bourse';
    $('panePolitique').hidden = name !== 'politique';
    const pane = name === 'bourse' ? $('paneBourse') : $('panePolitique');
    pane.classList.remove('pane-in'); void pane.offsetWidth; pane.classList.add('pane-in');
    if (name === 'bourse') drawSparklines();
  }

  function updatePlanningBadge() {
    const n = Views.Planning.todayCount();
    const b = $('planningBadge');
    b.hidden = !n;
    b.textContent = n;
  }

  function renderPill() {
    const l = S.briefing.live;
    const p = $('livePill');
    const full = l.markets === true && l.news;
    $('miniLive').classList.toggle('on', l.markets !== false || l.politics);
    const none = l.markets === false && !l.news;
    p.className = 'pill ' + (full ? 'pill-live' : none ? 'pill-demo' : 'pill-partial');
    p.textContent = full ? 'LIVE' : none ? 'DÉMO' : 'PARTIEL';
    p.title = full ? 'Données en direct' : none ? 'Sources injoignables : données de démonstration' : 'Une partie des données est en démo';
  }

  function renderMarkets() {
    const ul = $('marketList');
    ul.innerHTML = S.briefing.markets.map((m) => `
      <li class="market-row" tabindex="0" role="button" data-sym="${esc(m.symbol)}" aria-label="${esc(m.name)} ${esc(priceTxt(m))} ${esc(pctTxt(m.changePct))}">
        <span class="mname">${esc(m.name)}</span>
        <span class="mprice num">${esc(priceTxt(m))}</span>
        <span class="mchg num ${dirCls(m.changePct)}">${arrow(m.changePct)} ${esc(pctTxt(m.changePct))}</span>
        <canvas width="56" height="26" aria-hidden="true"></canvas>
      </li>`).join('');
    drawSparklines();
  }
  function drawSparklines() {
    if (!S.briefing) return;
    $('marketList').querySelectorAll('.market-row').forEach((row) => {
      const m = S.bySym[row.dataset.sym];
      const vals = m.history.slice(-23).map((p) => p.v);
      ChartUtil.sparkline(row.querySelector('canvas'), vals, vals[vals.length - 1] >= vals[0]);
    });
  }

  function renderMini() {
    $('miniQuotes').innerHTML = ['^FCHI', '^GSPC', 'EURUSD=X', 'BTC-USD'].map((s) => {
      const m = S.bySym[s];
      return `<span><b>${esc(m.short)}</b><span class="num">${esc(priceTxt(m))}</span> <span class="num ${dirCls(m.changePct)}">${arrow(m.changePct)}${esc(fmt(Math.abs(m.changePct), 2))} %</span></span>`;
    }).join('');
  }

  function renderNews() {
    $('newsList').innerHTML = S.briefing.news.map((n, i) => `
      <li data-i="${i}"><button type="button" data-news="${i}"><span class="nt">${esc(n.title)}</span><span class="ns">${esc(n.source)} · ${esc(hhmm(n.time))}</span></button></li>`).join('');
  }

  function renderTicker() {
    const items = S.briefing.markets.map((m) => `<button type="button" class="ticker-item" data-sym="${esc(m.symbol)}">${esc(m.name)} <span class="tp">${esc(priceTxt(m))}</span> <span class="${dirCls(m.changePct)}">${arrow(m.changePct)} ${esc(fmt(Math.abs(m.changePct), 2))} %</span></button>`)
      .concat(S.briefing.news.map((n, i) => `<button type="button" class="ticker-item news" data-news="${i}">${esc(n.title)}</button>`)).join('');
    const track = $('tickerTrack');
    track.innerHTML = items + items; // deux copies pour une boucle sans couture
    requestAnimationFrame(() => {
      const half = track.scrollWidth / 2;
      track.style.setProperty('--ticker-dur', `${Math.max(40, Math.round(half / 45))}s`);
    });
  }

  function buildChapters() {
    const ch = [];
    S.script.forEach((seg, i) => {
      const label = seg.visual.label || '—';
      if (!ch.length || ch[ch.length - 1].label !== label) ch.push({ label, start: i });
    });
    S.chapters = ch;
  }
  function renderChapters() {
    $('chapters').innerHTML = S.chapters.map((c, i) => `<li data-ch="${i}"><button type="button" data-seg="${c.start}"><span>${esc(c.label)}</span><span class="num">${i + 1}</span></button></li>`).join('');
  }
  function updateProgress() {
    const n = S.script.length || 1;
    const frac = S.playing || S.idx > 0 ? Math.min(1, (S.idx + (S.playing ? 0.5 : 0)) / n) : 0;
    $('progressBar').style.transform = `scaleX(${frac})`;
    let cur = 0;
    S.chapters.forEach((c, i) => { if (S.idx >= c.start) cur = i; });
    $('chapters').querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('current', i === cur && (S.playing || S.idx > 0));
      li.classList.toggle('done', i < cur);
    });
    const seg = S.script[S.idx];
    const ni = seg && seg.visual.type === 'news' ? seg.visual.index : -1;
    $('newsList').querySelectorAll('li').forEach((li, i) => li.classList.toggle('current', i === ni && (S.playing || S.idx > 0)));
  }

  // ---------- Scène ----------
  let chart;
  function setStage(label, meta) { $('stageLabel').textContent = label; $('stageMeta').textContent = meta || ''; }
  function setOverlay(html) {
    const o = $('overlay');
    o.classList.remove('fade-in');
    o.innerHTML = html || '';
    if (html) { void o.offsetWidth; o.classList.add('fade-in'); }
  }

  function historyPoints(m, n) { return m.history.slice(-n).map((p) => ({ t: p.t, v: p.v })); }

  function showVisual(v, animate = true) {
    if (!v || !S.briefing) return;
    if (v.type !== 'detail') closeDetail(true);
    S.visual = v;
    $('stage').querySelector('.stage-body').classList.toggle('page-mode', v.type === 'radar' || v.type === 'page');
    const b = S.briefing;
    switch (v.type) {
      case 'intro': {
        chart.clear();
        setStage('Morning économique', longDate());
        setOverlay(`<div class="ov-center"><div class="ov-logo">ROCKET</div><div class="ov-date">${esc(longDate())}</div>
          <div class="ov-prog">${['Europe', 'Wall Street', 'Asie', 'Taux et devises', 'Matières premières', 'Radar invest', 'Actualité', 'Politique'].map((x) => `<span>${x}</span>`).join('')}</div></div>`);
        break;
      }
      case 'outro': {
        chart.clear();
        setStage('À demain matin', longDate());
        setOverlay(`<div class="ov-center"><div class="ov-logo">ROCKET</div><div class="ov-date">Excellente journée — à demain matin</div></div>`);
        break;
      }
      case 'overview': {
        setOverlay('');
        const items = [...b.markets].sort((a, c) => c.changePct - a.changePct).map((m) => ({ label: m.name, value: m.changePct }));
        setStage(v.recap ? 'Récapitulatif' : "Vue d'ensemble", 'Variation sur la dernière séance');
        chart.show({ type: 'bars', items }, animate);
        break;
      }
      case 'line': {
        const m = S.bySym[v.symbol];
        if (!m) return;
        setOverlay('');
        setStage(m.name, `${priceTxt(m)}  ·  ${pctTxt(m.changePct)} séance  ·  ${pctTxt(m.monthPct, 1)} sur 1 mois`);
        chart.show({ type: 'line', series: [{ name: m.name, points: historyPoints(m, 23) }], decimals: m.decimals, unit: m.unit === 'pts' ? 'pts' : m.unit }, animate);
        break;
      }
      case 'compare': {
        setOverlay('');
        const items = v.symbols.map((s) => S.bySym[s]).filter(Boolean).map((m) => ({ label: m.name, value: m.changePct }));
        setStage(v.title || 'Comparaison', 'Variation sur la dernière séance');
        chart.show({ type: 'bars', items }, animate);
        break;
      }
      case 'radar': {
        chart.clear();
        setStage('Radar invest', 'Signaux techniques du jour');
        setOverlay(radarHtml());
        break;
      }
      case 'news': {
        chart.clear();
        const n = b.news[v.index];
        if (!n) return;
        setStage('Actualité', `${v.index + 1} / ${b.news.length}`);
        const title = n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title);
        setOverlay(`<article class="news-card"><div class="nc-top">Actu ${v.index + 1} / ${b.news.length} · ${esc(n.source)}</div><div class="nc-title">${title}</div><div class="nc-meta">${esc(hhmm(n.time))}</div></article>`);
        break;
      }
      case 'politics': {
        chart.clear();
        const list = b.politics || [];
        const n = list[v.index];
        if (!n) return;
        setStage('Politique', `${v.index + 1} / ${list.length}`);
        const title = n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title);
        setOverlay(`<article class="news-card politics"><div class="nc-top">Politique ${v.index + 1} / ${list.length} · ${esc(n.source)}</div><div class="nc-title">${title}</div><div class="nc-meta">${esc(hhmm(n.time))}</div></article>`);
        break;
      }
      case 'page': {
        chart.clear();
        const [t, meta] = PAGE_TITLES[v.view];
        setStage(t, meta);
        setOverlay(Views.render(v.view));
        break;
      }
      case 'custom': {
        setOverlay('');
        showCustom(v, animate);
        break;
      }
      case 'figure': {
        chart.clear();
        setStage(v.label, v.source ? `Source : ${v.source}` : '');
        const ch = v.change ? `<div class="f-change ${/^[-−]/.test(v.change) ? 'down' : /^\+/.test(v.change) ? 'up' : ''}">${esc(v.change)}</div>` : '';
        setOverlay(`<div class="figure"><div class="f-label">${esc(v.label)}</div><div class="f-value">${esc(v.value)}<span class="f-unit">${esc(v.unit)}</span></div>${ch}<div class="f-meta">${esc([v.date, v.source].filter(Boolean).join(' · '))}</div></div>`);
        break;
      }
      case 'detail':
        openDetail(v.symbol, v.period);
        break;
      default:
        break;
    }
  }

  function showCustom(v, animate) {
    const series = v.series || [];
    const catX = series.some((s) => s.points.some((p) => typeof p.x !== 'number'));
    setStage(v.title || 'Graphique', [v.unit, v.source ? `Source : ${v.source}` : ''].filter(Boolean).join('  ·  '));
    if (v.kind === 'bar' || catX) {
      chart.show({ type: 'vbars', unit: v.unit, series: series.map((s) => ({ name: s.name, points: s.points.map((p) => ({ label: typeof p.x === 'number' ? new Date(p.x).getFullYear() : p.x, y: p.y })) })) }, animate);
      return;
    }
    const ser = series.map((s) => ({ name: s.name, points: s.points.map((p) => ({ t: p.x, v: p.y })).sort((a, c) => a.t - c.t) }));
    if (ser.length > 1) chart.show({ type: 'multi', series: ser, rebase: !!v.rebase, unit: v.unit }, animate);
    else chart.show({ type: 'line', series: ser, unit: v.unit }, animate);
  }

  function radarHtml() {
    const r = S.briefing.radar;
    const tp = r.topPick;
    const card = (s) => `<button type="button" class="rcard" data-sym="${esc(s.symbol)}"><b>${esc(s.name)}</b> <span class="rc-title">— ${esc(s.title)}</span><div class="rc-text">${esc(s.text)}</div><div class="rc-meta">Conviction ${esc(s.conviction)} · Risque ${esc(s.risk)} · <span class="${dirCls(s.changePct)}">${esc(pctTxt(s.changePct))}</span></div></button>`;
    const col = (kind, title, list) => `<div class="radar-col ${kind}"><h3>${title}</h3>${list.length ? list.slice(0, 5).map(card).join('') : '<p class="rc-empty">Rien de marquant aujourd\'hui.</p>'}</div>`;
    const circ = 2 * Math.PI * 26;
    const hero = tp ? `<button type="button" class="radar-hero" data-sym="${esc(tp.symbol)}">
        <svg class="score-ring" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${(tp.score / 100) * circ} ${circ}" transform="rotate(-90 32 32)"/><text x="32" y="38" text-anchor="middle">${tp.score}</text></svg>
        <div><div class="rh-kicker">◎ LE COUP À SURVEILLER</div><div class="rh-name">${esc(tp.name)}</div><div class="rh-title">${esc(tp.title)}</div><div class="rh-text">${esc(tp.text)}</div></div></button>`
      : `<div class="radar-hero"><div><div class="rh-kicker">◎ LE COUP À SURVEILLER</div><div class="rh-title">Aucun signal marquant : la patience est aussi une stratégie.</div></div></div>`;
    return `<div class="radar-view">${hero}<div class="radar-cols">${col('opportunity', '▲ Opportunités', r.opportunities)}${col('trend', '➚ Tendances fortes', r.trends)}${col('warning', '⚠ Vigilance', r.warnings)}</div><p class="disclaimer">${esc(r.disclaimer)}</p></div>`;
  }

  // ---------- Fiche détaillée ----------
  const PERIODS = [['1J', '1d'], ['5J', '5d'], ['1M', 23], ['3M', 64], ['6M', 127], ['1A', 0]];

  async function openDetail(symbol, period = '1M') {
    const m = S.bySym[symbol];
    if (!m) return;
    if (!S.detail && S.visual && S.visual.type !== 'detail') S.prevVisual = S.visual;
    S.detail = { symbol, period };
    S.visual = { type: 'detail', symbol, period };
    $('stage').querySelector('.stage-body').classList.remove('page-mode');
    setOverlay('');
    $('periodTabs').hidden = false;
    $('stageClose').hidden = false;
    $('periodTabs').innerHTML = PERIODS.map(([p]) => `<button type="button" role="tab" data-period="${p}" class="${p === period ? 'active' : ''}" aria-selected="${p === period}">${p}</button>`).join('');
    document.querySelectorAll('.market-row').forEach((r) => r.classList.toggle('active', r.dataset.sym === symbol));
    renderDetailStats(m);
    setStage(m.name, `${priceTxt(m)}  ·  ${pctTxt(m.changePct)} séance`);
    const def = PERIODS.find((x) => x[0] === period);
    let pts;
    if (typeof def[1] === 'string') {
      const key = symbol + def[1];
      let data = S.intradayCache.get(key);
      if (!data || Date.now() - data.at > 120000) {
        try {
          const j = await (await fetch(`/api/intraday?symbol=${encodeURIComponent(symbol)}&range=${def[1]}`)).json();
          data = { at: Date.now(), points: j.points || [] };
          S.intradayCache.set(key, data);
        } catch (e) { data = { at: 0, points: [] }; }
      }
      if (!S.detail || S.detail.symbol !== symbol || S.detail.period !== period) return;
      pts = data.points;
    } else {
      pts = def[1] ? historyPoints(m, def[1]) : historyPoints(m, m.history.length);
    }
    chart.show({ type: 'line', series: [{ name: m.name, points: pts }], decimals: m.decimals, unit: m.unit === 'pts' ? 'pts' : m.unit });
  }

  function renderDetailStats(m) {
    const s = m.stats || {};
    const sig = [...S.briefing.radar.opportunities, ...S.briefing.radar.trends, ...S.briefing.radar.warnings].filter((x) => x.symbol === m.symbol);
    const perf = (v) => (v == null ? '—' : `<span class="${dirCls(v)}">${esc(pctTxt(v, 1))}</span>`);
    const rsiPos = s.rsi == null ? 50 : Math.max(0, Math.min(100, s.rsi));
    const trendCls = s.trend === 'haussière' ? 'up' : s.trend === 'baissière' ? 'down' : 'flat';
    $('detailStats').hidden = false;
    $('detailStats').innerHTML = `
      <div class="ds-price num">${esc(priceTxt(m))}</div>
      <div class="num ${dirCls(m.changePct)}">${arrow(m.changePct)} ${esc(pctTxt(m.changePct))} sur la séance</div>
      <div class="ds-grid num">
        <span>1 semaine</span>${`<span>${perf(s.perf1w)}</span>`}
        <span>1 mois</span><span>${perf(s.perf1m)}</span>
        <span>3 mois</span><span>${perf(s.perf3m)}</span>
        <span>1 an</span><span>${perf(s.perf1y)}</span>
        <span>Plus haut 1 an</span><span>${esc(priceTxt(m, s.high))} <small class="down">(${esc(fmt(s.fromHigh, 1))} %)</small></span>
        <span>Plus bas 1 an</span><span>${esc(priceTxt(m, s.low))} <small class="up">(+${esc(fmt(s.fromLow, 1))} %)</small></span>
        <span>Tendance</span><span class="${trendCls}">${esc(s.trend)}</span>
        <span>Volatilité 20 j</span><span>${esc(fmt(s.vol20, 1))} %</span>
        <span>Niveau de risque</span><span class="risk-${esc(s.risk)}">${esc(s.risk)}</span>
      </div>
      <div>RSI 14 : <b class="num">${esc(fmt(s.rsi, 0))}</b></div>
      <div class="gauge" title="RSI"><i style="left:${rsiPos}%"></i></div>
      <div class="gauge-labels"><span>survente &lt; 30</span><span>surachat &gt; 70</span></div>
      <div class="ds-badges">${sig.map((x) => `<span class="badge ${x.kind}" title="${esc(x.text)}">${esc(x.title)}</span>`).join('')}</div>
      <button type="button" class="btn-ghost" id="analyseBtn" data-sym="${esc(m.symbol)}">◉ Analyse de Rocket</button>`;
  }

  function closeDetail(silent) {
    if (!S.detail) return;
    S.detail = null;
    $('periodTabs').hidden = true;
    $('stageClose').hidden = true;
    $('detailStats').hidden = true;
    document.querySelectorAll('.market-row.active').forEach((r) => r.classList.remove('active'));
    chart.resize();
    if (!silent) {
      const prev = S.prevVisual || { type: 'intro' };
      S.prevVisual = null;
      S.visual = null;
      showVisual(prev);
    }
  }

  // ---------- Sous-titres ----------
  const sub = { words: [], spans: [], cum: [], last: -1 };
  function setSubtitle(text) {
    const el = $('subText');
    el.classList.remove('status');
    const words = text.split(/\s+/).filter(Boolean);
    el.innerHTML = words.map((w) => `<span>${esc(w)}</span> `).join('');
    sub.spans = Array.from(el.children);
    sub.cum = [];
    let total = 0;
    for (const w of words) { total += w.length + 1; sub.cum.push(total); }
    sub.total = total; sub.last = -1;
  }
  function setSubProgress(f) {
    if (!sub.spans.length) return;
    const pos = f * sub.total;
    let idx = sub.cum.findIndex((c) => c >= pos);
    if (idx < 0) idx = sub.spans.length - 1;
    if (f >= 1) idx = sub.spans.length;
    if (idx === sub.last) return;
    const from = Math.max(0, Math.min(sub.last, idx) - 1);
    for (let i = from; i < sub.spans.length; i++) {
      const cls = i < idx ? 'w-done' : i === idx ? 'w-cur' : '';
      if (sub.spans[i].className !== cls) sub.spans[i].className = cls;
      if (i > idx + 1 && i > sub.last + 1) break;
    }
    sub.last = idx;
  }
  function setStatus(text) {
    const el = $('subText');
    el.classList.add('status');
    el.textContent = text;
    sub.spans = [];
  }

  function setHost(h) {
    S.host = h;
    document.querySelector('.core-wrap').classList.toggle('speaking', !!h);
  }

  // ---------- Noyau vocal ----------
  const core = { raf: 0, last: 0, t0: performance.now(), g: null, size: 320 };
  function setCore(state) {
    S.coreState = state;
    document.querySelector('.core-wrap').classList.toggle('breathe', state === 'idle');
    startCore();
  }
  function startCore() {
    if (core.raf) return;
    core.raf = requestAnimationFrame(coreFrame);
  }
  function coreFrame(now) {
    core.raf = 0;
    const active = S.coreState !== 'idle' || Voice.speaking();
    if (Voice.speaking()) Voice.tick();
    // Indicateur de niveau du micro sur le bouton « Parler ».
    const lvl = Mic.active ? Mic.level() : 0;
    if (lvl !== core.micLvl) { core.micLvl = lvl; $('talkBtn').style.setProperty('--lvl', lvl.toFixed(3)); }
    if (!active) { drawCore(now, 0); return; } // image fixe au repos
    if (now - core.last >= 42) { core.last = now; drawCore(now, Voice.level()); }
    core.raf = requestAnimationFrame(coreFrame);
  }
  // Sprites pré-dessinés (anneaux, halo) : chaque image n'est ensuite que quelques drawImage.
  function coreSprites(rgb, px) {
    const key = rgb + '|' + px;
    if (core.sprites && core.sprites.key === key) return core.sprites;
    const mk = (draw) => {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const g = c.getContext('2d');
      g.scale(px / 320, px / 320);
      g.translate(160, 160);
      draw(g);
      return c;
    };
    const ring = (r, w, dash) => mk((g) => { g.setLineDash(dash); g.strokeStyle = `rgb(${rgb})`; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
    const halo = mk((g) => {
      const grad = g.createRadialGradient(0, 0, 8, 0, 0, 158);
      grad.addColorStop(0, `rgba(${rgb}, .85)`);
      grad.addColorStop(0.45, `rgba(${rgb}, .28)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 158, 0, Math.PI * 2); g.fill();
    });
    const arcs = mk((g) => {
      g.strokeStyle = `rgba(${rgb}, .9)`; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 92, 0, 1.1); g.stroke();
      g.beginPath(); g.arc(0, 0, 92, Math.PI, Math.PI + 1.1); g.stroke();
    });
    core.sprites = { key, rings: [[ring(148, 1.2, [2, 7]), 1], [ring(128, 2, [18, 10]), -1.4], [ring(110, 1, [1, 5]), 0.8]], halo, arcs };
    return core.sprites;
  }

  function drawCore(now, level) {
    const c = $('core');
    if (!core.g) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      core.px = Math.round(170 * dpr); // 170 px CSS
      c.width = c.height = core.px;
      core.g = c.getContext('2d');
    }
    const g = core.g, C = Theme.colors(), px = core.px, k = px / 320;
    const t = (now - core.t0) / 1000;
    const st = S.coreState;
    const rgb = st === 'listening' ? C.redRgb : st === 'thinking' ? C.accentRgb : C.rocketRgb;
    const sp = coreSprites(rgb, px);
    let lvl = level;
    if (st === 'listening') lvl = 0.35 + 0.25 * Math.sin(t * 5);
    if (st === 'thinking') lvl = 0.2 + 0.1 * Math.sin(t * 3);
    const speed = st === 'idle' ? 0 : st === 'thinking' ? 1.6 : 0.5;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const half = px / 2;
    const rot = (img, a, alpha, scale = 1) => {
      g.globalAlpha = alpha;
      g.setTransform(scale * Math.cos(a), scale * Math.sin(a), -scale * Math.sin(a), scale * Math.cos(a), half, half);
      g.drawImage(img, -half, -half);
    };
    for (const [img, dir] of sp.rings) rot(img, t * speed * dir * 0.4, 0.35 + lvl * 0.3);
    if (st === 'thinking') rot(sp.arcs, t * 3, 1);
    // Halo dont la taille suit la voix
    rot(sp.halo, 0, 0.6 + lvl * 0.4, (70 + lvl * 50) / 158);
    g.globalAlpha = 1;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = `rgb(${rgb})`;
    g.beginPath(); g.arc(160, 160, 30 + lvl * 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.theme === 'light' ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(160, 160, 10 + lvl * 8, 0, Math.PI * 2); g.fill();
  }

  // ---------- Lecture du podcast ----------
  async function run(from = S.idx) {
    if (!S.script.length) return;
    Music.stop();
    Listen.cancel();
    const token = ++S.runToken;
    S.playing = true; S.paused = false;
    if (from >= S.script.length) from = 0;
    S.idx = from;
    updatePlayBtn();
    if (S.view !== 'briefing') setView('briefing', true);
    while (S.idx < S.script.length && token === S.runToken) {
      const seg = S.script[S.idx];
      // Si l'utilisateur consulte un autre onglet, le podcast continue sans changer la scène.
      if (S.detail) S.prevVisual = seg.visual;
      else if (S.view === 'briefing') showVisual(seg.visual);
      updateProgress();
      setSubtitle(seg.text);
      setHost('rocket');
      setCore('speaking');
      const next = S.script[S.idx + 1];
      if (next) Voice.prefetch(next.text);
      const ok = await Voice.speak(seg.text, setSubProgress);
      if (token !== S.runToken) return;
      if (!ok && !S.paused) break;
      setSubProgress(1);
      await sleep(350);
      await waitIfPaused();
      if (token !== S.runToken) return;
      S.idx++;
    }
    if (token === S.runToken) {
      S.playing = false;
      setHost(null);
      setCore('idle');
      updateProgress();
      updatePlayBtn();
    }
  }
  function waitIfPaused() {
    if (!S.paused) return Promise.resolve();
    return new Promise((r) => { S.resumeWait = r; });
  }
  function stopPlayback() {
    S.runToken++;
    S.playing = false; S.paused = false;
    if (S.resumeWait) { S.resumeWait(); S.resumeWait = null; }
    Voice.stop();
    setHost(null);
    setCore('idle');
    updatePlayBtn();
  }
  function togglePlay() {
    if (!S.started) return start();
    if (!S.playing) return run(S.idx >= S.script.length - 1 && S.idx > 0 ? 0 : S.idx);
    if (S.paused) {
      S.paused = false;
      Voice.resume();
      if (S.resumeWait) { S.resumeWait(); S.resumeWait = null; }
      setCore('speaking');
    } else {
      S.paused = true;
      Voice.pause();
      setCore('idle');
    }
    updatePlayBtn();
  }
  function jump(i) {
    i = Math.max(0, Math.min(S.script.length - 1, i));
    Voice.stop();
    run(i);
  }
  function updatePlayBtn() {
    const b = $('playBtn');
    const playingNow = S.playing && !S.paused;
    b.textContent = playingNow ? '❚❚' : '▶';
    b.setAttribute('aria-label', playingNow ? 'Pause' : 'Lecture');
  }

  // ---------- Vues ----------
  function setView(view, silent) {
    S.view = view;
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.view === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (silent) return;
    if (view === 'radar') showVisual({ type: 'radar' });
    else if (PAGES.includes(view)) showVisual({ type: 'page', view });
    else {
      const seg = S.script[S.idx];
      showVisual(seg && (S.playing || S.idx > 0) ? seg.visual : { type: 'intro' });
    }
  }

  // ---------- Demandes à Rocket ----------
  // Ouvre l'onglet demandé par Rocket (y compris les mini-onglets Bourse / Politique).
  function openTab(tab) {
    if (!tab) return;
    if (tab === 'bourse' || tab === 'politique') { setMini(tab); return; }
    if (tab === 'briefing' || tab === 'radar' || PAGES.includes(tab)) setView(tab);
  }

  // ---------- Parole phrase par phrase ----------
  // Le texte arrive (en flux ou d'un coup) ; Rocket commence à parler dès la première phrase complète
  // et prépare la voix de la phrase suivante pendant qu'il parle.
  function nextSentence(buf, final) {
    const re = /[.!?…]+["»”)]*(\s+|$)/g;
    let m;
    while ((m = re.exec(buf))) {
      const end = m.index + m[0].length;
      // Pas de coupure sur « 3.5 » ou une phrase minuscule (« M. »).
      if (end < buf.length || final || m[1]) {
        if (end >= 12 || final) return [buf.slice(0, end).trim(), buf.slice(end)];
      }
    }
    if (buf.length > 220) { // phrase très longue : on coupe à une virgule
      const c = buf.lastIndexOf(', ', 200);
      if (c > 60) return [buf.slice(0, c + 1).trim(), buf.slice(c + 2)];
    }
    if (final && buf.trim()) return [buf.trim(), ''];
    return null;
  }

  function createTalker() {
    const id = ++S.talkId;
    let buf = '', ended = false, busy = false, cancelled = false, started = false;
    const queue = [];
    const said = []; // phrases déjà dites (affichées au-dessus de la phrase en cours)
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    const alive = () => !cancelled && id === S.talkId;
    function cut() {
      let r;
      while ((r = nextSentence(buf, ended))) {
        if (r[0]) { queue.push(r[0]); if (busy && queue.length === 1) Voice.prefetch(r[0]); }
        buf = r[1];
      }
    }
    async function pump() {
      if (busy) return;
      if (!alive()) { finish(false); return; }
      if (!queue.length) { if (ended) finish(true); return; }
      busy = true;
      const sentence = queue.shift();
      if (!started) { started = true; setHost('rocket'); setCore('speaking'); }
      if (queue[0]) Voice.prefetch(queue[0]);
      // Sous-titres : la réponse s'affiche au fur et à mesure (4 dernières phrases), mot en cours surligné.
      const before = said.slice(-3).join(' ');
      const shown = before ? before + ' ' + sentence : sentence;
      const pre = before ? before.length + 1 : 0;
      setSubtitle(shown);
      setSubProgress(pre / shown.length);
      const ok = await Voice.speak(sentence, (f) => setSubProgress((pre + f * sentence.length) / shown.length));
      said.push(sentence);
      busy = false;
      if (!ok || !alive()) { cancelled = true; finish(false); return; }
      pump();
    }
    let finished = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      if (id === S.talkId) { setHost(null); if (S.coreState === 'speaking') setCore('idle'); }
      resolveDone(ok);
    }
    return {
      push(t) { if (finished) return; buf += t; cut(); pump(); },
      end() { ended = true; cut(); pump(); },
      cancel() { cancelled = true; finish(false); },
      get started() { return started || queue.length > 0 || busy; },
      done,
    };
  }

  // Lit un texte avec la voix de Rocket (hors podcast).
  async function sayText(text) {
    if (S.playing) stopPlayback(); else Voice.stop();
    const t = createTalker();
    t.push(String(text || ''));
    t.end();
    return t.done;
  }

  // Règle : « Ok Rocket … s'il te plaît ». Renvoie true si la demande est exécutée.
  function submit(raw, fromVoice) {
    const p = Command.parse(raw);
    if (!p.complete) {
      setStatus(p.wake ? "Terminez votre demande par « s'il te plaît », Monsieur." : Command.HINT);
      const r = document.querySelector('.sub-rule');
      r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
      return false;
    }
    S.autoPaused = false;
    $('askInput').value = '';
    if (!p.question) { sayText(SORRY); return true; }
    ask(p.question, { voice: !!fromVoice });
    return true;
  }

  async function ask(question, opts = {}) {
    question = String(question || '').trim();
    if (!question) return;
    // Plusieurs questions à la suite : elles attendent leur tour au lieu d'être perdues.
    if (S.asking) { S.queue.push([question, opts]); setStatus(`Question notée, Monsieur (${S.queue.length} en attente).`); return; }
    S.asking = true;
    Listen.cancel();
    if (S.playing) stopPlayback(); else Voice.stop();
    setHost(null);
    setCore('thinking');
    setStatus('Rocket réfléchit…');
    let result = null;
    let talker = null; // réponse en flux : Rocket parle avant la fin de la réponse
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 200000);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({
          question, history: S.history.slice(-6), deezerUser: getDeezerUser(),
          context: { planning: Views.Planning.list(), coach: Views.Coach.summary(), city: getCity() },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        result = { answer: j.error || "Désolé Monsieur, je n'arrive pas à répondre pour le moment." };
      } else {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
            if (ev.type === 'status' && !(talker && talker.started)) setStatus(ev.text);
            if (ev.type === 'delta') {
              if (!talker) { Voice.stop(); talker = createTalker(); }
              talker.push(ev.text);
            }
            if (ev.type === 'result') result = ev;
          }
        }
        if (!result && buf.trim()) { try { result = JSON.parse(buf); } catch (e) { /* ignore */ } }
      }
    } catch (e) {
      result = { answer: ctrl.signal.aborted ? "Désolé Monsieur, la réponse prend trop de temps. Posez-moi une autre question." : 'Le serveur Rocket ne répond pas, Monsieur. Vérifiez que la fenêtre noire de Rocket est toujours ouverte.' };
    }
    clearTimeout(timer);
    S.asking = false;
    if (talker && !(result && result.streamed)) { talker.cancel(); talker = null; }
    if (!result) result = { answer: SORRY };
    let answer = result.answer || SORRY;
    if (result.music) {
      const extra = Music.handle(result.music);
      if (extra) answer += ' ' + extra;
    }
    const action = result.action;
    // Actions sur les données personnelles (stockées dans le navigateur) ; une phrase peut en contenir plusieurs.
    for (const a of result.actions || [result]) {
      if (a.action === 'planning-add' && a.event) Views.Planning.add(a.event);
      if (a.action === 'planning-remove' && a.removeId) Views.Planning.remove(a.removeId);
      if (a.action === 'coach-log' && a.habit) Views.Coach.log(a.habit, Number(a.delta) || 1);
      if (a.recipeId) Views.showRecipe(a.recipeId);
      if (a.music && a !== result) Music.handle(a.music);
    }
    if (result.visual) {
      const keep = opts.keepVisual && !['custom', 'figure'].includes(result.visual.type);
      if (!keep) {
        setView(result.visual.type === 'radar' ? 'radar' : 'briefing', true);
        showVisual(result.visual);
      }
    }
    if (result.tab) openTab(result.tab);
    else if (action === 'radar') setView('radar');
    S.history.push({ q: question, a: answer });
    if (S.history.length > 12) S.history.shift();
    if (action === 'stop') {
      stopPlayback();
      Music.stop();
      setStatus(answer);
      setCore('idle');
      S.queue = [];
      return;
    }
    const speak = (txt) => {
      if (talker) { const t = talker; talker = null; t.end(); return t.done; }
      return sayText(txt);
    };
    if (action === 'play' || action === 'next') {
      await speak(answer);
      // « Lance la matinale » : depuis le début ; « reprends » : là où elle s'était arrêtée.
      const from = action === 'next' ? S.idx + 1 : result.from === 'start' || S.idx >= S.script.length - 1 ? 0 : S.idx;
      run(from);
      return;
    }
    await speak(answer);
    if (S.queue.length) { const [q, o] = S.queue.shift(); ask(q, o); return; }
    // Conversation : après une réponse à une demande vocale, Rocket réécoute pour la question suivante.
    if (opts.voice && !Listen.latched && !Listen.capturing && !S.playing) followUp();
  }

  async function followUp() {
    setStatus('Une autre question, Monsieur ? Je vous écoute…');
    const raw = await Listen.once({ maxWaitMs: 8000, quiet: true });
    if (!raw) { if (S.coreState === 'listening') setCore('idle'); setStatus("À votre service, Monsieur. Appuyez sur « Parler » pour une nouvelle question."); return; }
    submit(raw, true);
  }

  // ---------- Boutons « Parler » et « Maintenir » ----------
  function pauseForListening() {
    if (S.playing && !S.paused) { togglePlay(); S.autoPaused = true; }
    else if (!S.playing) Voice.stop();
  }
  function resumeAfterListening() {
    if (S.autoPaused && S.playing && S.paused) togglePlay();
    S.autoPaused = false;
  }

  function updateTalkUI(st) {
    const talk = $('talkBtn'), lock = $('lockBtn');
    const pressed = st.listening || st.latched;
    talk.classList.toggle('pressed', pressed);
    talk.setAttribute('aria-pressed', String(pressed));
    talk.querySelector('.talk-label').textContent = pressed ? 'J\'ÉCOUTE' : 'PARLER';
    talk.querySelector('.talk-sub').textContent = st.latched ? 'en continu' : pressed ? 'Ok Rocket…' : 'à Rocket';
    lock.classList.toggle('pressed', st.latched);
    lock.setAttribute('aria-pressed', String(st.latched));
    lock.querySelector('.talk-ico').textContent = st.latched ? '🔒' : '🔓';
    lock.querySelector('.talk-sub').textContent = st.latched ? 'appuyez pour relâcher' : 'écoute continue';
    if (pressed && !S.asking && S.coreState !== 'speaking') setCore('listening');
    else if (!pressed && S.coreState === 'listening') setCore('idle');
    if (!pressed) $('talkBtn').style.setProperty('--lvl', '0');
    startCore();
  }

  const ENGINE_TXT = {
    web: 'Moteur actif : reconnaissance du navigateur (Chrome, Edge).',
    local: 'Moteur actif : moteur local (fonctionne dans tous les navigateurs ; ~80 Mo téléchargés la première fois).',
  };

  function noMic() {
    setStatus("Ce navigateur ne donne pas accès au micro. Ouvrez Rocket à l'adresse http://localhost:3000 dans Chrome, Edge ou Opera, ou tapez votre demande ci-dessous.");
    $('askInput').focus();
  }

  async function onTalk() {
    if (!S.started) return start();
    if (!Listen.supported) return noMic();
    if (Listen.latched) return; // le bouton est maintenu enfoncé par « Maintenir »
    if (Listen.capturing) { Listen.cancel(); resumeAfterListening(); return; }
    Voice.unlock();
    pauseForListening();
    setStatus('Je vous écoute, Monsieur…');
    const raw = await Listen.once({ maxWaitMs: 15000 });
    if (!raw) {
      if (Date.now() - S.micErrorAt > 1500) setStatus("Je n'ai rien entendu, Monsieur. Regardez la barre blanche du bouton : elle doit bouger quand vous parlez.");
      resumeAfterListening();
      return;
    }
    if (!submit(raw, true)) resumeAfterListening();
  }

  function onLock() {
    if (!S.started) return start();
    if (!Listen.supported) return noMic();
    Voice.unlock();
    Listen.setLatched(!Listen.latched);
    setStatus(Listen.latched ? "Écoute continue, Monsieur. Dites « Ok Rocket », votre demande, puis « s'il te plaît »." : 'Écoute continue désactivée.');
  }

  const listenHandlers = {
    isSpeaking: () => Voice.speaking(),
    status: (t) => { if (!S.asking) setStatus(t); },
    hearing: () => { if (!S.asking && Listen.capturing) setStatus('Je vous écoute, Monsieur…'); },
    transcribing: (on) => { if (on && !S.asking) setStatus('Transcription…'); },
    engine: () => setStatus("Votre navigateur ne transmet pas la voix : Rocket passe à son moteur vocal local."),
    wake: () => { pauseForListening(); setCore('listening'); setStatus('Je vous écoute, Monsieur…'); },
    command: (question, raw) => { submit(raw, false); },
    incomplete: () => { setStatus("Terminez votre demande par « s'il te plaît », Monsieur."); resumeAfterListening(); if (S.coreState === 'listening' && !Listen.latched) setCore('idle'); },
    interim: (t) => { if (t && !S.asking) setStatus(t); },
    state: updateTalkUI,
    error: (msg) => { S.micErrorAt = Date.now(); setStatus(msg); setCore('idle'); },
  };

  // ---------- Rappels du planning ----------
  async function checkReminders(now) {
    const due = Views.Planning.due(now);
    if (!due.length) return;
    updatePlanningBadge();
    const text = `Monsieur, rappel : ${due.map((e) => `${e.title}${Views.timeSpoken(e.time)}`).join(', et ')}.`;
    if (S.asking) return setStatus(text);
    const wasPlaying = S.playing && !S.paused;
    if (wasPlaying) togglePlay();
    setSubtitle(text);
    setHost('rocket');
    setCore('speaking');
    await Voice.speak(text, setSubProgress);
    setHost(null);
    setCore('idle');
    if (wasPlaying && S.playing && S.paused) run(S.idx);
  }

  function getCity() { try { return localStorage.getItem('rocket.city') || ''; } catch (e) { return ''; } }
  function getDeezerUser() { try { return localStorage.getItem('rocket.deezer') || ''; } catch (e) { return ''; } }

  // ---------- Réglages ----------
  function fillSettings() {
    const cfg = S.config;
    const opts = (cfg.voices || []).map((v) => `<option value="${esc(v.id)}">${esc(v.label)}${v.gender === 'f' ? ' ♀' : ' ♂'}</option>`).join('');
    $('voiceSel').innerHTML = opts;
    const s = Voice.settings;
    $('voiceSel').value = s.voice;
    $('rate').value = s.rate; $('rateOut').textContent = fmt(s.rate, 2);
    $('musicTarget').value = Music.target;
    $('deezerUser').value = getDeezerUser();
    $('citySel').value = getCity();
    const modeTxt = { edge: 'voix Microsoft (gratuites, via le serveur)', elevenlabs: 'ElevenLabs', browser: 'voix du navigateur' };
    $('ttsMode').textContent = modeTxt[Voice.mode] || Voice.mode;
    const serverVoices = Voice.mode === 'edge';
    $('voiceSel').disabled = !serverVoices;
    $('sttSel').value = Listen.pref;
    $('sttInfo').textContent = ENGINE_TXT[Listen.engine] + (Listen.webAvailable ? '' : ' La reconnaissance de ce navigateur ne fonctionne pas : le moteur local est utilisé.');
    $('aiMode').textContent = { 'claude-code': 'Claude via Claude Code (abonnement)', api: "Claude via l'API Anthropic", local: 'réponses locales (sans Claude)' }[cfg.ai] || cfg.ai;
  }

  async function checkDeezer() {
    const u = $('deezerUser').value.trim();
    try { localStorage.setItem('rocket.deezer', u); } catch (e) { /* ignore */ }
    const st = $('deezerStatus');
    if (!u) { st.textContent = 'Collez le lien de votre profil Deezer.'; return; }
    st.textContent = 'Vérification…';
    try {
      const r = await fetch('/api/deezer/profile?user=' + encodeURIComponent(u));
      const j = await r.json();
      if (!r.ok) st.textContent = j.error || 'Erreur';
      else if (!j.ok) st.textContent = j.error;
      else st.textContent = `✓ ${j.name || 'Profil'} : ${j.playlists.length} playlist(s) publique(s)${j.playlists.length ? ' — ' + j.playlists.slice(0, 5).map((p) => p.title).join(', ') : ''}. ${j.note || ''}`;
    } catch (e) { st.textContent = 'Impossible de joindre Deezer.'; }
  }

  // ---------- Démarrage ----------
  async function start() {
    if (S.started) return;
    Voice.unlock();
    const btn = $('startBtn');
    btn.disabled = true;
    if (!S.briefing) {
      $('splashStatus').textContent = 'Chargement des marchés…';
      try { await loadBriefing(); } catch (e) { $('splashStatus').textContent = 'Le serveur ne répond pas. Réessayez.'; btn.disabled = false; return; }
    }
    S.started = true;
    $('splash').classList.add('hide');
    setTimeout(() => { $('splash').hidden = true; }, 400);
    chart.resize();
    drawSparklines();
    Listen.warm();
    // La matinale ne démarre plus toute seule : Rocket attend vos demandes.
    const hint = "Pour écouter la matinale : « Ok Rocket, lance la matinale, s'il te plaît », ou le bouton ▶.";
    await sayText('Bonjour Monsieur, Rocket est à votre service.');
    setStatus(S.config && S.config.ai === 'local'
      ? `${hint} Pour que je réponde à toutes vos questions, connectez Claude (voir le mode d'emploi).`
      : hint);
  }

  function bind() {
    $('themeCards').addEventListener('click', onThemeClick);
    $('styleMenu').addEventListener('click', onThemeClick);
    $('styleBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleStyleMenu(); });
    document.addEventListener('click', (e) => { if (!$('styleMenu').hidden && !e.target.closest('#styleMenu')) toggleStyleMenu(false); });
    $('startBtn').addEventListener('click', start);

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

    const openFromEvent = (e) => {
      const el = e.target.closest('[data-sym]');
      if (el) { openDetail(el.dataset.sym); return true; }
      const n = e.target.closest('[data-news]');
      if (n && n.tagName === 'BUTTON') {
        const i = +n.dataset.news;
        const seg = S.script.findIndex((s) => s.visual.type === 'news' && s.visual.index === i);
        if (S.playing && seg >= 0) jump(seg); else showVisual({ type: 'news', index: i });
        return true;
      }
      return false;
    };
    $('marketList').addEventListener('click', openFromEvent);
    $('marketList').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromEvent(e); } });
    $('tickerTrack').addEventListener('click', openFromEvent);
    $('newsList').addEventListener('click', openFromEvent);
    document.querySelectorAll('.mini-tab').forEach((t) => t.addEventListener('click', () => setMini(t.dataset.mini)));
    $('politicsList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pol]');
      if (!b) return;
      setView('briefing', true);
      showVisual({ type: 'politics', index: +b.dataset.pol });
    });
    $('overlay').addEventListener('click', (e) => { if (!e.target.closest('a') && !e.target.closest('.page')) openFromEvent(e); });
    Views.attach($('overlay'), {
      rerender: () => { if (S.visual && S.visual.type === 'page') $('overlay').innerHTML = Views.render(S.visual.view); },
      speak: (text) => sayText(text),
      changed: (what) => { if (what === 'planning') { updatePlanningBadge(); if (!S.playing) { S.script = withPlanning(S.briefing.script); buildChapters(); renderChapters(); updateProgress(); } } },
    });
    $('detailStats').addEventListener('click', (e) => {
      const b = e.target.closest('#analyseBtn');
      if (!b) return;
      const m = S.bySym[b.dataset.sym];
      ask(`Fais-moi une analyse rapide de ${m.name} : où en est-il et à quoi faire attention ?`, { keepVisual: true });
    });
    $('periodTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-period]');
      if (b && S.detail) openDetail(S.detail.symbol, b.dataset.period);
    });
    $('stageClose').addEventListener('click', () => closeDetail());

    $('chapters').addEventListener('click', (e) => { const b = e.target.closest('[data-seg]'); if (b) { if (!S.started) return start(); jump(+b.dataset.seg); } });
    $('playBtn').addEventListener('click', togglePlay);
    $('prevBtn').addEventListener('click', () => S.started && jump(S.idx - 1));
    $('nextBtn').addEventListener('click', () => S.started && jump(S.idx + 1));
    $('refreshBtn').addEventListener('click', async () => {
      const b = $('refreshBtn'); b.disabled = true;
      try { await loadBriefing(true); if (!S.playing) setStatus('Données actualisées.'); } catch (e) { setStatus("Impossible d'actualiser pour le moment."); }
      b.disabled = false;
    });
    $('settingsBtn').addEventListener('click', () => { fillSettings(); $('settings').showModal(); });

    $('askForm').addEventListener('submit', (e) => { e.preventDefault(); if (!S.started) Voice.unlock(); submit($('askInput').value); });
    $('talkBtn').addEventListener('click', onTalk);
    $('lockBtn').addEventListener('click', onLock);
    Listen.init(listenHandlers);

    // Réglages
    $('voiceSel').addEventListener('change', (e) => Voice.set('voice', e.target.value));
    $('rate').addEventListener('input', (e) => { Voice.set('rate', +e.target.value); $('rateOut').textContent = fmt(+e.target.value, 2); });
    $('musicTarget').addEventListener('change', (e) => Music.setTarget(e.target.value));
    $('sttSel').addEventListener('change', (e) => { Listen.setPref(e.target.value); fillSettings(); });
    $('deezerCheck').addEventListener('click', checkDeezer);
    $('citySel').addEventListener('change', (e) => { try { localStorage.setItem('rocket.city', e.target.value.trim().slice(0, 60)); } catch (err) { /* ignore */ } });
    $('deezerUser').addEventListener('change', () => { try { localStorage.setItem('rocket.deezer', $('deezerUser').value.trim()); } catch (e) { /* ignore */ } });
    $('settings').addEventListener('click', (e) => {
      const b = e.target.closest('[data-test]');
      if (!b) return;
      Voice.unlock();
      Voice.speak('Bonjour Monsieur, je suis Rocket. À votre service.');
    });

    // Clavier
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if (!$('styleMenu').hidden) return toggleStyleMenu(false);
        if (S.detail) { e.preventDefault(); closeDetail(); }
        return;
      }
      if (typing || $('settings').open) return;
      if (!S.started && e.key !== ' ') return;
      if (e.key === ' ' && !e.target.closest('button, [role="button"]')) { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); jump(S.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); jump(S.idx - 1); }
      else if (e.key === '/') { e.preventDefault(); $('askInput').focus(); }
    });

    window.addEventListener('themechange', () => {
      core.g = null;
      drawCore(performance.now(), 0);
      if (S.briefing) drawSparklines();
      if (S.visual && S.visual.type === 'custom') showCustom(S.visual, false);
      if (S.visual && S.visual.type === 'page') $('overlay').innerHTML = Views.render(S.visual.view);
    });
  }

  // ---------- Initialisation ----------
  async function init() {
    chart = new HudChart($('chart'));
    renderThemeChoices();
    Music.init();
    bind();
    tickClock();
    setInterval(tickClock, 1000);
    drawCore(performance.now(), 0);
    setCore('idle');
    const btn = $('startBtn');
    await loadConfig();
    try {
      await loadBriefing();
      const l = S.briefing.live;
      $('splashStatus').textContent = l.markets === true ? 'Marchés en direct — prêt.' : l.markets === false ? 'Sources injoignables : mode démo — prêt.' : 'Données partielles — prêt.';
    } catch (e) {
      $('splashStatus').textContent = 'Le serveur ne répond pas pour le moment.';
    }
    btn.disabled = false;
    // Onglets dynamiques : données rafraîchies toutes les 10 minutes.
    setInterval(() => {
      if (S.asking || !S.briefing) return;
      $('miniLive').classList.add('refreshing');
      loadBriefing(false).catch(() => {}).finally(() => $('miniLive').classList.remove('refreshing'));
    }, 10 * 60 * 1000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // Exposé pour les tests.
  window.RocketApp = { state: S, ask, submit, run, jump, showVisual, openDetail, closeDetail, setView, setMini, togglePlay, stopPlayback, checkReminders };
  init();
})();
