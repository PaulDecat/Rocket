'use strict';
// Faux YouTube pour les tests : page de consentement, résultats de recherche, page vidéo qui joue un son.
const http = require('http');

function tone(seconds = 20) {
  const rate = 8000, n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return b;
}
const WAV = tone();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function start(port) {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    log.push(url.pathname + url.search);
    const consented = /CONSENT=YES/.test(req.headers.cookie || '');
    const html = (body, title = 'YouTube') => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><title>${esc(title)}</title><body>${body}</body>`); };
    if (url.pathname === '/tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(WAV); }
    if (!consented && (url.pathname === '/results' || url.pathname === '/watch')) {
      return html(`<h1>Avant d'accéder à YouTube</h1><form><button type="button" onclick="document.cookie='CONSENT=YES; path=/'; location.reload()">Tout accepter</button><button type="button">Tout refuser</button></form>`);
    }
    if (url.pathname === '/results') {
      const q = url.searchParams.get('search_query') || '';
      return html(`<ytd-video-renderer><a id="thumbnail" href="/watch?v=abc123&q=${encodeURIComponent(q)}"></a><a id="video-title" title="Vidéo : ${esc(q)}" href="/watch?v=abc123&q=${encodeURIComponent(q)}">Vidéo : ${esc(q)}</a></ytd-video-renderer>`, `${q} - YouTube`);
    }
    if (url.pathname === '/watch') {
      const q = url.searchParams.get('q') || 'suivante';
      return html(`<video src="/tone.wav"></video><button class="ytp-next-button" onclick="location.href='/watch?v=next&q=suivante'">Suivante</button>`, `Vidéo : ${q} - YouTube`);
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, log })));
}

module.exports = { start };
