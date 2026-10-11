/* Stripe over plain fetch: Checkout Sessions, price lookups and webhook
   signature checks. No SDK, so the Worker stays dependency free. */

import { formEncode, hex, hmacSha256, now, timingSafeEqual } from './util.js';

export const API = 'https://api.stripe.com/v1';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export async function stripeRequest(secretKey, method, path, params, { fetch: f = fetch, idempotencyKey } = {}) {
  const headers = { authorization: `Bearer ${secretKey}` };
  let url = `${API}${path}`;
  let body;
  if (method === 'GET') {
    const query = params ? formEncode(params) : '';
    if (query) url += `?${query}`;
  } else {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = formEncode(params || {});
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  }
  const res = await f(url, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Stripe ${path} returned ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.stripe = data?.error;
    throw err;
  }
  return data;
}

/**
 * Checks a `Stripe-Signature` header against the raw request body. Returns
 * true only for a fresh (within the tolerance) signature made with `secret`.
 */
export async function verifyWebhookSignature(rawBody, header, secret, { tolerance = SIGNATURE_TOLERANCE_SECONDS, at = now() } = {}) {
  if (!header || !secret) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s && s.trim());
    if (k === 't') timestamp = Number(v);
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(at - timestamp) > tolerance) return false;
  const expected = hex(await hmacSha256(secret, `${timestamp}.${rawBody}`));
  return signatures.some((s) => timingSafeEqual(expected, s));
}

/** Builds a header the way Stripe does, for tests and the local CLI-free check. */
export async function signWebhookPayload(rawBody, secret, timestamp = now()) {
  return `t=${timestamp},v1=${hex(await hmacSha256(secret, `${timestamp}.${rawBody}`))}`;
}
