import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { httpErrorCode, httpErrorMessage } from './http-error';

function httpError(
  status: number,
  headers?: Record<string, string>,
  body?: unknown,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    headers: headers ? new HttpHeaders(headers) : undefined,
    error: body,
  });
}

function limitError(message?: string): HttpErrorResponse {
  return httpError(403, undefined, { code: 'LIMIT_EXCEEDED', message });
}

describe('httpErrorMessage', () => {
  it('returns the fallback for non-HTTP errors', () => {
    expect(httpErrorMessage(new Error('boom'), { fallback: 'Nope.' })).toBe('Nope.');
  });

  it('prefers a caller override for the exact status', () => {
    const msg = httpErrorMessage(httpError(401), {
      overrides: { 401: 'Invalid username or password.' },
    });
    expect(msg).toBe('Invalid username or password.');
  });

  it('reports an offline/network failure for status 0', () => {
    expect(httpErrorMessage(httpError(0))).toContain('reach the server');
  });

  it('handles 429 without a Retry-After header', () => {
    expect(httpErrorMessage(httpError(429))).toBe(
      'Too many attempts. Please slow down and try again.',
    );
  });

  it('uses Retry-After seconds in the 429 message', () => {
    const msg = httpErrorMessage(httpError(429, { 'Retry-After': '30' }));
    expect(msg).toBe('Too many attempts. Please wait 30 seconds and try again.');
  });

  it('renders Retry-After of 1 second without a plural', () => {
    const msg = httpErrorMessage(httpError(429, { 'Retry-After': '1' }));
    expect(msg).toBe('Too many attempts. Please wait 1 second and try again.');
  });

  it('rolls large Retry-After values up to minutes', () => {
    const msg = httpErrorMessage(httpError(429, { 'Retry-After': '120' }));
    expect(msg).toBe('Too many attempts. Please wait 2 minutes and try again.');
  });

  it('reports a server-side failure for 5xx', () => {
    expect(httpErrorMessage(httpError(503))).toContain('on our end');
  });

  it('falls back for an unmapped 4xx', () => {
    expect(httpErrorMessage(httpError(418), { fallback: 'Login failed.' })).toBe('Login failed.');
  });

  it('surfaces the server message verbatim for a reached limit', () => {
    const msg = httpErrorMessage(limitError('You have reached your board limit (3/3).'), {
      fallback: 'Creating board failed.',
    });
    expect(msg).toBe('You have reached your board limit (3/3).');
  });

  it('uses a generic limit message when the server omits one', () => {
    expect(httpErrorMessage(limitError('   '))).toContain('reached your plan limit');
  });

  it('prefers the limit message over a same-status override', () => {
    const msg = httpErrorMessage(limitError('Board limit reached.'), {
      overrides: { 403: 'Current password is incorrect.' },
    });
    expect(msg).toBe('Board limit reached.');
  });

  it('does not treat an ordinary 403 (code FORBIDDEN) as a limit', () => {
    const forbidden = httpError(403, undefined, { code: 'FORBIDDEN', message: 'Nope.' });
    const msg = httpErrorMessage(forbidden, {
      overrides: { 403: 'Current password is incorrect.' },
    });
    expect(msg).toBe('Current password is incorrect.');
  });
});

describe('httpErrorCode', () => {
  it('reads the backend error code', () => {
    expect(httpErrorCode(limitError('x'))).toBe('LIMIT_EXCEEDED');
  });

  it('returns null for non-HTTP errors and bodies without a code', () => {
    expect(httpErrorCode(new Error('boom'))).toBeNull();
    expect(httpErrorCode(httpError(500, undefined, 'plain text'))).toBeNull();
  });
});
