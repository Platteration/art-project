import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64url, b64urlDecode, formEncode, parseCookies, timingSafeEqual, cookie } from '../util.js';
import { signToken, verifyToken } from '../jwt.js';
import { signWebhookPayload, verifyWebhookSignature } from '../stripe.js';
import { safeAppRedirect, safeWebRedirect } from '../worker.js';
import { availableProducts, priceEnvName } from '../catalogue.js';
import { verifyIdToken } from '../google.js';
import { googleIdToken, makeEnv, CLIENT_ID } from './helpers.mjs';

test('base64url round-trips arbitrary bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 63, 62]);
  assert.deepEqual([...b64urlDecode(b64url(bytes))], [...bytes]);
  assert.ok(!/[+/=]/.test(b64url(bytes)));
});

test('timingSafeEqual compares exactly', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});

test('formEncode nests the way Stripe expects', () => {
  const s = formEncode({ mode: 'payment', line_items: [{ price: 'p_1', quantity: 1 }], metadata: { user: 'google:1' }, skip: undefined });
  assert.equal(s, 'mode=payment&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buser%5D=google%3A1');
});

test('cookies parse and serialize with the hardening flags', () => {
  assert.deepEqual(parseCookies('a=1; b=two%20words; bad; c=3'), { a: '1', b: 'two words', c: '3' });
  assert.equal(cookie('s', 'v', { maxAge: 10, secure: true }), 's=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=10; Secure');
  assert.equal(cookie('s', '', { maxAge: 0, secure: false }), 's=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
});

test('tokens verify only with the right secret, type and lifetime', async () => {
  const secret = 'a-very-long-secret-used-only-in-tests-123456';
  const t = await signToken(secret, 'session', { sub: 'u1' }, 60);
  assert.equal((await verifyToken(secret, 'session', t)).sub, 'u1');
  assert.equal(await verifyToken(secret, 'code', t), null, 'another type is refused');
  assert.equal(await verifyToken('another-very-long-secret-used-only-in-tests-1', 'session', t), null);
  const [h, p, s] = t.split('.');
  assert.equal(await verifyToken(secret, 'session', `${h}.${p}x.${s}`), null, 'tampered payload');
  assert.equal(await verifyToken(secret, 'session', `${h}.${p}.${s.slice(0, -1)}A`), null, 'tampered signature');
  assert.equal(await verifyToken(secret, 'session', 'not.a.token'), null);
  assert.equal(await verifyToken(secret, 'session', undefined), null);
  const expired = await signToken(secret, 'session', { sub: 'u1' }, -1);
  assert.equal(await verifyToken(secret, 'session', expired), null);
});

test('Stripe webhook signatures', async () => {
  const body = '{"id":"evt_1"}';
  const header = await signWebhookPayload(body, 'whsec_x', 1_700_000_000);
  assert.equal(await verifyWebhookSignature(body, header, 'whsec_x', { at: 1_700_000_100 }), true);
  assert.equal(await verifyWebhookSignature(body, header, 'whsec_x', { at: 1_700_000_000 + 301 }), false, 'too old');
  assert.equal(await verifyWebhookSignature(body, header, 'whsec_y', { at: 1_700_000_100 }), false, 'wrong secret');
  assert.equal(await verifyWebhookSignature(body + ' ', header, 'whsec_x', { at: 1_700_000_100 }), false, 'body changed');
  assert.equal(await verifyWebhookSignature(body, `${header},v1=deadbeef`, 'whsec_x', { at: 1_700_000_100 }), true, 'any v1 may match');
  assert.equal(await verifyWebhookSignature(body, 't=abc,v1=00', 'whsec_x'), false);
  assert.equal(await verifyWebhookSignature(body, null, 'whsec_x'), false);
});

test('web redirects stay on this site', () => {
  assert.equal(safeWebRedirect(undefined), '/');
  assert.equal(safeWebRedirect(''), '/');
  assert.equal(safeWebRedirect('/shop.html?x=1'), '/shop.html?x=1');
  assert.equal(safeWebRedirect('//evil.example'), null);
  assert.equal(safeWebRedirect('/\\evil.example'), null);
  assert.equal(safeWebRedirect('https://evil.example/'), null);
  assert.equal(safeWebRedirect('shop.html'), null);
  assert.equal(safeWebRedirect('/a\nLocation: x'), null);
});

test('app redirects need an allow-listed scheme', () => {
  const schemes = ['drawdraw', 'exp'];
  assert.equal(safeAppRedirect('drawdraw://auth', schemes), 'drawdraw://auth');
  assert.equal(safeAppRedirect('exp://192.168.1.4:8081/--/auth', schemes), 'exp://192.168.1.4:8081/--/auth');
  assert.equal(safeAppRedirect('https://evil.example/auth', schemes), null);
  assert.equal(safeAppRedirect('javascript:alert(1)', schemes), null);
  assert.equal(safeAppRedirect('not a url', schemes), null);
  assert.equal(safeAppRedirect(undefined, schemes), null);
});

test('catalogue shows only products with a configured price', () => {
  assert.equal(priceEnvName('drawdraw-pro'), 'STRIPE_PRICE_DRAWDRAW_PRO');
  assert.deepEqual(availableProducts({}).map((p) => p.id), []);
  const list = availableProducts({ STRIPE_PRICE_DRAWDRAW_PRO: 'price_1' });
  assert.deepEqual(list.map((p) => [p.id, p.priceId]), [['drawdraw-pro', 'price_1']]);
});

test('Google id_tokens are checked for signature, issuer, audience and expiry', async () => {
  const { env } = await makeEnv();
  const opts = { clientId: CLIENT_ID, fetch: env.fetch };
  const claims = await verifyIdToken(await googleIdToken({}), opts);
  assert.equal(claims.sub, '1234567890');
  await assert.rejects(verifyIdToken(await googleIdToken({ aud: 'someone-else' }), opts), /another client/);
  await assert.rejects(verifyIdToken(await googleIdToken({ iss: 'https://evil.example' }), opts), /issuer/);
  await assert.rejects(verifyIdToken(await googleIdToken({ exp: 1 }), opts), /expired/);
  await assert.rejects(verifyIdToken(await googleIdToken({ email_verified: false }), opts), /not verified/);
  await assert.rejects(verifyIdToken(await googleIdToken({}, { kid: 'other' }), opts), /unknown key/);
  const good = await googleIdToken({});
  const [h, p, s] = good.split('.');
  await assert.rejects(verifyIdToken(`${h}.${p}.${s.slice(0, -2)}AA`, opts), /signature/);
});
