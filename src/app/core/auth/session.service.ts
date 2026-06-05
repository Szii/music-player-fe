import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, catchError, of } from 'rxjs';
import { BASE_PATH } from '../../api/generated';
import { BoardPlaybackService } from '../services/board-playback.service';
import { getJwtExpiryMs } from './jwt';

/**
 * Non-sensitive flag marking that the user has an active session, i.e. a refresh
 * cookie worth restoring from. The access token itself is kept in memory only
 * (never persisted), so it must be restored via `/auth/refresh` after a reload.
 */
const SESSION_FLAG_KEY = 'has_session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly router = inject(Router);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly http = inject(HttpClient);
  private readonly basePath = inject(BASE_PATH);

  private readonly logoutSubject = new Subject<void>();
  /** Emits when the user logs out. Stores subscribe to clear their state. */
  readonly logout$: Observable<void> = this.logoutSubject.asObservable();

  /** Access token, kept in memory only — never persisted. */
  private accessToken: string | null = null;

  setToken(token: string): void {
    this.accessToken = token;
    localStorage.setItem(SESSION_FLAG_KEY, '1');
  }

  getToken(): string | null {
    return this.accessToken;
  }

  /** Whether a session was established (a refresh cookie is worth restoring). */
  hasSession(): boolean {
    return localStorage.getItem(SESSION_FLAG_KEY) === '1';
  }

  clear(): void {
    this.accessToken = null;
    localStorage.removeItem(SESSION_FLAG_KEY);
  }

  /** Expiry of the current token in ms since the epoch, or `null` if unknown. */
  getExpiryMs(): number | null {
    return getJwtExpiryMs(this.getToken());
  }

  /** Milliseconds until the token expires; `Infinity` when there's no expiry. */
  msUntilExpiry(): number {
    const expiry = this.getExpiryMs();
    return expiry == null ? Infinity : expiry - Date.now();
  }

  isExpired(): boolean {
    return this.msUntilExpiry() <= 0;
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !this.isExpired();
  }

  logout(): void {
    // Ask the backend to clear the HttpOnly refresh cookie. Best-effort and
    // fire-and-forget: local state is cleared regardless so the user is signed
    // out immediately even if the network call fails. The cookie still rides
    // along here because `clear()` only touches in-memory/local state.
    this.revokeRefreshCookie();

    this.boardPlayback.reset();
    this.logoutSubject.next();
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  private revokeRefreshCookie(): void {
    this.http
      .post(`${this.basePath}/auth/logout`, null, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }
}