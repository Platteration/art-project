/* Small helpers shared by the account service. Web-standard APIs only, so the
   same code runs in a Cloudflare Worker and in Node (see dev.mjs). */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text) {
  return encoder.encode(text);
}

export function b64url(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function b64urlText(text) {
  return b64url(utf8(text));
}

export function b64urlToText(text) {
  return decoder.decode(b64urlDecode(text));
}

export function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `bytes` random bytes as base64url, for state, nonces and one-time codes. */
export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)));
}

export async function hmacSha256(secret, text) {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(text)));
}

/** Equal-length, constant-time string comparison (no early exit on a mismatch). */
export function timingSafeEqual(a, b) {
  const x = utf8(String(a));
  const y = utf8(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function error(status, code, message) {
  return json({ error: code, message }, status);
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store', ...headers } });
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** A hardened cookie: HttpOnly, SameSite=Lax, Secure whenever the site is served over https. */
export function cookie(name, value, { maxAge, secure, path = '/' }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Stripe-style form encoding: nested objects and arrays become `a[b][0]=v`. */
export function formEncode(params, prefix = '') {
  const pairs = [];
  const walk = (value, key) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}[${k}]` : k);
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  walk(params, prefix);
  return pairs.join('&');
}
