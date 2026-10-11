/* A complete fake world for the service: an in-memory store, a Google that
   signs id_tokens with a throwaway RSA key, and a Stripe that records what it
   was asked. The Worker is called exactly as Cloudflare would call it. */

import worker, { SESSION_COOKIE, OAUTH_COOKIE } from '../worker.js';
import { MemoryStore } from '../store.js';
import { JWKS_ENDPOINT, TOKEN_ENDPOINT } from '../google.js';
import { b64url, b64urlText, now } from '../util.js';

export const ORIGIN = 'https://studio.test';
export const CLIENT_ID = 'test-client.apps.googleusercontent.com';
export const SECRET = 'unit-test-session-secret-that-is-long-enough-0001';
export const WEBHOOK_SECRET = 'whsec_test_secret';

let rsa;
async function rsaKey() {
  if (rsa) return rsa;
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  rsa = { pair, jwk: { ...jwk, kid: 'test-kid', use: 'sig', alg: 'RS256' } };
  return rsa;
}

export async function googleIdToken(claims, { kid = 'test-kid' } = {}) {
  const { pair } = await rsaKey();
  const header = b64urlText(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = b64urlText(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      email: 'ada@example.com',
      email_verified: true,
      name: 'Ada Lovelace',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      iat: now(),
      exp: now() + 3600,
      ...claims,
    })
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function makeEnv(overrides = {}) {
  const { jwk } = await rsaKey();
  const stripe = { calls: [], nextCheckoutId: 'cs_test_1', prices: { price_pro: 799, price_sup: 500 } };
  const google = { tokenResponse: null, exchanges: [] };

  const fetchMock = async (url, init = {}) => {
    const u = String(url);
    if (u === JWKS_ENDPOINT) {
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600', 'content-type': 'application/json' } });
    }
    if (u === TOKEN_ENDPOINT) {
      google.exchanges.push(Object.fromEntries(new URLSearchParams(init.body)));
      const body = google.tokenResponse || { id_token: await googleIdToken({}), access_token: 'ya29.test', token_type: 'Bearer' };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://api.stripe.com/v1/')) {
      const path = u.slice('https://api.stripe.com/v1'.length);
      const params = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
      stripe.calls.push({ method: init.method, path, params, headers: init.headers });
      if (init.method === 'GET' && path.startsWith('/prices/')) {
        const id = decodeURIComponent(path.slice('/prices/'.length));
        if (!(id in stripe.prices)) return new Response(JSON.stringify({ error: { message: `No such price: ${id}` } }), { status: 404 });
        return new Response(JSON.stringify({ id, unit_amount: stripe.prices[id], currency: 'usd', recurring: null }));
      }
      if (init.method === 'POST' && path === '/checkout/sessions') {
        const id = stripe.nextCheckoutId;
        return new Response(JSON.stringify({ id, url: `https://checkout.stripe.com/c/pay/${id}` }));
      }
      return new Response(JSON.stringify({ error: { message: `unmocked ${path}` } }), { status: 500 });
    }
    throw new Error(`Unexpected fetch in test: ${u}`);
  };

  const env = {
    STORE: new MemoryStore(),
    SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'google-secret',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_DRAWDRAW_PRO: 'price_pro',
    STRIPE_PRICE_STUDIO_SUPPORTER: 'price_sup',
    PUBLIC_ORIGIN: ORIGIN,
    APP_REDIRECT_SCHEMES: 'drawdraw,exp',
    fetch: fetchMock,
    ...overrides,
  };
  return { env, stripe, google };
}

/** A tiny client that keeps cookies like a browser, or sends a bearer token like the app. */
export class Client {
  constructor(env, { origin = ORIGIN } = {}) {
    this.env = env;
    this.origin = origin;
    this.cookies = {};
    this.token = null;
  }

  async request(path, { method = 'GET', body, headers = {}, sameSite = true } = {}) {
    const h = new Headers(headers);
    const cookie = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookie) h.set('cookie', cookie);
    if (this.token) h.set('authorization', `Bearer ${this.token}`);
    if (method !== 'GET' && sameSite && !h.has('origin')) h.set('origin', this.origin);
    if (body !== undefined && !h.has('content-type')) h.set('content-type', 'application/json');
    const req = new Request(`${this.origin}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'manual',
    });
    const res = await worker.fetch(req, this.env, { waitUntil() {} });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [name, value] = pair.split('=');
      const maxAge = attrs.map((a) => a.trim()).find((a) => a.startsWith('Max-Age='));
      if (maxAge && Number(maxAge.slice(8)) <= 0) delete this.cookies[name];
      else this.cookies[name] = value;
    }
    return res;
  }

  async json(path, opts) {
    const res = await this.request(path, opts);
    return { status: res.status, body: await res.json(), res };
  }
}

export { SESSION_COOKIE, OAUTH_COOKIE };
