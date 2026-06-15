import { HttpErrorResponse } from '@angular/common/http';

/** Friendly, user-facing messages keyed by HTTP status code. */
export type HttpErrorOverrides = Partial<Record<number, string>>;

export interface HttpErrorMessageOptions {
  /**
   * Caller-supplied messages for specific statuses, e.g.
   * `{ 401: 'Invalid username or password.' }`. Checked before the defaults.
   */
  overrides?: HttpErrorOverrides;
  /** Message used when nothing more specific matches. */
  fallback?: string;
}

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

/** Backend error codes (mirror of the server `ErrorCode` enum) the UI branches on. */
export const ERROR_CODE = {
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
} as const;

/** Shape of the backend `ErrorResponse` body carried on `HttpErrorResponse.error`. */
interface ApiErrorBody {
  code?: string;
  message?: string;
}

/**
 * Maps an HTTP/network error to a concise, user-facing message.
 *
 * Resolution order:
 *  1. A reached-limit (`LIMIT_EXCEEDED`) — the server sends a specific,
 *     human-readable message (which limit, current usage), so we surface it
 *     verbatim regardless of the caller's fallback.
 *  2. A caller override for the exact status (domain copy like "Invalid
 *     username or password.").
 *  3. Sensible defaults for the cases every request shares — network/offline
 *     (status 0), rate limiting (429, with `Retry-After` when the server
 *     exposes it) and server errors (5xx).
 *  4. The fallback.
 *
 * This keeps per-feature handlers focused on the statuses that carry domain
 * meaning while guaranteeing the cross-cutting cases are never shown as a
 * generic "operation failed" message.
 */
export function httpErrorMessage(
  error: unknown,
  options: HttpErrorMessageOptions = {},
): string {
  const fallback = options.fallback ?? DEFAULT_FALLBACK;

  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  // A reached limit is a 403 the user can act on; the server's message names
  // the specific limit, so prefer it over any per-status override or fallback.
  const body = apiErrorBody(error);
  if (body?.code === ERROR_CODE.LIMIT_EXCEEDED) {
    return body.message?.trim() || 'You’ve reached your plan limit for this action.';
  }

  const override = options.overrides?.[error.status];
  if (override) {
    return override;
  }

  // status 0: the request never reached the server (offline, DNS, CORS, timeout).
  if (error.status === 0) {
    return 'Can’t reach the server. Check your connection and try again.';
  }

  if (error.status === 429) {
    const wait = retryAfterText(error);
    return wait
      ? `Too many attempts. Please wait ${wait} and try again.`
      : 'Too many attempts. Please slow down and try again.';
  }

  if (error.status >= 500) {
    return 'Something went wrong on our end. Please try again in a moment.';
  }

  return fallback;
}

/**
 * Renders the `Retry-After` header as human text (e.g. `"30 seconds"`), or
 * `null` when the header is absent or unusable. Accepts both forms the spec
 * allows: delta-seconds and an HTTP date.
 *
 * Note: with CORS the header is only readable when the server lists it in
 * `Access-Control-Expose-Headers`; otherwise this returns `null` and the
 * caller falls back to a generic rate-limit message.
 */
export function retryAfterText(error: HttpErrorResponse): string | null {
  const header = error.headers?.get('Retry-After');
  if (!header) {
    return null;
  }

  let waitSeconds: number;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) {
    waitSeconds = asSeconds;
  } else {
    const asDate = Date.parse(header);
    if (Number.isNaN(asDate)) {
      return null;
    }
    waitSeconds = (asDate - Date.now()) / 1000;
  }

  if (waitSeconds <= 0) {
    return null;
  }

  if (waitSeconds < 60) {
    const rounded = Math.ceil(waitSeconds);
    return `${rounded} second${rounded === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(waitSeconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Reads the backend `ErrorResponse.code` (e.g. `'LIMIT_EXCEEDED'`, `'CONFLICT'`)
 * from an error, or `null` when it isn't a structured API error. Lets callers
 * branch on the semantic code instead of guessing from the HTTP status.
 */
export function httpErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  return apiErrorBody(error)?.code ?? null;
}

/**
 * Narrows `HttpErrorResponse.error` to the backend `{ code, message }` body.
 * `HttpClient` parses JSON error bodies automatically; anything else (HTML
 * error pages, opaque/network failures) yields `null`.
 */
function apiErrorBody(error: HttpErrorResponse): ApiErrorBody | null {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && typeof (body as ApiErrorBody).code === 'string') {
    return body as ApiErrorBody;
  }
  return null;
}
