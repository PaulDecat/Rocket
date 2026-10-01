'use strict';
// Onglets « vie quotidienne » : Cuisine, Ciné, Coach hygiène de vie, Planning.
// Les données personnelles (planning, habitudes) restent dans le navigateur (localStorage).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const read = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  let data = null; // lifestyle + cinema reçus du serveur
  let recipeId = null;
  let tipIdx = null;
  let hooks = {};

  // ---------- Planning ----------
  const Planning = {
    list() { return read('rocket.planning', []).filter((e) => e && e.title && e.date); },
    save(list) { write('rocket.planning', list.slice(0, 300)); hooks.changed && hooks.changed('planning'); },
    add(ev) {
      const list = Planning.list();
      const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(ev.title).slice(0, 120), date: ev.date, time: ev.time || null };
      list.push(e);
      Planning.save(list);
      return e;
    },
    remove(id) { Planning.save(Planning.list().filter((e) => e.id !== id)); },
    upcoming(days = 14) {
      const from = iso(new Date()), to = iso(new Date(Date.now() + days * 864e5));
      return Planning.list().filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
    },
    todayCount() { const t = iso(new Date()); return Planning.list().filter((e) => e.date === t).length; },
    // Rappels : événements dont l'heure vient d'arriver (dans les 5 dernières minutes).
    due(now = new Date()) {
      const list = Planning.list();
      const today = iso(now);
      const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const past5 = new Date(now.getTime() - 5 * 60000);
      const from = `${pad(past5.getHours())}:${pad(past5.getMinutes())}`;
      const due = list.filter((e) => e.date === today && e.time && !e.notified && e.time <= hm && (e.time >= from || from > hm));
      if (due.length) { due.forEach((e) => { e.notified = true; }); write('rocket.planning', list); }
      return due;
    },
  };

  // ---------- Coach ----------
  const Coach = {
    state() {
      const s = read('rocket.coach', {});
      return s.day === iso(new Date()) ? s : { day: iso(new Date()) };
    },
    set(id, v) {
      const s = Coach.state();
      const h = habits().find((x) => x.id === id);
      if (!h) return;
      s[id] = Math.max(0, Math.min(h.target * 2, v));
      write('rocket.coach', s);
      hooks.changed && hooks.changed('coach');
    },
    log(id, delta) { const s = Coach.state(); Coach.set(id, (Number(s[id]) || 0) + delta); },
    summary() {
      const s = Coach.state();
      const out = {};
      for (const h of habits()) out[h.id] = Number(s[h.id]) || 0;
      return out;
    },
  };

  function habits() { return (data && data.lifestyle && data.lifestyle.habits) || []; }
  function recipes() { return (data && data.lifestyle && data.lifestyle.allRecipes) || []; }
  function recipeById(id) { return recipes().find((r) => r.id === id); }

  function dayLabel(d) {
    const today = iso(new Date()), tomorrow = iso(new Date(Date.now() + 864e5));
    if (d === today) return "Aujourd'hui";
    if (d === tomorrow) return 'Demain';
    const [y, m, dd] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, dd);
    return `${JOURS[dt.getDay()].replace(/^./, (c) => c.toUpperCase())} ${dd} ${MOIS[m - 1]}`;
  }
  function timeSpoken(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return ` à ${h} heure${h > 1 ? 's' : ''}${m ? ' ' + m : ''}`; }

  // ---------- Rendus ----------
  function cuisine() {
    const l = data.lifestyle;
    const r = recipeById(recipeId) || recipeById(l.recipeOfDay) || recipes()[0];
    if (!r) return '<div class="page"><p class="rc-empty">Aucune recette disponible.</p></div>';
    recipeId = r.id;
    const chips = l.recipes.map((x) => `<button type="button" class="chip ${x.id === r.id ? 'on' : ''}" data-recipe="${esc(x.id)}">${esc(x.title)}</button>`).join('');
    return `<div class="page page-cuisine">
      <div class="page-head"><h3>🍳 ${r.id === l.recipeOfDay ? 'Recette du jour' : 'Recette'}</h3><span class="page-meta">Saison : ${esc(l.season)}</span></div>
      <article class="recipe">
        <h4>${esc(r.title)}</h4>
        <div class="recipe-meta">⏱ ${r.time} min · ${esc(r.level)} · ${r.tags.map(esc).join(' · ')}</div>
        <div class="recipe-cols">
          <div><h5>Ingrédients</h5><ul>${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
          <div><h5>Préparation</h5><ol>${r.steps.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
        </div>
        <div class="page-actions">
          <button type="button" class="btn-ghost" data-act="read-recipe">▶ Lire la recette</button>
          <button type="button" class="btn-ghost" data-act="random-recipe">🎲 Autre idée</button>
        </div>
      </article>
      <div class="chips">${chips}</div>
    </div>`;
  }

  function hhmm(t) { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  function cine() {
    const items = data.cinema || [];
    return `<div class="page page-cine">
      <div class="page-head"><span class="page-meta">Mise à jour automatique</span><span class="grow"></span><button type="button" class="btn-ghost" data-act="read-cine">▶ Écouter les titres</button></div>
      <div class="cards">${items.map((n, i) => `
        <article class="card ${i === 0 ? 'card-hero' : ''}">
          <div class="card-src">${esc(n.source)} · ${esc(hhmm(n.time))}</div>
          <div class="card-title">${n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title)}</div>
        </article>`).join('') || '<p class="rc-empty">Pas d’actualité cinéma pour le moment.</p>'}
      </div>
    </div>`;
  }

  function coach() {
    const s = Coach.summary();
    const hs = habits();
    const done = hs.filter((h) => s[h.id] >= h.target).length;
    const tips = data.lifestyle.tips;
    const tip = tipIdx == null ? data.lifestyle.tip : tips[tipIdx];
    const circ = 2 * Math.PI * 34;
    return `<div class="page page-coach">
      <div class="page-head"><span class="page-meta">Remise à zéro chaque jour · dites par exemple « Ok Rocket, j'ai bu un verre d'eau, s'il te plaît »</span></div>
      <div class="coach-top">
        <svg class="coach-ring" viewBox="0 0 80 80" aria-label="${done} habitudes sur ${hs.length}">
          <circle class="bg" cx="40" cy="40" r="34"/><circle class="fg" cx="40" cy="40" r="34" stroke-dasharray="${(done / Math.max(1, hs.length)) * circ} ${circ}" transform="rotate(-90 40 40)"/>
          <text x="40" y="46" text-anchor="middle">${done}/${hs.length}</text>
        </svg>
        <div class="tip"><div class="tip-k">Conseil du jour</div><div class="tip-t">${esc(tip)}</div>
          <div class="page-actions"><button type="button" class="btn-ghost" data-act="read-tip">▶ Écouter</button><button type="button" class="btn-ghost" data-act="next-tip">↻ Autre conseil</button></div>
        </div>
      </div>
      <ul class="habits">${hs.map((h) => {
        const v = s[h.id], ok = v >= h.target;
        const ctrl = h.target > 1
          ? `<span class="counter"><button type="button" class="icon-btn" data-habit="${h.id}" data-d="-1" aria-label="Moins">−</button><b class="num">${v}/${h.target}</b><button type="button" class="icon-btn" data-habit="${h.id}" data-d="1" aria-label="Plus">+</button></span>`
          : `<button type="button" class="toggle ${ok ? 'on' : ''}" data-habit="${h.id}" data-toggle="1" aria-pressed="${ok}">${ok ? '✓ Fait' : 'À faire'}</button>`;
        return `<li class="${ok ? 'ok' : ''}"><span>${esc(h.label)}</span>${ctrl}</li>`;
      }).join('')}</ul>
    </div>`;
  }

  function planning() {
    const list = Planning.upcoming(30);
    const groups = {};
    for (const e of list) (groups[e.date] = groups[e.date] || []).push(e);
    const today = iso(new Date());
    return `<div class="page page-planning">
      <div class="page-head"><span class="page-meta">Rocket vous prévient à voix haute à l'heure de chaque rendez-vous</span></div>
      <form class="plan-form" data-form="plan">
        <input type="text" name="title" placeholder="Ex. : Dentiste" maxlength="120" required aria-label="Titre">
        <input type="date" name="date" value="${today}" required aria-label="Date">
        <input type="time" name="time" aria-label="Heure">
        <button type="submit" class="btn-primary">Ajouter</button>
      </form>
      <div class="plan-days">${Object.keys(groups).map((d) => `
        <section class="plan-day"><h5>${esc(dayLabel(d))}</h5><ul>${groups[d].map((e) => `
          <li><span class="num plan-time">${esc(e.time || '—')}</span><span class="plan-title">${esc(e.title)}</span><button type="button" class="icon-btn" data-del="${esc(e.id)}" aria-label="Supprimer ${esc(e.title)}">✕</button></li>`).join('')}</ul></section>`).join('')
        || `<p class="rc-empty">Rien de prévu. Dites par exemple : « Ok Rocket, ajoute dentiste demain à 15 heures, s'il te plaît ».</p>`}
      </div>
    </div>`;
  }

  function render(view) {
    if (!data) return '';
    return { cuisine, cine, coach, planning }[view]();
  }

  // ---------- Événements (délégués sur la scène) ----------
  function attach(el, h) {
    hooks = h;
    el.addEventListener('click', (e) => {
      const t = e.target;
      const b = t.closest('button');
      if (!b) return;
      if (b.dataset.recipe) { recipeId = b.dataset.recipe; h.rerender(); return; }
      if (b.dataset.del) { Planning.remove(b.dataset.del); h.rerender(); return; }
      if (b.dataset.habit) {
        const s = Coach.summary();
        const hb = habits().find((x) => x.id === b.dataset.habit);
        if (b.dataset.toggle) Coach.set(hb.id, s[hb.id] >= hb.target ? 0 : hb.target);
        else Coach.log(hb.id, +b.dataset.d);
        h.rerender();
        return;
      }
      const act = b.dataset.act;
      if (!act) return;
      if (act === 'random-recipe') {
        const list = data.lifestyle.recipes.filter((r) => r.id !== recipeId);
        recipeId = list[Math.floor(Math.random() * list.length)].id;
        h.rerender();
      } else if (act === 'read-recipe') {
        const r = recipeById(recipeId);
        h.speak(`${r.title}, prêt en ${r.time} minutes. Il vous faut : ${r.ingredients.join(', ')}. ${r.steps.map((x, i) => `Étape ${i + 1} : ${x}`).join(' ')}`);
      } else if (act === 'read-cine') {
        h.speak(`L'actu ciné, Monsieur. ${(data.cinema || []).slice(0, 4).map((n) => n.title.replace(/[.!?]*$/, '.')).join(' ')}`);
      } else if (act === 'read-tip') {
        h.speak(tipIdx == null ? data.lifestyle.tip : data.lifestyle.tips[tipIdx]);
      } else if (act === 'next-tip') {
        tipIdx = ((tipIdx == null ? data.lifestyle.tips.indexOf(data.lifestyle.tip) : tipIdx) + 1) % data.lifestyle.tips.length;
        h.rerender();
      }
    });
    el.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-form="plan"]');
      if (!f) return;
      e.preventDefault();
      const fd = new FormData(f);
      const title = String(fd.get('title') || '').trim();
      const date = String(fd.get('date') || '');
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const ev = Planning.add({ title, date, time: String(fd.get('time') || '') || null });
      h.rerender();
      h.speak(`C'est noté, Monsieur : ${ev.title}, ${dayLabel(ev.date).toLowerCase()}${timeSpoken(ev.time)}.`);
    });
  }

  window.Views = {
    setData(d) { data = d; },
    render, attach, Planning, Coach, recipeById, dayLabel, timeSpoken,
    showRecipe(id) { if (recipeById(id)) recipeId = id; },
  };
})();
