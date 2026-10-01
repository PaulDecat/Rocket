'use strict';
// Voix neuronales Microsoft gratuites (msedge-tts) + option ElevenLabs.

const VOICES = [
  { id: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne', gender: 'f' },
  { id: 'fr-FR-DeniseNeural', label: 'Denise', gender: 'f' },
  { id: 'fr-FR-EloiseNeural', label: 'Éloïse', gender: 'f' },
  { id: 'fr-CA-SylvieNeural', label: 'Sylvie (Québec)', gender: 'f' },
  { id: 'fr-BE-CharlineNeural', label: 'Charline (Belgique)', gender: 'f' },
  { id: 'fr-CH-ArianeNeural', label: 'Ariane (Suisse)', gender: 'f' },
  { id: 'fr-FR-RemyMultilingualNeural', label: 'Rémy', gender: 'm' },
  { id: 'fr-FR-HenriNeural', label: 'Henri', gender: 'm' },
  { id: 'fr-CA-JeanNeural', label: 'Jean (Québec)', gender: 'm' },
];
const DEFAULT_VOICE = 'fr-FR-RemyMultilingualNeural'; // voix de Rocket

function provider() {
  const p = (process.env.TTS_PROVIDER || '').toLowerCase();
  if (p === 'browser') return 'browser';
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE) return 'elevenlabs';
  return 'edge';
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const cache = new Map();
const CACHE_MAX = 60;
function cacheGet(k) { const v = cache.get(k); if (v) { cache.delete(k); cache.set(k, v); } return v; }
function cacheSet(k, v) { cache.set(k, v); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }

async function edgeOnce(text, voice, rate) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), { rate: `${rate >= 0 ? '+' : ''}${rate}%` });
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Délai de synthèse dépassé')), 20000);
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => { clearTimeout(timer); resolve(); });
      audioStream.on('close', () => { clearTimeout(timer); resolve(); });
      audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const buf = Buffer.concat(chunks);
    if (buf.length < 500) throw new Error('Audio vide');
    return buf;
  } finally {
    try { tts.close(); } catch (e) { /* ignore */ }
  }
}

async function elevenlabs(text, rate) {
  const voice = process.env.ELEVENLABS_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.max(0.7, Math.min(1.2, 1 + rate / 100)) } }),
  });
  if (!res.ok) throw new Error('ElevenLabs HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function synthesize({ text, voice, rate = 0 }) {
  text = String(text || '').slice(0, 3000).trim();
  if (!text) throw new Error('Texte vide');
  rate = Math.max(-50, Math.min(50, Math.round(Number(rate) || 0)));
  const p = provider();
  if (p === 'browser') throw new Error('Voix du navigateur demandées');
  if (!VOICES.some((v) => v.id === voice)) voice = DEFAULT_VOICE;
  const key = [p, voice, rate, text].join('|');
  const hit = cacheGet(key);
  if (hit) return hit;
  let buf, err;
  for (let i = 0; i < 2 && !buf; i++) {
    try { buf = p === 'elevenlabs' ? await elevenlabs(text, rate) : await edgeOnce(text, voice, rate); } catch (e) { err = e; }
  }
  if (!buf) throw err || new Error('Synthèse impossible');
  cacheSet(key, buf);
  return buf;
}

module.exports = { VOICES, DEFAULT_VOICE, provider, synthesize, escapeXml };
