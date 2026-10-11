/* The account service: one sign-in (Google) shared by Portrait Value Studio on
   the web and the DrawDraw app, plus a Stripe-backed shop whose purchases land
   as entitlements on that account.

   Runs as a Cloudflare Worker (wrangler.jsonc at the repository root serves the
   static site from the same origin and routes /api/* here) and, unchanged, under
   Node through dev.mjs. Web-standard APIs only; no dependencies.

   Routes (all JSON unless noted):
     GET  /api/health                      what is configured and whether the store answers
     GET  /api/auth/google/start           browser redirect to Google (client=web | client=app)
     GET  /api/auth/google/callback        Google returns here; sets the cookie or hands the app a code
     POST /api/auth/exchange               app: one-time code + PKCE verifier -> bearer token
     POST /api/auth/logout                 web: clears the session cookie
     GET  /api/me                          who is signed in and what they own
     GET  /api/shop/products               the catalogue with Stripe prices
     POST /api/shop/checkout               signed in: start a Stripe Checkout session
     GET  /api/shop/orders                 signed in: past orders
     POST /api/stripe/webhook              Stripe -> grants entitlements, records orders

   Sessions are HS256 tokens signed with SESSION_SECRET: an HttpOnly cookie for
   the web page, a bearer token for the app. Entitlements are read from the
   store on every request, so a refund or a manual revocation takes effect at
   once, without waiting for the token to expire. */

import { authorizationUrl, exchangeCode, verifyIdToken } from './google.js';
import { signToken, verifyToken } from './jwt.js';
import { stripeRequest, verifyWebhookSignature } from './stripe.js';
import { CATALOGUE, availableProducts, findProduct } from './catalogue.js';
import { keys } from './store.js';
import { b64url, cookie, error, json, now, parseCookies, randomToken, redirect, sha256 } from './util.js';

export const SESSION_COOKIE = 'pvs_session';
export const OAUTH_COOKIE = 'pvs_oauth';
const STATE_TTL = 10 * 60;
const CODE_TTL = 2 * 60;
const EVENT_TTL = 7 * 24 * 3600;
const PRICE_CACHE_TTL = 10 * 60;

let priceCache = new Map(); // priceId -> { price, expires }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }
    try {
      return await route(request, url, env, ctx);
    } catch (err) {
      console.error(`${request.method} ${url.pathname} failed:`, err);
      return error(500, 'internal', 'Something went wrong on our side. Please try again.');
    }
  },
};

async function route(request, url, env, ctx) {
  const { method } = request;
  const path = url.pathname;
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return error(503, 'not_configured', 'SESSION_SECRET is missing or shorter than 32 characters.');
  }
  if (!env.STORE) return error(503, 'not_configured', 'No STORE binding.');

  if (path === '/api/health' && method === 'GET') return health(env);
  if (path === '/api/auth/google/start' && method === 'GET') return authStart(url, env);
  if (path === '/api/auth/google/callback' && method === 'GET') return authCallback(request, url, env);
  if (path === '/api/auth/exchange' && method === 'POST') return authExchange(request, env);
  if (path === '/api/auth/logout' && method === 'POST') return logout(request, url, env);
  if (path === '/api/me' && method === 'GET') return me(request, env);
  if (path === '/api/shop/products' && method === 'GET') return products(env);
  if (path === '/api/shop/checkout' && method === 'POST') return checkout(request, url, env);
  if (path === '/api/shop/orders' && method === 'GET') return orders(request, env);
  if (path === '/api/stripe/webhook' && method === 'POST') return webhook(request, env, ctx);
  return error(404, 'not_found', `No route for ${method} ${path}.`);
}

/* ---------- configuration ---------- */

function publicOrigin(url, env) {
  return (env.PUBLIC_ORIGIN || url.origin).replace(/\/$/, '');
}

function googleConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function appSchemes(env) {
  return (env.APP_REDIRECT_SCHEMES || 'drawdraw')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function sessionDays(env) {
  const n = Number(env.SESSION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

async function health(env) {
  let store = false;
  try {
    const probe = randomToken(8);
    await env.STORE.put('health:probe', probe, { expirationTtl: 60 });
    store = (await env.STORE.get('health:probe')) === probe;
  } catch (err) {
    console.error('Store probe failed:', err);
  }
  return json({
    ok: store,
    store,
    google: googleConfigured(env),
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    products: availableProducts(env).map((p) => p.id),
    appSchemes: appSchemes(env),
  });
}

/* ---------- sign in ---------- */

/** A same-origin path for the browser to return to: `/shop.html`, never `//evil` or a full URL. */
export function safeWebRedirect(value) {
  if (typeof value !== 'string' || value === '') return '/';
  if (!/^\/(?![\/\\])[^\\\r\n]*$/.test(value)) return null;
  return value;
}

/** An app redirect is accepted only on an allow-listed scheme. */
export function safeAppRedirect(value, schemes) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (!schemes.includes(scheme)) return null;
  if (/[\r\n#]/.test(value)) return null;
  return value;
}

function withQuery(target, params) {
  const sep = target.includes('?') ? '&' : '?';
  return `${target}${sep}${new URLSearchParams(params)}`;
}

async function authStart(url, env) {
  if (!googleConfigured(env)) return error(503, 'not_configured', 'Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
  const client = url.searchParams.get('client') || 'web';
  const redirectUri = `${publicOrigin(url, env)}/api/auth/google/callback`;
  const loginHint = url.searchParams.get('login_hint') || undefined;

  if (client === 'app') {
    const target = safeAppRedirect(url.searchParams.get('redirect'), appSchemes(env));
    if (!target) return error(400, 'bad_redirect', `redirect must use one of these schemes: ${appSchemes(env).join(', ')}.`);
    const challenge = url.searchParams.get('code_challenge') || '';
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return error(400, 'bad_challenge', 'code_challenge must be a base64url SHA-256 (S256).');
    const state = await signToken(env.SESSION_SECRET, 'state', { client, redirect: target, challenge }, STATE_TTL);
    return redirect(authorizationUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri, state, loginHint }));
  }

  if (client !== 'web') return error(400, 'bad_client', 'client must be web or app.');
  const target = safeWebRedirect(url.searchParams.get('redirect'));
  if (!target) return error(400, 'bad_redirect', 'redirect must be a path on this site.');
  // The state is bound to this browser through a short-lived cookie, so a
  // callback URL planted in another browser cannot sign it in (login CSRF).
  const nonce = randomToken(16);
  const nonceHash = b64url(await sha256(nonce));
  const state = await signToken(env.SESSION_SECRET, 'state', { client, redirect: target, nonceHash }, STATE_TTL);
  return redirect(authorizationUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri, state, loginHint }), 302, {
    'set-cookie': cookie(OAUTH_COOKIE, nonce, { maxAge: STATE_TTL, secure: url.protocol === 'https:' }),
  });
}

async function authCallback(request, url, env) {
  const secure = url.protocol === 'https:';
  const clearOauth = cookie(OAUTH_COOKIE, '', { maxAge: 0, secure });
  const state = await verifyToken(env.SESSION_SECRET, 'state', url.searchParams.get('state'));
  if (!state) return failPage('This sign-in link has expired or is not valid. Please start again.', clearOauth);

  const denied = url.searchParams.get('error');
  if (denied) {
    const target = state.client === 'app' ? withQuery(state.redirect, { error: denied }) : withQuery(state.redirect, { signin: denied });
    return redirect(target, 302, { 'set-cookie': clearOauth });
  }

  if (state.client === 'web') {
    const nonce = parseCookies(request.headers.get('cookie'))[OAUTH_COOKIE];
    if (!nonce || b64url(await sha256(nonce)) !== state.nonceHash) {
      return failPage('This sign-in was started in another browser. Please start again here.', clearOauth);
    }
  }

  const code = url.searchParams.get('code');
  if (!code) return failPage('Google did not return a code. Please start again.', clearOauth);

  let claims;
  try {
    const tokens = await exchangeCode({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${publicOrigin(url, env)}/api/auth/google/callback`,
      code,
      fetch: env.fetch || fetch,
    });
    claims = await verifyIdToken(tokens.id_token, { clientId: env.GOOGLE_CLIENT_ID, fetch: env.fetch || fetch });
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    return failPage('Google could not confirm who you are. Please try again.', clearOauth);
  }

  const user = await upsertUser(env, claims);

  if (state.client === 'app') {
    // The app gets a short-lived code, not the session: it must present the
    // PKCE verifier to exchange it, so a code caught by another app on the
    // phone that registered the same URL scheme is useless to it.
    const appCode = await signToken(env.SESSION_SECRET, 'code', { sub: user.id, challenge: state.challenge }, CODE_TTL);
    return redirect(withQuery(state.redirect, { code: appCode }), 302, { 'set-cookie': clearOauth });
  }

  const session = await issueSession(env, user.id);
  const headers = new Headers({ location: state.redirect, 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(SESSION_COOKIE, session, { maxAge: sessionDays(env) * 86400, secure }));
  headers.append('set-cookie', clearOauth);
  return new Response(null, { status: 302, headers });
}

async function authExchange(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.code !== 'string' || typeof body.code_verifier !== 'string') {
    return error(400, 'bad_request', 'Send JSON with code and code_verifier.');
  }
  const claims = await verifyToken(env.SESSION_SECRET, 'code', body.code);
  if (!claims) return error(401, 'bad_code', 'This code has expired or is not valid. Sign in again.');
  if (b64url(await sha256(body.code_verifier)) !== claims.challenge) {
    return error(401, 'bad_verifier', 'The code does not belong to this app session.');
  }
  const user = await env.STORE.get(keys.user(claims.sub), 'json');
  if (!user) return error(401, 'no_user', 'This account no longer exists.');
  const token = await issueSession(env, user.id);
  return json({ token, expiresAt: now() + sessionDays(env) * 86400, user: publicUser(user), entitlements: await entitlementList(env, user.id) });
}

async function logout(request, url, env) {
  const session = await currentSession(request, env);
  if (session?.via === 'cookie' && !sameOrigin(request, url)) return error(403, 'bad_origin', 'Cross-site requests are not accepted.');
  return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: url.protocol === 'https:' }) });
}

async function me(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ user: null, entitlements: [] });
  const user = await env.STORE.get(keys.user(session.sub), 'json');
  if (!user) return json({ user: null, entitlements: [] });
  return json({ user: publicUser(user), entitlements: await entitlementList(env, user.id), via: session.via });
}

/* ---------- shop ---------- */

async function products(env) {
  const configured = Boolean(env.STRIPE_SECRET_KEY);
  const list = configured ? availableProducts(env) : [];
  const out = [];
  for (const p of list) {
    let price = null;
    try {
      price = await lookupPrice(env, p.priceId);
    } catch (err) {
      console.error(`Could not read Stripe price ${p.priceId} for ${p.id}:`, err.message);
    }
    out.push({ id: p.id, name: p.name, blurb: p.blurb, grants: p.grants || [], physical: Boolean(p.physical), price });
  }
  return json({ configured, products: out });
}

async function lookupPrice(env, priceId) {
  const cached = priceCache.get(priceId);
  if (cached && cached.expires > now()) return cached.price;
  const p = await stripeRequest(env.STRIPE_SECRET_KEY, 'GET', `/prices/${encodeURIComponent(priceId)}`, null, { fetch: env.fetch || fetch });
  const price = { amount: p.unit_amount, currency: p.currency, recurring: Boolean(p.recurring) };
  priceCache.set(priceId, { price, expires: now() + PRICE_CACHE_TTL });
  return price;
}

async function checkout(request, url, env) {
  if (!env.STRIPE_SECRET_KEY) return error(503, 'not_configured', 'The shop is not configured (STRIPE_SECRET_KEY).');
  const session = await currentSession(request, env);
  if (!session) return error(401, 'signed_out', 'Sign in before buying, so the purchase can be attached to your account.');
  if (session.via === 'cookie' && !sameOrigin(request, url)) return error(403, 'bad_origin', 'Cross-site requests are not accepted.');
  const user = await env.STORE.get(keys.user(session.sub), 'json');
  if (!user) return error(401, 'no_user', 'This account no longer exists.');

  const body = await request.json().catch(() => ({}));
  const product = findProduct(env, body.product);
  if (!product) return error(404, 'no_product', 'That product is not for sale.');

  const owned = await entitlementList(env, user.id);
  if (!product.physical && product.grants?.length && product.grants.every((g) => owned.includes(g))) {
    return error(409, 'already_owned', 'Your account already has this.');
  }

  const origin = publicOrigin(url, env);
  const params = {
    mode: 'payment',
    line_items: [{ price: product.priceId, quantity: 1 }],
    success_url: `${origin}/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/shop.html?checkout=cancelled`,
    client_reference_id: user.id,
    customer_email: user.email || undefined,
    metadata: { user: user.id, product: product.id },
    payment_intent_data: { metadata: { user: user.id, product: product.id } },
  };
  if (product.physical) {
    const countries = (env.SHIP_COUNTRIES || 'US,CA,GB,AU,NZ,DE,FR,NL,SE,NO,DK,FI,IE,ES,IT,PT,AT,BE,CH')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    params.shipping_address_collection = { allowed_countries: countries };
  }
  const cs = await stripeRequest(env.STRIPE_SECRET_KEY, 'POST', '/checkout/sessions', params, {
    fetch: env.fetch || fetch,
    idempotencyKey: randomToken(16),
  });
  await env.STORE.put(keys.stripeSession(cs.id), { user: user.id, product: product.id, created: now() }, { expirationTtl: 2 * 86400 });
  return json({ url: cs.url, id: cs.id });
}

async function orders(request, env) {
  const session = await currentSession(request, env);
  if (!session) return error(401, 'signed_out', 'Sign in to see your orders.');
  const { keys: names } = await env.STORE.list({ prefix: keys.orderPrefix(session.sub) });
  const list = [];
  for (const { name } of names) {
    const order = await env.STORE.get(name, 'json');
    if (order) list.push(order);
  }
  list.sort((a, b) => b.created - a.created);
  return json({ orders: list });
}

async function webhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return error(503, 'not_configured', 'STRIPE_WEBHOOK_SECRET is not set.');
  const raw = await request.text();
  const ok = await verifyWebhookSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return error(400, 'bad_signature', 'Stripe signature did not verify.');

  const event = JSON.parse(raw);
  // Stripe retries until it sees a 2xx, so the same event can arrive twice.
  if (await env.STORE.get(keys.event(event.id))) return json({ received: true, duplicate: true });

  if (
    (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const result = await fulfil(env, event.data.object);
    await env.STORE.put(keys.event(event.id), { type: event.type, at: now() }, { expirationTtl: EVENT_TTL });
    return json({ received: true, ...result });
  }

  await env.STORE.put(keys.event(event.id), { type: event.type, at: now() }, { expirationTtl: EVENT_TTL });
  return json({ received: true, ignored: event.type });
}

/** Records the order and grants what the product promises. Returns what it did, for the webhook log. */
export async function fulfil(env, cs) {
  let userId = cs.metadata?.user || cs.client_reference_id;
  let productId = cs.metadata?.product;
  if (!userId || !productId) {
    const link = await env.STORE.get(keys.stripeSession(cs.id), 'json');
    userId = userId || link?.user;
    productId = productId || link?.product;
  }
  if (!userId || !productId) {
    console.error(`Checkout ${cs.id} paid but carries no user/product; nothing granted.`);
    return { fulfilled: false, reason: 'no_user_or_product' };
  }
  const product = CATALOGUE.find((p) => p.id === productId);
  if (!product) {
    console.error(`Checkout ${cs.id} paid for unknown product ${productId}; recorded, nothing granted.`);
  }
  const created = cs.created || now();
  const shipping = cs.shipping_details || cs.collected_information?.shipping_details || null;
  const order = {
    id: cs.id,
    product: productId,
    name: product?.name || productId,
    amount: cs.amount_total,
    currency: cs.currency,
    status: 'paid',
    created,
    email: cs.customer_details?.email || null,
    shipping,
    fulfilled: product ? !product.physical : false,
  };
  await env.STORE.put(keys.order(userId, created, cs.id), order);

  const granted = [];
  if (product?.grants?.length) {
    const current = (await env.STORE.get(keys.entitlements(userId), 'json')) || {};
    for (const key of product.grants) {
      if (!current[key]) granted.push(key);
      current[key] = { grantedAt: now(), order: cs.id, product: productId };
    }
    await env.STORE.put(keys.entitlements(userId), current);
  }
  return { fulfilled: true, user: userId, product: productId, granted };
}

/* ---------- sessions and users ---------- */

async function issueSession(env, userId) {
  return signToken(env.SESSION_SECRET, 'session', { sub: userId, sid: randomToken(8) }, sessionDays(env) * 86400);
}

async function currentSession(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const claims = await verifyToken(env.SESSION_SECRET, 'session', auth.slice(7).trim());
    return claims ? { ...claims, via: 'bearer' } : null;
  }
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return null;
  const claims = await verifyToken(env.SESSION_SECRET, 'session', token);
  return claims ? { ...claims, via: 'cookie' } : null;
}

/** For cookie-authenticated writes: the page that sent this must be ours. */
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

async function upsertUser(env, claims) {
  const id = `google:${claims.sub}`;
  const existing = (await env.STORE.get(keys.user(id), 'json')) || { id, createdAt: now(), provider: 'google' };
  const user = {
    ...existing,
    email: claims.email || existing.email || null,
    name: claims.name || existing.name || null,
    picture: claims.picture || existing.picture || null,
    lastSignInAt: now(),
  };
  await env.STORE.put(keys.user(id), user);
  return user;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture };
}

async function entitlementList(env, userId) {
  const ent = (await env.STORE.get(keys.entitlements(userId), 'json')) || {};
  return Object.keys(ent).sort();
}

function failPage(message, clearCookie) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign-in problem</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 1em;color:#1e2b22;background:#efe7d6}a{color:#2c4a36}</style>
<h1>Could not sign you in</h1><p>${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p><p><a href="/">Back to the studio</a></p>`;
  return new Response(html, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': clearCookie } });
}
