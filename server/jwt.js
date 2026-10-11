/* Compact HS256 JSON Web Tokens for sessions, OAuth state and one-time codes.
   Every token carries a `typ` so one kind can never be presented as another. */

import { b64urlText, b64urlToText, hmacSha256, b64url, now, timingSafeEqual } from './util.js';

const HEADER = b64urlText(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export async function signToken(secret, typ, claims, ttlSeconds) {
  const iat = now();
  const payload = b64urlText(JSON.stringify({ ...claims, typ, iat, exp: iat + ttlSeconds }));
  const signature = b64url(await hmacSha256(secret, `${HEADER}.${payload}`));
  return `${HEADER}.${payload}.${signature}`;
}

/**
 * Returns the claims, or null when the token is malformed, forged, expired or
 * of another type. Never throws on bad input.
 */
export async function verifyToken(secret, typ, token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = b64url(await hmacSha256(secret, `${parts[0]}.${parts[1]}`));
  if (!timingSafeEqual(expected, parts[2])) return null;
  let claims;
  try {
    claims = JSON.parse(b64urlToText(parts[1]));
  } catch {
    return null;
  }
  if (!claims || claims.typ !== typ) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= now()) return null;
  return claims;
}
