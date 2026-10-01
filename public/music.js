'use strict';
// Lecteur musique : appli Deezer de l'ordinateur (morceaux complets) ou widget intégré (souvent des extraits de 30 s).
(function () {
  const KEY = 'rocket.music';
  const $ = (id) => document.getElementById(id);
  const st = { target: 'app', current: null, playing: false };
  try { st.target = localStorage.getItem(KEY) === 'widget' ? 'widget' : 'app'; } catch (e) { /* ignore */ }

  function webUrl(item) { return `https://www.deezer.com/fr/${item.kind}/${item.id}`; }
  function widgetUrl(item) {
    const path = item.kind === 'artist' ? `artist/${item.id}/top_tracks` : `${item.kind}/${item.id}`;
    const dark = window.Theme && Theme.current() !== 'light' ? 'dark' : 'light';
    return `https://widget.deezer.com/widget/${dark}/${path}?autoplay=true&tracklist=${item.kind === 'track' ? 'false' : 'true'}`;
  }

  function showPanel(item, note) {
    $('musicPanel').hidden = false;
    $('musicTitle').textContent = item ? item.title : '—';
    $('musicNote').textContent = note;
    const a = $('musicOpen');
    if (item) { a.href = webUrl(item); a.hidden = false; } else a.hidden = true;
  }

  function playWidget(item, note) {
    const wrap = $('musicFrameWrap');
    wrap.textContent = '';
    const f = document.createElement('iframe');
    f.title = 'Lecteur Deezer';
    f.allow = 'encrypted-media; clipboard-write; autoplay';
    f.src = widgetUrl(item);
    wrap.appendChild(f);
    showPanel(item, note || 'Lecteur intégré Deezer (souvent limité à des extraits de 30 secondes)');
  }

  async function play(item) {
    if (!item || !item.kind || !item.id) return;
    st.current = item; st.playing = true;
    if (st.target === 'app') {
      try {
        const r = await fetch('/api/music/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: item.kind, id: item.id }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          $('musicFrameWrap').textContent = '';
          showPanel(item, j.via === 'app' ? "Lecture dans l'appli Deezer" : 'Ouvert dans le navigateur (Deezer)');
          return;
        }
      } catch (e) { /* repli widget */ }
      playWidget(item, "Appli Deezer indisponible ici : lecteur intégré (extraits possibles)");
      return;
    }
    playWidget(item);
  }

  function stop() {
    st.playing = false;
    const wrap = $('musicFrameWrap');
    if (wrap && wrap.firstChild) { wrap.textContent = ''; }
    if (st.current && !$('musicPanel').hidden) $('musicNote').textContent = st.target === 'app' ? "Musique arrêtée ici. Si l'appli Deezer joue encore, mettez-la en pause." : 'Musique arrêtée';
  }

  function hide() { stop(); $('musicPanel').hidden = true; }

  // Commande reçue de Rocket. Renvoie un texte complémentaire éventuel.
  function handle(m) {
    if (!m) return '';
    if (m.action === 'play') { play(m); return ''; }
    if (m.action === 'stop') { stop(); return ''; }
    if (m.action === 'resume') { if (st.current) play(st.current); return st.current ? '' : "Aucune musique à reprendre."; }
    if (m.action === 'next') {
      return st.target === 'app' ? "Passez au titre suivant dans l'appli Deezer." : 'Utilisez le bouton suivant du lecteur Deezer.';
    }
    return '';
  }

  function setTarget(t) {
    st.target = t === 'widget' ? 'widget' : 'app';
    try { localStorage.setItem(KEY, st.target); } catch (e) { /* ignore */ }
  }

  function init() {
    $('musicStop').addEventListener('click', stop);
    $('musicClose').addEventListener('click', hide);
    $('musicNext').addEventListener('click', () => { const t = handle({ action: 'next' }); if (t) $('musicNote').textContent = t; });
  }

  window.Music = { init, handle, play, stop, hide, setTarget, get target() { return st.target; }, get playing() { return st.playing; } };
})();
