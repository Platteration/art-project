// A loopback static server for the tests and for playtesting by hand: it sends the pages with the
// Content-Security-Policy from _headers (so the policy is enforced as a header, as every host sends
// it, as well as by the <meta> copy), the fonts with the CORS header the host configs give them, and
// a missing file as 404.html with status 404. Never exposed beyond 127.0.0.1.
//   node tests/serve.mjs [root] [port]     (port 0 or none: a free port, printed)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webp': 'image/webp' };

export function serve(root, port = 0) {
  root = path.resolve(root);
  const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  const csp = (/Content-Security-Policy:\s*(.+)/.exec(headers) || [, ''])[1].trim();
  const notFound = path.join(root, '404.html');
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { p = '/'; }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.normalize(path.join(root, p));
    const h = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' };
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /(^|\/)\.(?!well-known\/)/.test(p)) {
      res.writeHead(404, { ...h, 'content-type': TYPES['.html'], 'content-security-policy': csp });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
      return;
    }
    h['content-type'] = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
    if (f.endsWith('.html')) h['content-security-policy'] = csp;
    if (p.startsWith('/fonts/')) h['access-control-allow-origin'] = '*';
    res.writeHead(200, h);
    res.end(fs.readFileSync(f));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { base } = await serve(root, +(process.argv[3] || 0));
  console.log(`serving ${path.resolve(root)} at ${base} (Ctrl+C to stop)`);
}
