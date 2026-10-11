import { test } from 'node:test';
import assert from 'node:assert/strict';

import { signWebhookPayload } from '../stripe.js';
import { b64url, sha256 } from '../util.js';
import { Client, ORIGIN, SESSION_COOKIE, OAUTH_COOKIE, WEBHOOK_SECRET, makeEnv } from './helpers.mjs';

/** Walks a browser through Google and back. Returns the final redirect response. */
async function signInWeb(client, { redirect = '/shop.html', dropNonceCookie = false, denied } = {}) {
  const start = await client.request(`/api/auth/google/start?redirect=${encodeURIComponent(redirect)}`);
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin + google.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(google.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/google/callback`);
  assert.equal(google.searchParams.get('scope'), 'openid email profile');
  const state = google.searchParams.get('state');
  assert.ok(client.cookies[OAUTH_COOKIE], 'the login-CSRF nonce cookie was set');
  if (dropNonceCookie) delete client.cookies[OAUTH_COOKIE];
  const q = new URLSearchParams({ state, ...(denied ? { error: denied } : { code: 'google-code-1' }) });
  return client.request(`/api/auth/google/callback?${q}`);
}

async function paidEvent(env, client, overrides = {}) {
  const session = {
    id: 'cs_test_1',
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 799,
    currency: 'usd',
    created: 1_760_000_000,
    client_reference_id: 'google:1234567890',
    customer_details: { email: 'ada@example.com' },
    metadata: { user: 'google:1234567890', product: 'drawdraw-pro' },
    ...overrides.session,
  };
  const event = { id: overrides.id || 'evt_1', type: overrides.type || 'checkout.session.completed', data: { object: session } };
  const raw = JSON.stringify(event);
  return client.request('/api/stripe/webhook', {
    method: 'POST',
    body: raw,
    sameSite: false,
    headers: { 'stripe-signature': await signWebhookPayload(raw, overrides.secret || WEBHOOK_SECRET), 'content-type': 'application/json' },
  });
}

test('health reports the store and what is configured', async () => {
  const { env } = await makeEnv();
  const { status, body } = await new Client(env).json('/api/health');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    store: true,
    google: true,
    stripe: true,
    webhook: true,
    products: ['drawdraw-pro', 'studio-supporter'],
    appSchemes: ['drawdraw', 'exp'],
  });
  const bare = await new Client((await makeEnv({ GOOGLE_CLIENT_SECRET: undefined, STRIPE_SECRET_KEY: undefined })).env).json('/api/health');
  assert.equal(bare.body.google, false);
  assert.equal(bare.body.stripe, false);
});

test('refuses to run with a weak or missing session secret', async () => {
  const { env } = await makeEnv({ SESSION_SECRET: 'short' });
  const { status, body } = await new Client(env).json('/api/me');
  assert.equal(status, 503);
  assert.equal(body.error, 'not_configured');
});

test('web: sign in, buy, get the entitlement, see the order, sign out', async () => {
  const { env, stripe, google } = await makeEnv();
  const client = new Client(env);

  assert.deepEqual((await client.json('/api/me')).body, { user: null, entitlements: [] });

  const done = await signInWeb(client);
  assert.equal(done.status, 302);
  assert.equal(done.headers.get('location'), '/shop.html');
  const setCookies = done.headers.getSetCookie();
  const sessionCookie = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /Max-Age=2592000/);
  assert.ok(setCookies.some((c) => c.startsWith(`${OAUTH_COOKIE}=;`)), 'nonce cookie cleared');
  assert.equal(google.exchanges[0].code, 'google-code-1');
  assert.equal(google.exchanges[0].redirect_uri, `${ORIGIN}/api/auth/google/callback`);

  const me = await client.json('/api/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    user: { id: 'google:1234567890', email: 'ada@example.com', name: 'Ada Lovelace', picture: 'https://lh3.googleusercontent.com/a/photo' },
    entitlements: [],
    via: 'cookie',
  });

  const products = await client.json('/api/shop/products');
  assert.equal(products.body.configured, true);
  assert.deepEqual(
    products.body.products.map((p) => [p.id, p.price.amount, p.price.currency, p.grants]),
    [
      ['drawdraw-pro', 799, 'usd', ['drawdraw.pro']],
      ['studio-supporter', 500, 'usd', ['studio.supporter']],
    ]
  );

  const checkout = await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' } });
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const call = stripe.calls.find((c) => c.path === '/checkout/sessions');
  assert.equal(call.params.mode, 'payment');
  assert.equal(call.params['line_items[0][price]'], 'price_pro');
  assert.equal(call.params['metadata[user]'], 'google:1234567890');
  assert.equal(call.params['metadata[product]'], 'drawdraw-pro');
  assert.equal(call.params.customer_email, 'ada@example.com');
  assert.equal(call.params.success_url, `${ORIGIN}/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(call.params.cancel_url, `${ORIGIN}/shop.html?checkout=cancelled`);
  assert.ok(call.headers['idempotency-key']);
  assert.equal(call.params['shipping_address_collection[allowed_countries][0]'], undefined, 'digital goods ask no address');

  const hook = await paidEvent(env, client);
  assert.equal(hook.status, 200);
  assert.deepEqual(await hook.json(), { received: true, fulfilled: true, user: 'google:1234567890', product: 'drawdraw-pro', granted: ['drawdraw.pro'] });

  assert.deepEqual((await client.json('/api/me')).body.entitlements, ['drawdraw.pro']);

  const again = await paidEvent(env, client);
  assert.deepEqual(await again.json(), { received: true, duplicate: true });

  const orders = await client.json('/api/shop/orders');
  assert.equal(orders.body.orders.length, 1);
  assert.equal(orders.body.orders[0].id, 'cs_test_1');
  assert.equal(orders.body.orders[0].amount, 799);
  assert.equal(orders.body.orders[0].fulfilled, true);

  const owned = await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' } });
  assert.equal(owned.status, 409);

  const out = await client.json('/api/auth/logout', { method: 'POST' });
  assert.equal(out.status, 200);
  assert.equal(client.cookies[SESSION_COOKIE], undefined);
  assert.deepEqual((await client.json('/api/me')).body, { user: null, entitlements: [] });
});

test('web: a callback without the browser nonce cookie is refused (login CSRF)', async () => {
  const { env } = await makeEnv();
  const res = await signInWeb(new Client(env), { dropNonceCookie: true });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /another browser/);
});

test('web: a user who cancels at Google is sent back with a reason, not signed in', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  const res = await signInWeb(client, { redirect: '/', denied: 'access_denied' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/?signin=access_denied');
  assert.equal(client.cookies[SESSION_COOKIE], undefined);
});

test('web: bad redirects and tampered state are refused', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  assert.equal((await client.request('/api/auth/google/start?redirect=//evil.example')).status, 400);
  assert.equal((await client.request('/api/auth/google/start?redirect=https://evil.example')).status, 400);
  const res = await client.request('/api/auth/google/callback?state=forged&code=x');
  assert.equal(res.status, 400);
  const unconfigured = await new Client((await makeEnv({ GOOGLE_CLIENT_ID: undefined })).env).request('/api/auth/google/start');
  assert.equal(unconfigured.status, 503);
});

test('web: cookie-authenticated writes need a same-origin page', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  await signInWeb(client);
  const noOrigin = await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' }, sameSite: false });
  assert.equal(noOrigin.status, 403);
  const other = await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' }, headers: { origin: 'https://evil.example' } });
  assert.equal(other.status, 403);
  const logout = await client.json('/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(logout.status, 403);
  assert.ok(client.cookies[SESSION_COOKIE], 'still signed in');
});

test('app: PKCE sign-in hands out a bearer token that sees the same account', async () => {
  const { env } = await makeEnv();
  const web = new Client(env);
  await signInWeb(web);
  await web.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' } });
  await paidEvent(env, web);

  const app = new Client(env);
  const verifier = 'app-generated-verifier-0123456789-0123456789-0123456789';
  const challenge = b64url(await sha256(verifier));
  const start = await app.request(
    `/api/auth/google/start?client=app&redirect=${encodeURIComponent('drawdraw://auth')}&code_challenge=${challenge}`
  );
  assert.equal(start.status, 302);
  assert.equal(Object.keys(app.cookies).length, 0, 'the app flow sets no cookies');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const back = await app.request(`/api/auth/google/callback?state=${encodeURIComponent(state)}&code=google-code-2`);
  assert.equal(back.status, 302);
  const deepLink = new URL(back.headers.get('location'));
  assert.equal(deepLink.protocol, 'drawdraw:');
  const code = deepLink.searchParams.get('code');
  assert.ok(code);
  assert.equal(back.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`)), false, 'no session cookie for the app');

  const wrong = await app.json('/api/auth/exchange', { method: 'POST', body: { code, code_verifier: 'someone-elses-verifier' }, sameSite: false });
  assert.equal(wrong.status, 401);
  const forged = await app.json('/api/auth/exchange', { method: 'POST', body: { code: 'nope', code_verifier: verifier }, sameSite: false });
  assert.equal(forged.status, 401);

  const ok = await app.json('/api/auth/exchange', { method: 'POST', body: { code, code_verifier: verifier }, sameSite: false });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, 'ada@example.com');
  assert.deepEqual(ok.body.entitlements, ['drawdraw.pro']);

  app.token = ok.body.token;
  const me = await app.json('/api/me');
  assert.equal(me.body.via, 'bearer');
  assert.deepEqual(me.body.entitlements, ['drawdraw.pro']);

  // Bearer requests are not browser requests: no Origin check applies.
  const checkout = await app.json('/api/shop/checkout', { method: 'POST', body: { product: 'studio-supporter' }, sameSite: false });
  assert.equal(checkout.status, 200);
});

test('app: redirects must use an allowed scheme and carry a challenge', async () => {
  const { env } = await makeEnv();
  const app = new Client(env);
  const challenge = b64url(await sha256('v'.repeat(50)));
  assert.equal((await app.request(`/api/auth/google/start?client=app&redirect=https%3A%2F%2Fevil.example&code_challenge=${challenge}`)).status, 400);
  assert.equal((await app.request(`/api/auth/google/start?client=app&redirect=drawdraw%3A%2F%2Fauth`)).status, 400);
  assert.equal((await app.request(`/api/auth/google/start?client=app&redirect=drawdraw%3A%2F%2Fauth&code_challenge=short`)).status, 400);
  assert.equal((await app.request(`/api/auth/google/start?client=other`)).status, 400);
});

test('webhook: bad signatures are rejected and nothing is granted', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  await signInWeb(client);
  const bad = await paidEvent(env, client, { secret: 'whsec_wrong' });
  assert.equal(bad.status, 400);
  assert.deepEqual((await client.json('/api/me')).body.entitlements, []);
  const none = await new Client((await makeEnv({ STRIPE_WEBHOOK_SECRET: undefined })).env).request('/api/stripe/webhook', { method: 'POST', body: '{}', sameSite: false });
  assert.equal(none.status, 503);
});

test('webhook: unpaid sessions and unrelated events grant nothing', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  await signInWeb(client);
  const unpaid = await paidEvent(env, client, { id: 'evt_unpaid', session: { payment_status: 'unpaid' } });
  assert.deepEqual(await unpaid.json(), { received: true, ignored: 'checkout.session.completed' });
  const other = await paidEvent(env, client, { id: 'evt_other', type: 'payment_intent.created' });
  assert.deepEqual(await other.json(), { received: true, ignored: 'payment_intent.created' });
  assert.deepEqual((await client.json('/api/me')).body.entitlements, []);
  const later = await paidEvent(env, client, { id: 'evt_async', type: 'checkout.session.async_payment_succeeded' });
  assert.equal((await later.json()).fulfilled, true);
  assert.deepEqual((await client.json('/api/me')).body.entitlements, ['drawdraw.pro']);
});

test('webhook: a session without a user records nothing it cannot attribute', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  const res = await paidEvent(env, client, { session: { metadata: {}, client_reference_id: null } });
  assert.deepEqual(await res.json(), { received: true, fulfilled: false, reason: 'no_user_or_product' });
});

test('shop: signed-out checkout, unknown products and an unconfigured Stripe', async () => {
  const { env } = await makeEnv();
  const client = new Client(env);
  assert.equal((await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'drawdraw-pro' } })).status, 401);
  await signInWeb(client);
  assert.equal((await client.json('/api/shop/checkout', { method: 'POST', body: { product: 'nothing' } })).status, 404);
  const off = new Client((await makeEnv({ STRIPE_SECRET_KEY: undefined })).env);
  assert.deepEqual((await off.json('/api/shop/products')).body, { configured: false, products: [] });
});

test('static paths fall through to the assets binding; unknown API paths are 404', async () => {
  const { env } = await makeEnv({ ASSETS: { fetch: async () => new Response('site', { status: 200 }) } });
  const client = new Client(env);
  assert.equal(await (await client.request('/shop.html')).text(), 'site');
  assert.equal((await client.request('/api/nope')).status, 404);
});
