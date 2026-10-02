'use strict';
// Culture générale de Rocket quand Claude n'est pas connecté :
// heure et date, calculs, météo (Open-Meteo), définitions et personnalités (Wikipédia), blagues.

const { fetchWithTimeout } = require('./sources');

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function strip(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019`]/g, "'")
    .replace(/\b(c|qu|l|d|j|s|n|m|t) (?=[aeiouyh])/g, "$1'") // « c est » → « c'est » (dictée sans apostrophe)
    .replace(/\s+/g, ' ').trim();
}
function fr(n, d = 2) {
  if (!isFinite(n)) return String(n);
  const r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  return String(r).replace('.', ',').replace('-', 'moins ');
}

// ---------- Heure et date ----------
function timeAnswer(t, now = new Date()) {
  if (/\b(quelle heure|l'heure qu'il est|heure est[- ]il)\b/.test(t)) {
    const h = now.getHours(), m = now.getMinutes();
    return `Il est ${h} heure${h > 1 ? 's' : ''}${m ? ' ' + m : ''}, Monsieur.`;
  }
  if (/\b(quel jour|quelle date|on est le combien|quel est le jour|date d'aujourd'hui|sommes[- ]nous)\b/.test(t)) {
    return `Nous sommes le ${JOURS[now.getDay()]} ${now.getDate() === 1 ? '1er' : now.getDate()} ${MOIS[now.getMonth()]} ${now.getFullYear()}, Monsieur.`;
  }
  return null;
}

// ---------- Calculs ----------
const UNITS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

// « deux cent cinquante-trois » → 253 (nombres usuels).
function wordsToNumber(str) {
  const words = str.replace(/-/g, ' ').split(/\s+/).filter((w) => w && w !== 'et');
  if (!words.length) return null;
  let total = 0, cur = 0, prev = '';
  for (const w of words) {
    if ((w === 'vingt' || w === 'vingts') && prev === 'quatre') cur += 76; // quatre-vingt = 80
    else if (UNITS[w] != null) cur += UNITS[w];
    else if (w === 'cent' || w === 'cents') cur = (cur || 1) * 100;
    else if (w === 'mille') { total += (cur || 1) * 1000; cur = 0; }
    else if (w === 'million' || w === 'millions') { total += (cur || 1) * 1e6; cur = 0; }
    else return null;
    prev = w;
  }
  return total + cur;
}

function normalizeMath(t) {
  let s = ' ' + t + ' ';
  s = s.replace(/(\d)[\s ](?=\d{3}\b)/g, '$1').replace(/(\d),(\d)/g, '$1.$2');
  // « pour cent » avant la conversion des nombres (sinon « cent » deviendrait 100).
  s = s.replace(/\s*(?:pour ?cent|%)\s+d[e']\s*/g, ' PCT ');
  // Suites de mots-nombres → chiffres
  s = s.replace(/\b((?:(?:zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts|vingt|trente|quarante|cinquante|soixante|cents|cent|mille|millions|million|et)[- ]?)+)\b/g, (m) => {
    const n = wordsToNumber(m.trim());
    return n == null ? m : ` ${n} `;
  });
  s = s.replace(/(\d+(?:\.\d+)?)\s*PCT\s*(\d+(?:\.\d+)?)/g, '($1/100*$2)');
  s = s.replace(/\bracine carree d[e']\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  s = s.replace(/\b(\d+(?:\.\d+)?) au carre\b/g, '($1^2)').replace(/\b(\d+(?:\.\d+)?) au cube\b/g, '($1^3)');
  s = s.replace(/\b(\d+(?:\.\d+)?) puissance (\d+(?:\.\d+)?)/g, '($1^$2)');
  s = s.replace(/\bplus\b/g, '+').replace(/\bmoins\b/g, '-').replace(/\b(fois|multiplie par|x)\b/g, '*')
    .replace(/\b(divise par|divisé par|sur)\b/g, '/').replace(/×/g, '*').replace(/÷/g, '/');
  return s;
}

// Évaluateur sûr (pas d'eval) : nombres, + - * / ^, parenthèses, sqrt().
function evaluate(expr) {
  const tokens = expr.match(/sqrt|\d+(?:\.\d+)?|[-+*/^()]/g);
  if (!tokens || !tokens.some((x) => /\d/.test(x)) || !tokens.some((x) => /[-+*/^]|sqrt/.test(x))) return null;
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === '(') { const v = sum(); if (next() !== ')') throw new Error('parenthèse'); return v; }
    if (t === 'sqrt') { if (next() !== '(') throw new Error('sqrt'); const v = sum(); next(); return Math.sqrt(v); }
    if (t === '-') return -primary();
    if (t != null && /\d/.test(t)) return parseFloat(t);
    throw new Error('jeton ' + t);
  }
  function power() { const b = primary(); if (peek() === '^') { next(); return Math.pow(b, power()); } return b; }
  function product() { let v = power(); while (peek() === '*' || peek() === '/') { const op = next(); const r = power(); v = op === '*' ? v * r : v / r; } return v; }
  function sum() { let v = product(); while (peek() === '+' || peek() === '-') { const op = next(); const r = product(); v = op === '+' ? v + r : v - r; } return v; }
  try {
    const v = sum();
    return i === tokens.length && isFinite(v) ? v : null;
  } catch (e) { return null; }
}

function mathAnswer(t) {
  if (!/\b(combien (font|fait|ca fait)|calcule|calculer|resultat de|ca fait combien|egal|egale|racine carree|au carre|pour ?cent de|puissance)\b|%\s*d|\d\s*[-+*/x×÷]\s*\d/.test(t)) return null;
  const s = normalizeMath(t.replace(/\b(combien (font|fait|ca fait)|calcule[rz]?|le resultat de|resultat de|ca fait combien|ca fait|egale?|est egal a|combien)\b/g, ' '));
  const expr = s.replace(/sqrt/g, '§').replace(/[^0-9.+\-*/^()§ ]/g, ' ').replace(/§/g, 'sqrt').replace(/\s+/g, ' ');
  const v = evaluate(expr);
  if (v == null) return null;
  return `Cela fait ${fr(v, Math.abs(v) < 1 ? 4 : 2)}, Monsieur.`;
}

// ---------- Météo (Open-Meteo, sans clé) ----------
const WEATHER = { 0: 'ciel dégagé', 1: 'ciel plutôt dégagé', 2: 'quelques nuages', 3: 'temps couvert', 45: 'brouillard', 48: 'brouillard givrant', 51: 'bruine légère', 53: 'bruine', 55: 'bruine forte', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 66: 'pluie verglaçante', 67: 'forte pluie verglaçante', 71: 'neige faible', 73: 'neige', 75: 'forte neige', 77: 'grains de neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 85: 'averses de neige', 86: 'fortes averses de neige', 95: 'orages', 96: 'orages avec grêle', 99: 'violents orages' };

async function weatherAnswer(t, city) {
  if (!/\b(meteo|quel temps|temps fait[- ]il|va[- ]t[- ]il pleuvoir|pleuvoir|pleut|temperature exterieure|fait[- ]il (chaud|froid)|il fait combien dehors)\b/.test(t)) return null;
  const m = t.match(/\b(?:a|au|aux|sur|pour|de|en)\s+([a-z][a-z' -]{1,40}?)(?:\s+(?:demain|aujourd'hui|ce soir|cette semaine|ce week-end))?\s*$/);
  let place = m ? m[1].replace(/\b(demain|aujourd'hui|maintenant)\b/g, '').trim() : '';
  if (!place || /^(la|le|les|l|ce|cette|quel|quelle)$/.test(place)) place = city || 'Paris';
  const tomorrow = /\bdemain\b/.test(t);
  try {
    const g = await (await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=fr&format=json`)).json();
    const loc = g && g.results && g.results[0];
    if (!loc) return `Je ne trouve pas la ville « ${place} », Monsieur.`;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2`;
    const w = await (await fetchWithTimeout(url)).json();
    const d = w.daily;
    if (tomorrow) {
      return `Demain à ${loc.name} : ${WEATHER[d.weather_code[1]] || 'temps variable'}, entre ${Math.round(d.temperature_2m_min[1])} et ${Math.round(d.temperature_2m_max[1])} degrés, avec ${d.precipitation_probability_max[1] ?? 0} pour cent de risque de pluie.`;
    }
    const c = w.current;
    return `À ${loc.name}, il fait ${Math.round(c.temperature_2m)} degrés, ${WEATHER[c.weather_code] || 'temps variable'}, vent à ${Math.round(c.wind_speed_10m)} kilomètres heure. Aujourd'hui, entre ${Math.round(d.temperature_2m_min[0])} et ${Math.round(d.temperature_2m_max[0])} degrés, ${d.precipitation_probability_max[0] ?? 0} pour cent de risque de pluie.`;
  } catch (e) {
    return "Je n'arrive pas à joindre le service météo pour le moment, Monsieur.";
  }
}

// ---------- Wikipédia ----------
const WIKI_RE = /^(?:(?:dis[- ]moi |explique[- ]moi |sais[- ]tu )?(?:qui (?:est|etait|sont|etaient|a (?:invente|cree|ecrit|fonde|decouvert|peint|compose|realise))|c'est quoi|c'etait quoi|qu'est[- ]ce que c'est que|qu'est[- ]ce qu'(?:un|une|on appelle)?|qu'est[- ]ce que|que (?:veut dire|signifie)|definition (?:de|du|des|d')|definis|parle[- ]moi (?:de|du|des|d')|que sais[- ]tu (?:sur|de|du|des)|raconte[- ]moi l'histoire (?:de|du|des|d')|ou (?:se trouve|est situe|est situee|se situe)|quelle est la capitale (?:de|du|des|d')|quand (?:est ne|est nee|est mort|est morte|a eu lieu)))\s+(.+)$/;

async function wikiAnswer(t, original) {
  const m = t.match(WIKI_RE);
  if (!m) return null;
  let subject = m[1].replace(/^(le|la|les|l'|un|une|des|du|de|d')\s*/, '').replace(/\s+(exactement|en gros|vraiment)$/, '').trim();
  if (/^quelle est la capitale/.test(t)) subject = 'capitale ' + subject;
  // Retrouve le sujet avec ses accents dans la phrase d'origine (même longueur après normalisation NFC).
  const o = String(original || '').normalize('NFC');
  const idx = strip(o).lastIndexOf(subject);
  if (idx >= 0 && strip(o).length === o.length) subject = o.slice(idx, idx + subject.length);
  try {
    const s = await (await fetchWithTimeout(`https://fr.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(subject)}&limit=1`)).json();
    const page = s && s.pages && s.pages[0];
    if (!page) return null;
    const sum = await (await fetchWithTimeout(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`)).json();
    const extract = String((sum && sum.extract) || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!extract) return null;
    const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];
    return sentences.slice(0, 3).join(' ').trim() + ' Source : Wikipédia.';
  } catch (e) {
    return "Je n'arrive pas à joindre Wikipédia pour le moment, Monsieur.";
  }
}

// Recherche Wikipédia sur la question entière (sans Claude ni IA locale) : on ne garde l'article que
// s'il partage au moins deux mots importants avec la question (ou un seul si la question est courte).
const STOP = new Set('le la les un une des du de d l a au aux et ou en dans sur pour par avec sans est sont etait qui que quoi quel quelle quels quelles comment combien pourquoi quand ou est-ce ce cette ces mon ma mes ton ta tes son sa ses notre votre leur il elle on nous vous ils elles je tu me te se y ne pas plus moins tres fait faire dit dire peut peux veux savoir sais connais explique moi dis rocket monsieur stp svp plait sil merci bonjour'.split(' '));
function keywords(t) { return strip(t).replace(/[^a-z0-9' -]/g, ' ').split(/[\s'-]+/).filter((w) => w.length > 2 && !STOP.has(w)); }

async function searchAnswer(question) {
  const words = keywords(question);
  if (!words.length) return null;
  try {
    const s = await (await fetchWithTimeout(`https://fr.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(words.join(' '))}&limit=3`)).json();
    for (const page of (s && s.pages) || []) {
      const hay = keywords(`${page.title} ${page.description || ''} ${String(page.excerpt || '').replace(/<[^>]+>/g, '')}`);
      const common = words.filter((w) => hay.some((h) => h.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
      if (common.length < Math.min(2, words.length)) continue;
      const sum = await (await fetchWithTimeout(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`)).json();
      const extract = String((sum && sum.extract) || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (!extract) continue;
      const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];
      return `D'après Wikipédia, ${page.title} : ${sentences.slice(0, 3).join(' ').trim()}`;
    }
  } catch (e) { return null; }
  return null;
}

// ---------- Petites conversations ----------
const JOKES = [
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.",
  "Que dit un escargot quand il croise une limace ? Oh, un nudiste !",
  "Quel est le comble pour un électricien ? De ne pas être au courant.",
  "Pourquoi les poissons détestent-ils l'ordinateur ? À cause du net.",
  "Que fait une fraise sur un cheval ? Tagada, tagada.",
  "Quel est le sport préféré des insectes ? Le cricket.",
];
function smallTalk(t) {
  if (/\b(blague|histoire drole|fais[- ]moi rire)\b/.test(t)) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (/^(bonjour|salut|bonsoir|coucou|hello)\b/.test(t) && t.split(' ').length <= 4) return 'Bonjour Monsieur. Que puis-je faire pour vous ?';
  if (/\b(comment (vas[- ]tu|ca va|tu vas|allez[- ]vous))\b/.test(t)) return 'Parfaitement bien, Monsieur, merci. Et vous ?';
  if (/\b(qui es[- ]tu|tu es qui|presente[- ]toi|comment tu t'appelles)\b/.test(t)) return "Je suis Rocket, votre assistant personnel : marchés, actualité, cuisine, bien-être, planning, et toutes vos questions.";
  if (/^(merci|merci beaucoup|merci rocket)$/.test(t)) return 'Avec plaisir, Monsieur.';
  if (/\b(que sais[- ]tu faire|tu sais faire quoi|aide|qu'est[- ]ce que tu peux faire)\b/.test(t)) return "Je peux vous lire la matinale, donner l'état des marchés, la météo, l'heure, faire des calculs, répondre à vos questions de culture générale, gérer votre planning, votre coach bien-être, proposer des recettes et lancer de la musique.";
  return null;
}

// Renvoie une réponse (texte) ou null si la question n'est pas couverte.
async function answer(question, { city } = {}) {
  const t = strip(question).replace(/[?!.]+$/, '').trim();
  return timeAnswer(t) || mathAnswer(t) || smallTalk(t) || (await weatherAnswer(t, city)) || (await wikiAnswer(t, question));
}

module.exports = { answer, searchAnswer, keywords, evaluate, normalizeMath, mathAnswer, timeAnswer, weatherAnswer, wikiAnswer, smallTalk, wordsToNumber, WIKI_RE };
