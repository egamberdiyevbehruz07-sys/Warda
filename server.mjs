// Runs Stock Book on any free Node host (Render, Koyeb, Railway, a VPS, ...) instead of Netlify.
// It serves the website, answers /.netlify/functions/* with the SAME function files, runs the schedules
// and the long "-background" jobs. No dependencies. Start command:  node server.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.join(root, 'netlify', 'functions');
const PORT = Number(process.env.PORT) || 8080;
// The functions build their own public address (webhook, Mini App button, background jobs) from URL.
process.env.URL = process.env.URL || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
if (/localhost/.test(process.env.URL)) console.warn('WARNING: set PUBLIC_URL to your public https address (Render does this automatically).');

/* ---------- load the functions ---------- */
const fns = new Map(); // name -> { kind: 'v2' (Request/Response) | 'v1' (event/statusCode), handler, schedule }
for (const f of await fs.readdir(fnDir)) {
  if (!/\.(mjs|js|cjs)$/.test(f)) continue;
  const name = f.replace(/\.(mjs|js|cjs)$/, '');
  let mod;
  try { mod = await import(pathToFileURL(path.join(fnDir, f)).href); }
  catch (e) { console.error('Skipped broken function file', f, '-', e.message); continue; } // one bad file must not stop the whole server
  if (typeof mod.default === 'function') fns.set(name, { kind: 'v2', handler: mod.default, schedule: mod.config && mod.config.schedule });
  else if (mod.default && typeof mod.default.handler === 'function') fns.set(name, { kind: 'v1', handler: mod.default.handler });
  else if (typeof mod.handler === 'function') fns.set(name, { kind: 'v1', handler: mod.handler });
}
console.log('Functions loaded:', [...fns.keys()].join(', '));

/* ---------- helpers ---------- */
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const readBody = req => new Promise((ok, bad) => {
  const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > 25e6) { req.destroy(); bad(new Error('Body too large')); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', bad);
});
const cleanHeaders = h => Object.fromEntries(Object.entries(h).filter(([k]) => !['host', 'connection', 'content-length', 'transfer-encoding', 'expect'].includes(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]));

async function callFunction(name, req, res, url) {
  const fn = fns.get(name);
  if (!fn) return send(res, 404, 'Function not found');
  const body = await readBody(req);
  if (fn.kind === 'v2') {
    const request = new Request(url.href, { method: req.method, headers: cleanHeaders(req.headers), body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    if (name.endsWith('-background')) { // like Netlify background functions: answer 202 now, keep working
      send(res, 202, '');
      Promise.resolve().then(() => fn.handler(request)).catch(e => console.error('Background function failed:', name, e && e.stack || e));
      return;
    }
    const out = await fn.handler(request);
    if (!out) return send(res, 200, '');
    const headers = {}; out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers); res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  const lower = Object.fromEntries(Object.entries(cleanHeaders(req.headers)));
  const event = { httpMethod: req.method, headers: lower, path: url.pathname, rawUrl: url.href, rawQuery: url.search.slice(1), queryStringParameters: Object.fromEntries(url.searchParams), body: body.length ? body.toString('utf8') : null, isBase64Encoded: false };
  const out = await fn.handler(event, {}) || { statusCode: 200, body: '' };
  res.writeHead(out.statusCode || 200, out.headers || {});
  res.end(out.isBase64Encoded ? Buffer.from(out.body || '', 'base64') : (out.body || ''));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
async function serveStatic(pathname, res) {
  // Only the website itself is public: index.html and the tg/ folder. Source code, SQL and notes are never served.
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '/index.html') rel = '/index.html';
  else if (rel === '/tg') return send(res, 301, '', { Location: '/tg/' });
  else if (rel === '/tg/') rel = '/tg/index.html';
  else if (!rel.startsWith('/tg/')) return send(res, 404, 'Not found');
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || /\.(mjs|cjs|sql|txt|toml)$/i.test(file)) return send(res, 404, 'Not found');
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  } catch { send(res, 404, 'Not found'); }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return send(res, 200, 'ok'); // for the keep-awake pinger
    const m = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)\/?$/);
    if (m) return await callFunction(m[1], req, res, url);
    return await serveStatic(url.pathname, res);
  } catch (e) {
    console.error('Request failed:', e && e.stack || e);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: 'Server error' }), { 'Content-Type': 'application/json' });
  }
}).listen(PORT, () => console.log('Stock Book server listening on', PORT, '-', process.env.URL));

/* ---------- schedules (UTC cron, same expressions the Netlify functions declare) ---------- */
export function cronMatch(expr, d) {
  const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const ok = (spec, val) => spec.split(',').some(p => { let m; if (p === '*') return true; if ((m = p.match(/^\*\/(\d+)$/))) return val % Number(m[1]) === 0; if ((m = p.match(/^(\d+)-(\d+)$/))) return val >= +m[1] && val <= +m[2]; return Number(p) === val; });
  return ok(mi, d.getUTCMinutes()) && ok(h, d.getUTCHours()) && ok(dom, d.getUTCDate()) && ok(mon, d.getUTCMonth() + 1) && ok(dow, d.getUTCDay());
}
let lastTick = '';
setInterval(() => {
  const now = new Date(), key = now.toISOString().slice(0, 16);
  if (key === lastTick) return; lastTick = key;
  for (const [name, fn] of fns) {
    if (fn.schedule && cronMatch(fn.schedule, now)) {
      console.log('Scheduled run:', name, key);
      Promise.resolve().then(() => fn.handler(new Request(`http://localhost:${PORT}/.netlify/functions/${name}`, { method: 'POST', body: '{}' }))).catch(e => console.error('Scheduled function failed:', name, e && e.message || e));
    }
  }
}, 15000);
