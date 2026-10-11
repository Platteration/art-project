/* Sign in with Google: the authorization-code flow, run entirely server side so
   neither the web page nor the app ever holds a Google client secret, and the
   id_token check against Google's published signing keys. */

import { b64urlDecode, b64urlToText, formEncode, now } from './util.js';

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export function authorizationUrl({ clientId, redirectUri, state, loginHint }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_ENDPOINT}?${params}`;
}

/** Exchanges the code and returns Google's token response (with id_token). */
export async function exchangeCode({ clientId, clientSecret, redirectUri, code, fetch: f = fetch }) {
  const res = await f(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formEncode({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) {
    throw new Error(`Google token exchange failed: ${body.error || res.status} ${body.error_description || ''}`.trim());
  }
  return body;
}

let jwksCache = { keys: null, expires: 0 };

async function signingKeys(f) {
  if (jwksCache.keys && jwksCache.expires > now()) return jwksCache.keys;
  const res = await f(JWKS_ENDPOINT);
  if (!res.ok) throw new Error(`Could not fetch Google signing keys (${res.status})`);
  const { keys } = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  jwksCache = { keys, expires: now() + (maxAge ? Number(maxAge[1]) : 3600) };
  return keys;
}

/** Drops the cached keys, so a token signed with a key rotated in since the last fetch still verifies. */
export function resetKeyCache() {
  jwksCache = { keys: null, expires: 0 };
}

/**
 * Verifies the RS256 signature, issuer, audience and expiry of a Google id_token
 * and returns its claims. Throws with a reason otherwise.
 */
export async function verifyIdToken(idToken, { clientId, fetch: f = fetch }) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('id_token is not a JWT');
  const header = JSON.parse(b64urlToText(parts[0]));
  if (header.alg !== 'RS256') throw new Error(`Unexpected id_token algorithm ${header.alg}`);

  let keys = await signingKeys(f);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    resetKeyCache();
    keys = await signingKeys(f);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('id_token signed with an unknown key');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('id_token signature is invalid');

  const claims = JSON.parse(b64urlToText(parts[1]));
  if (!ISSUERS.has(claims.iss)) throw new Error('id_token issuer is not Google');
  if (claims.aud !== clientId) throw new Error('id_token was issued for another client');
  if (typeof claims.exp !== 'number' || claims.exp <= now()) throw new Error('id_token has expired');
  if (!claims.sub) throw new Error('id_token has no subject');
  if (claims.email && claims.email_verified === false) throw new Error('Google has not verified this email address');
  return claims;
}
