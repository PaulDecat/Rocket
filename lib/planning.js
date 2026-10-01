'use strict';
// Planning : compréhension d'une phrase en français (« ajoute dentiste demain à 15 h ») et validation des événements.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, 'vingt et une': 21, 'vingt-deux': 22, 'vingt-trois': 23, trente: 30 };

function strip(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'"); }
function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Renvoie { date: 'AAAA-MM-JJ', time: 'HH:MM' | null, rest } ou null.
function parseWhen(text, now = new Date()) {
  // Les passages reconnus sont remplacés par des espaces de même longueur :
  // les positions restent alignées avec le texte d'origine (accents, majuscules).
  let t = ' ' + strip(String(text).normalize('NFC')) + ' ';
  let date = null, time = null, m;
  const cut = (re) => { t = t.replace(re, (x) => ' '.repeat(x.length)); };

  if (/\bapres[- ]demain\b/.test(t)) { date = addDays(now, 2); cut(/\bapres[- ]demain\b/); }
  else if (/\bdemain\b/.test(t)) { date = addDays(now, 1); cut(/\bdemain\b/); }
  else if (/\baujourd'?hui\b|\bce soir\b|\bce matin\b|\bcet apres-midi\b/.test(t)) {
    date = new Date(now);
    if (/\bce soir\b/.test(t) && !time) time = '19:00';
    cut(/\baujourd'?hui\b/);
  }
  if (!date && (m = t.match(/\b(?:le |ce )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( prochain)?\b/))) {
    const target = JOURS.indexOf(m[1]);
    let diff = (target - now.getDay() + 7) % 7;
    if (m[2] && diff === 0) diff = 7;
    date = addDays(now, diff);
    cut(m[0]);
  }
  if (!date && (m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const y = m[3] ? +(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear();
    date = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && date < startOfDay(now)) date.setFullYear(y + 1);
    cut(m[0]);
  }
  if (!date && (m = t.match(/\b(?:le )?(\d{1,2}|1er|premier)(?: (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre))?\b/))) {
    const day = /^(1er|premier)$/.test(m[1]) ? 1 : +m[1];
    // Ne pas confondre avec une heure (« 15 h ») : on exige « le » ou un mois.
    if (day >= 1 && day <= 31 && (m[2] || /\ble\s/.test(m[0]))) {
      if (m[2]) {
        date = new Date(now.getFullYear(), MOIS.indexOf(m[2]), day);
        if (date < startOfDay(now)) date.setFullYear(now.getFullYear() + 1);
      } else {
        date = new Date(now.getFullYear(), now.getMonth(), day);
        if (date < startOfDay(now)) date = new Date(now.getFullYear(), now.getMonth() + 1, day);
      }
      cut(m[0]);
    }
  }

  if ((m = t.match(/\b(?:a |vers |pour )?midi(?: et demie?)?\b/))) { time = /demi/.test(m[0]) ? '12:30' : '12:00'; cut(m[0]); }
  else if ((m = t.match(/\b(?:a |vers |pour )?minuit\b/))) { time = '00:00'; cut(m[0]); }
  else if ((m = t.match(/\b(?:a |vers |pour )?(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?(?: et (quart|demie?))?\b/))) {
    let h = +m[1], mn = m[2] ? +m[2] : 0;
    if (m[3]) mn = m[3] === 'quart' ? 15 : 30;
    if (h < 24 && mn < 60) { time = `${pad(h)}:${pad(mn)}`; cut(m[0]); }
  } else if ((m = t.match(/\b(?:a |vers )(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt|vingt et une|vingt-deux|vingt-trois) heures?(?: et (quart|demie?))?\b/))) {
    const h = NOMBRES[m[1]];
    time = `${pad(h)}:${m[2] ? (m[2] === 'quart' ? '15' : '30') : '00'}`;
    cut(m[0]);
  }
  if (time && /\b(du soir|de l'apres-midi)\b/.test(t)) {
    const [h, mn] = time.split(':').map(Number);
    if (h < 12) time = `${pad(h + 12)}:${pad(mn)}`;
    cut(/\b(du soir|de l'apres-midi)\b/);
  }
  if (!date && time) date = new Date(now);
  if (!date) return null;
  return { date: iso(date), time, mask: t };
}

const ADD_RE = /^(?:(?:ajoute|ajouter|note|noter|inscris|programme|planifie|mets|rajoute|cree|enregistre)(?:[- ]moi)?|rappelle[- ]moi(?: de)?)\b/;

// « ajoute rendez-vous chez le dentiste demain à 15 h dans mon planning » → { title, date, time }
function parseAdd(text, now = new Date()) {
  const t = strip(text).trim();
  if (!ADD_RE.test(t) && !/\b(dans|a) (mon|le) (planning|agenda|calendrier)\b/.test(t)) return null;
  const when = parseWhen(text, now);
  if (!when) return /\b(planning|agenda|calendrier|rendez[- ]vous|rdv)\b/.test(t) ? { title: null, date: null, time: null, missingDate: true } : null;
  const orig = ' ' + String(text).normalize('NFC') + ' ';
  let mask = when.mask;
  const blank = (re) => { mask = mask.replace(re, (x) => ' '.repeat(x.length)); };
  blank(/^\s*(?:(?:ajoute|ajouter|note|noter|inscris|programme|planifie|mets|rajoute|cree|enregistre)(?:[- ]moi)?|rappelle[- ]moi(?: de| d'| d)?)\b/);
  blank(/\b(dans|a|sur) (mon|le) (planning|agenda|calendrier)\b/g);
  blank(/^\s*(un|une|le|la|les)\s/);
  blank(/^\s*l'/);
  for (let i = 0; i < 3; i++) blank(/\s(le|la|a|au|pour|de|d'|et|un|une)\s*$/);
  let title = '';
  for (let i = 0; i < orig.length; i++) title += mask[i] === ' ' ? ' ' : orig[i];
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) return { title: null, date: when.date, time: when.time };
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title: title.slice(0, 120), date: when.date, time: when.time };
}

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((e) => ({
    id: String((e && e.id) || '').slice(0, 40),
    title: String((e && e.title) || '').slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(e && e.date) ? e.date : null,
    time: /^\d{2}:\d{2}$/.test(e && e.time) ? e.time : null,
  })).filter((e) => e.title && e.date);
}

function spokenDate(isoDate, now = new Date()) {
  const today = iso(now), tomorrow = iso(addDays(now, 1));
  if (isoDate === today) return "aujourd'hui";
  if (isoDate === tomorrow) return 'demain';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS[dt.getDay()]} ${d === 1 ? '1er' : d} ${MOIS_FR[m - 1]}`;
}
function spokenTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return ` à ${h} heure${h > 1 ? 's' : ''}${m ? ' ' + m : ''}`;
}

function eventsOn(list, isoDate) {
  return list.filter((e) => e.date === isoDate).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

module.exports = { parseWhen, parseAdd, sanitize, spokenDate, spokenTime, eventsOn, iso, addDays, strip };
