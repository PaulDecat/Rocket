'use strict';
// Claude via Claude Code installé sur l'ordinateur (abonnement de l'utilisateur, sans frais en plus).

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let available = null;

function childEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // sinon Claude Code facturerait la clé API
  return env;
}

function detect() {
  if (available !== null) return Promise.resolve(available);
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 8000, env: childEnv() }, (err, stdout) => {
      available = !err && /\d/.test(String(stdout));
      resolve(available);
    });
  });
}

const SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Réponse orale de 2 à 6 phrases, sans markdown.' },
    market: {
      type: 'array', maxItems: 4,
      items: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' }, range: { type: 'string', enum: ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max'] } }, required: ['symbol', 'name'] },
    },
    chart: {
      type: 'object',
      properties: {
        title: { type: 'string' }, kind: { type: 'string', enum: ['line', 'bar'] }, unit: { type: 'string' }, source: { type: 'string' },
        series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, points: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' }, y: { type: 'number' } }, required: ['x', 'y'] } } }, required: ['name', 'points'] } },
      },
    },
    figure: {
      type: 'object',
      properties: { label: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' }, date: { type: 'string' }, change: { type: 'string' }, source: { type: 'string' } },
    },
  },
  required: ['answer'],
};

function statusFor(tool) {
  const i = tool.input || {};
  if (tool.name === 'WebSearch') return `Recherche web : ${String(i.query || '').slice(0, 70)}`;
  if (tool.name === 'WebFetch') {
    let host = '';
    try { host = new URL(i.url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
    return `Lecture de ${host || 'la page'}`;
  }
  return null; // outils internes (StructuredOutput…) : rien à afficher
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* ignore */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* ignore */ } }
  return { answer: String(text).trim() };
}

// Modèle rapide pour la voix (modifiable dans .env : ROCKET_CLAUDE_MODEL, ROCKET_CLAUDE_EFFORT).
function speedArgs() {
  const model = process.env.ROCKET_CLAUDE_MODEL || 'sonnet';
  const effort = process.env.ROCKET_CLAUDE_EFFORT || 'low';
  const args = [];
  if (model && model !== 'default') args.push('--model', model);
  if (effort && effort !== 'default') args.push('--effort', effort);
  return args;
}

// Pose la question à Claude Code. onText reçoit le texte au fil de l'eau (réponse en flux).
function ask({ prompt, system, onStatus, onText, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocket-claude-'));
    const args = [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch',
      '--permission-mode', 'dontAsk', '--no-session-persistence', '--strict-mcp-config',
      '--setting-sources', '', '--system-prompt', system, ...speedArgs(),
    ];
    const child = spawn('claude', args, { cwd: dir, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', errBuf = '', final = null, done = false, streamed = '';
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch (e) { /* ignore */ }
      fs.rm(dir, { recursive: true, force: true }, () => {});
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('Claude Code a mis trop de temps à répondre.')), timeoutMs);
    const handle = (line) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { return; }
      if (ev.type === 'stream_event' && ev.event && ev.event.type === 'content_block_delta' && ev.event.delta && ev.event.delta.type === 'text_delta') {
        streamed += ev.event.delta.text;
        if (onText) onText(ev.event.delta.text);
      }
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const c of ev.message.content) {
          const st = c.type === 'tool_use' ? statusFor(c) : null;
          if (st && onStatus) onStatus(st);
        }
      }
      if (ev.type === 'result') {
        if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) final = { error: ev.result || ev.subtype };
        else final = { text: String(ev.result || streamed) };
      }
    };
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.on('data', (d) => { errBuf += d; if (errBuf.length > 4000) errBuf = errBuf.slice(-4000); });
    child.on('error', (e) => finish(e));
    child.on('close', () => {
      if (buf) handle(buf);
      if (final && !final.error && (final.text || streamed)) finish(null, { text: final.text || streamed, streamed });
      else finish(new Error((final && final.error) || errBuf.trim().split('\n').pop() || 'Claude Code sans réponse'));
    });
    child.stdin.end(prompt);
  });
}

module.exports = { detect, ask, SCHEMA, childEnv, extractJson, statusFor, speedArgs };
