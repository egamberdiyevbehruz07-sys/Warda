// Stock Book Telegram Mini App — standalone Render server.
// Hosts only /tg/ and the dashboard API/background worker needed by the Mini App.
// It intentionally does not host the main Stock Book catalog or Netlify site.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tgDashboard from './netlify/functions/tg-dashboard.mjs';
import dashboardBackground from './netlify/functions/daily-telegram-report-background.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 10000;
process.env.URL = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || process.env.URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const send = (res, status, body, headers = {}) => {
  if (res.headersSent) return;
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

async function readBody(req, limit = 1_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function requestFor(req, url, body) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) continue;
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value != null) headers.set(key, String(value));
  }
  return new Request(url.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}
async function runApi(name, req, res, url) {
  if (req.method !== 'POST') return send(res, 405, 'POST only', { Allow: 'POST' });
  const body = await readBody(req);
  const apiRequest = requestFor(req, url, body);
  if (name === 'daily-telegram-report-background') {
    // Respond promptly like a Netlify background function, then do the longer cache build.
    send(res, 202, 'Dashboard cache build accepted.');
    dashboardBackground(apiRequest).catch(err => console.error('Dashboard background build failed:', err?.stack || err));
    return;
  }
  const output = await tgDashboard(apiRequest);
  const headers = {};
  output.headers.forEach((value, key) => { headers[key] = value; });
  send(res, output.status, Buffer.from(await output.arrayBuffer()), headers);
}
async function serveMiniApp(res) {
  const file = path.join(root, 'tg', 'index.html');
  const data = await fs.readFile(file);
  send(res, 200, data, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-cache' });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
    if (url.pathname === '/' || url.pathname === '/tg' || url.pathname === '/tg/' || url.pathname === '/tg/index.html') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'GET only', { Allow: 'GET, HEAD' });
      return serveMiniApp(res);
    }
    const match = url.pathname.match(/^\/.netlify\/functions\/(tg-dashboard|daily-telegram-report-background)\/?$/);
    if (match) return await runApi(match[1], req, res, url);
    return send(res, 404, 'Not found');
  } catch (err) {
    console.error('Request failed:', err?.stack || err);
    send(res, err?.status || 500, JSON.stringify({ error: err?.status === 413 ? 'Request body too large' : 'Mini App server error' }), { 'Content-Type': 'application/json; charset=utf-8' });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Stock Book Telegram Mini App listening on port ${PORT}`);
  console.log('Public URL:', process.env.URL);
});
