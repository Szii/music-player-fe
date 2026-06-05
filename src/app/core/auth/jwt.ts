/**
 * Minimal JWT helpers. The token is otherwise treated as opaque — we only read
 * the standard `exp` claim to know when it expires so the session can renew or
 * sign out before requests start failing.
 */

interface JwtPayload {
  /** Expiry, in seconds since the epoch (standard JWT claim). */
  exp?: number;
}

/**
 * Decode a JWT's `exp` claim and return it in milliseconds since the epoch, or
 * `null` if the token is malformed or has no expiry.
 */
export function getJwtExpiryMs(token: string | null): number | null {
  if (!token) {
    return null;
  }

  const payload = decodePayload(token);
  if (payload?.exp == null || !Number.isFinite(payload.exp)) {
    return null;
  }

  return payload.exp * 1000;
}

function decodePayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const json = atob(base64UrlToBase64(parts[1]));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function base64UrlToBase64(value: string): string {
  const replaced = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = replaced.length % 4 === 0 ? '' : '='.repeat(4 - (replaced.length % 4));
  return replaced + padding;
}
