import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { SessionService } from './session.service';
import { TokenRenewalService } from './token-renewal.service';

const AUTH_ENDPOINT_MARKER = '/auth/';
/** Endpoints that exchange the HttpOnly refresh cookie. */
const COOKIE_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
/** Marks a request already retried after a refresh, to avoid retry loops. */
const RETRIED = new HttpContextToken<boolean>(() => false);

function isCookieEndpoint(req: HttpRequest<unknown>): boolean {
  return COOKIE_ENDPOINTS.some(path => req.url.includes(path));
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);

  // Login sets the refresh cookie and refresh sends it: these need credentials.
  if (isCookieEndpoint(req)) {
    return next(req.clone({ withCredentials: true }));
  }

  const token = session.getToken();
  if (!token || req.url.includes(AUTH_ENDPOINT_MARKER)) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/**
 * On a 401 from an authenticated endpoint, try a single refresh via the cookie
 * and retry the request. If refreshing fails, end the session.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const renewal = inject(TokenRenewalService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const isAuthFailure =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.includes(AUTH_ENDPOINT_MARKER) &&
        session.getToken() != null &&
        !req.context.get(RETRIED);

      if (!isAuthFailure) {
        return throwError(() => error);
      }

      return renewal.refreshOnce().pipe(
        switchMap(refreshed => {
          if (!refreshed) {
            session.logout();
            return throwError(() => error);
          }

          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${session.getToken()}` },
            context: req.context.set(RETRIED, true),
          });
          return next(retried);
        }),
      );
    }),
  );
};
