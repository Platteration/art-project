#!/usr/bin/env node
/* Runs the account service and the static site together on Node, with no
   Cloudflare account: the Worker's fetch handler is called with Node-built
   Request objects and an in-memory store (persisted to server/.dev-store.json).

     node server/dev.mjs            # http://localhost:8000
     PORT=8787 node server/dev.mjs

   Configuration is read from server/.dev.vars (KEY=value lines, the same file
   `wrangler dev` reads) and from the environment; the environment wins.
   See docs/sso-setup.md. */

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';

import worker from './worker.js';
import { MemoryStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const port = Number(process.env.PORT) || 8000;

function readDevVars() {
  const file = join(here, '.dev.vars');
  const vars = {};
  if (!existsSync(file)) return vars;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    vars[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return vars;
}

const env = { ...readDevVars() };
for (const [k, v] of Object.entries(process.env)) if (/^[A-Z0-9_]+$/.test(k)) env[k] = v;
if (!env.SESSION_SECRET) {
  // A fixed development secret, so sessions survive a restart. Never used in production:
  // wrangler secrets are set separately (docs/sso-setup.md).
  env.SESSION_SECRET = 'development-only-secret-not-for-production-0000';
  console.warn('SESSION_SECRET not set; using a development-only secret.');
}
if (!env.APP_REDIRECT_SCHEMES) env.APP_REDIRECT_SCHEMES = 'drawdraw,exp,http';
env.STORE = new MemoryStore({ file: join(here, '.dev-store.json'), fs });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* The static site, as the Worker's ASSETS binding would serve it. Only files
   under the repository root, never the server's own directory or dotfiles. */
env.ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const rel = normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (rel.split(/[\/\\]/).some((part) => part.startsWith('.') || part === 'server')) return new Response('Not found', { status: 404 });
    let file = join(root, rel);
    if (!file.startsWith(root)) return new Response('Not found', { status: 404 });
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      createReadStream(file).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    });
    return new Response(body, { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
  },
};

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const request = new Request(`http://${req.headers.host || `localhost:${port}`}${req.url}`, {
      method: req.method,
      headers,
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });
    const response = await worker.fetch(request, env, { waitUntil() {} });
    const out = {};
    for (const [k, v] of response.headers) {
      if (k === 'set-cookie') continue;
      out[k] = v;
    }
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(port, () => {
  console.log(`Portrait Value Studio + account service: http://localhost:${port}`);
  console.log(`  Google sign-in: ${env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'configured' : 'not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)'}`);
  console.log(`  Stripe:         ${env.STRIPE_SECRET_KEY ? 'configured' : 'not configured (STRIPE_SECRET_KEY)'}`);
  console.log(`  Webhook secret: ${env.STRIPE_WEBHOOK_SECRET ? 'set' : 'not set (STRIPE_WEBHOOK_SECRET)'}`);
});
