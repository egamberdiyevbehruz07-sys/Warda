import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 10000;
const publicUrl = String(process.env.MINIAPP_URL || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
if (publicUrl) process.env.URL = publicUrl;
else console.warn('MINIAPP_URL/RENDER_EXTERNAL_URL is not set. Dashboard cache refresh cannot call its background endpoint until the public Render URL is configured.');

const functionDir = path.join(root, 'netlify', 'functions');
const allowedFunctions = new Set(['tg-dashboard', 'daily-telegram-report-background', 'telegram-bot']);
const functions = new Map();
for (const name of allowedFunctions) {
  const file = path.join(functionDir, `${name}.mjs`);
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.default !== 'function') throw new Error(`Missing handler for ${name}`);
  functions.set(name, mod.default);
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
};

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function runFunction(name, req, res, url) {
  const handler = functions.get(name);
  if (!handler) return send(res, 404, 'Not found');
  const body = await readBody(req);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || ['host', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  const request = new Request(url, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
  });
  const response = await handler(request);
  const responseHeaders = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value; });
  send(res, response.status, Buffer.from(await response.arrayBuffer()), responseHeaders);
}

async function serveMiniApp(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  if (pathname === '/') return send(res, 302, '', { Location: '/tg/' });
  if (pathname === '/tg') return send(res, 301, '', { Location: '/tg/' });
  if (pathname !== '/tg/' && pathname !== '/tg/index.html') return send(res, 404, 'Not found');
  try {
    const data = await fs.readFile(path.join(root, 'tg', 'index.html'));
    return send(res, 200, req.method === 'HEAD' ? '' : data, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self' https: data:; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://api.telegram.org https://api-admin.billz.ai https://*.supabase.co; frame-ancestors https://web.telegram.org https://*.telegram.org;"
    });
  } catch (error) {
    console.error('Mini App static file error:', error);
    return send(res, 500, 'Mini App file could not be loaded.');
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
    const match = url.pathname.match(/^\/.netlify\/functions\/([\w-]+)\/?$/);
    if (match) {
      if (!allowedFunctions.has(match[1])) return send(res, 404, 'Function not found');
      return await runFunction(match[1], req, res, url.href);
    }
    return await serveMiniApp(req, res, url.pathname);
  } catch (error) {
    console.error('Mini App request failed:', error?.stack || error);
    if (!res.headersSent) send(res, error.status || 500, JSON.stringify({ error: error.message || 'Server error' }), { 'Content-Type': 'application/json; charset=utf-8' });
  }
}).listen(port, '0.0.0.0', () => console.log(`Stock Book Telegram Mini App listening on port ${port}; public URL: ${process.env.URL || '(not configured)'}`));
