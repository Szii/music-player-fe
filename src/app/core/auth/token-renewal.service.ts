import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

import { AuthResponse, UsersService } from '../../api/generated';
import { SessionService } from './session.service';

/**
 * Keeps the access token fresh using the HttpOnly refresh cookie.
 *
 * `/auth/login` sets the refresh cookie; `/auth/refresh` exchanges it for a new
 * access token (the browser sends the cookie automatically — no credentials are
 * stored client-side). A timer renews shortly before the access token expires,
 * and a 401 triggers an on-demand refresh-and-retry (see the auth error
 * interceptor). Because renewal relies on the cookie rather than a password, it
 * keeps working across reloads.
 */
@Injectable({ providedIn: 'root' })
export class TokenRenewalService {
  private readonly session = inject(SessionService);
  private readonly usersApi = inject(UsersService);

  /** How long before expiry to renew proactively. */
  private static readonly LEAD_MS = 60_000;
  /** Never schedule sooner than this, to avoid a tight renewal loop. */
  private static readonly MIN_DELAY_MS = 1_000;

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** A single in-flight refresh, shared so concurrent 401s don't stampede. */
  private refreshInFlight$: Observable<boolean> | null = null;

  constructor() {
    this.session.logout$.subscribe(() => this.stop());
  }

  /**
   * On app start: the access token lives in memory only, so after a reload it's
   * gone. If a session was established, restore the access token from the
   * refresh cookie and begin proactive renewal. Resolves once the initial
   * refresh settles, so route guards run with the token already in place.
   */
  async bootstrap(): Promise<void> {
    if (!this.session.hasSession()) {
      return;
    }

    const ok = await this.runRefresh();
    if (!ok) {
      // The refresh cookie is gone/invalid — clear the stale session marker so
      // the guard treats the user as logged out.
      this.session.clear();
      return;
    }

    this.start();
  }

  /** Begin (or restart) the proactive renewal timer. */
  start(): void {
    this.schedule();
  }

  stop(): void {
    this.clearTimer();
    this.refreshInFlight$ = null;
  }

  /**
   * Refresh the access token now, de-duplicating concurrent callers. Emits
   * `true` on success (token stored) and `false` on failure.
   */
  refreshOnce(): Observable<boolean> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.callRefresh().pipe(
        map(() => true),
        catchError(() => of(false)),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1),
      );
    }
    return this.refreshInFlight$;
  }

  private schedule(): void {
    this.clearTimer();

    if (!this.session.getToken()) {
      return;
    }

    const msUntilExpiry = this.session.msUntilExpiry();
    if (!Number.isFinite(msUntilExpiry)) {
      // No expiry claim — nothing to renew against.
      return;
    }

    const delay = Math.max(
      TokenRenewalService.MIN_DELAY_MS,
      msUntilExpiry - TokenRenewalService.LEAD_MS,
    );

    this.timer = setTimeout(() => this.renew(), delay);
  }

  private renew(): void {
    this.refreshOnce().subscribe(ok => {
      if (ok) {
        this.schedule();
      } else {
        this.session.logout();
      }
    });
  }

  private callRefresh(): Observable<AuthResponse> {
    // The refresh token travels in the HttpOnly cookie; the required parameter
    // here is a generated-client artifact that is never sent.
    return this.usersApi.refreshUserToken({ refreshToken: '' }).pipe(
      tap(res => {
        if (!res.token) {
          throw new Error('Refresh response had no token.');
        }
        this.session.setToken(res.token);
      }),
    );
  }

  private async runRefresh(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.refreshOnce().subscribe(ok => resolve(ok));
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
