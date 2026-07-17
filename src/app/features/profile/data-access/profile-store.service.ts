import { Injectable, computed, inject, signal } from '@angular/core';
import { translate } from '@jsverse/transloco';
import { Observable, forkJoin, map, tap } from 'rxjs';

import {
  ChangeEmailRequest,
  SessionsResponse,
  Track,
  User,
  UserBoardsLimits,
  UserChangePasswordRequest,
  UsersService,
} from '../../../api/generated';
import { SessionService } from '../../../core/auth/session.service';
import { TracksStore } from '../../../core/services/tracks-store.service';
import { SessionsStore } from '../../../core/services/sessions-store.service';

interface LoadedProfileState {
  status: 'loaded';
  user: User;
  trackNames: ReadonlyMap<string, string>;
  sessionNames: ReadonlyMap<string, string>;
  boardLimitsBySessionId: ReadonlyMap<string, UserBoardsLimits>;
}

type ProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | LoadedProfileState
  | { status: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly usersApi = inject(UsersService);
  private readonly tracksStore = inject(TracksStore);
  private readonly sessionsStore = inject(SessionsStore);
  private readonly session = inject(SessionService);

  private readonly state = signal<ProfileState>({ status: 'idle' });

  constructor() {
    this.session.logout$.subscribe(() => this.state.set({ status: 'idle' }));
  }

  readonly status = computed(() => this.state().status);

  readonly user = computed<User | null>(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.user : null;
  });

  readonly trackNames = computed<ReadonlyMap<string, string>>(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.trackNames : new Map();
  });

  readonly sessionNames = computed<ReadonlyMap<string, string>>(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.sessionNames : new Map();
  });

  readonly boardLimitsBySessionId = computed<ReadonlyMap<string, UserBoardsLimits>>(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.boardLimitsBySessionId : new Map();
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  load(): void {
    const current = this.state().status;
    if (current === 'loading' || current === 'loaded') return;

    this.state.set({ status: 'loading' });

    this.fetchProfile().subscribe({
      next: loaded => this.state.set(loaded),
      error: () => this.state.set({
        status: 'error',
        message: translate<string>('profile.err.load'),
      }),
    });
  }

  /**
   * Re-fetch the current user (`/me`) and related data so the profile reflects
   * the latest server state. Called whenever the profile is opened. When data is
   * already loaded it refreshes in place (no loading flash), keeping the last
   * good data if the refresh fails.
   */
  refresh(): void {
    if (this.state().status !== 'loaded') {
      this.load();
      return;
    }

    this.fetchProfile().subscribe({
      next: loaded => this.state.set(loaded),
      error: () => {
        // Keep showing the last good profile rather than dropping to an error.
      },
    });
  }

  reload(): void {
    this.state.set({ status: 'idle' });
    this.load();
  }

  private fetchProfile(): Observable<LoadedProfileState> {
    return forkJoin({
      user: this.usersApi.getCurrentUser(),
      // Names only. Both come from the shared stores: the navbar opens this on
      // every page, and re-fetching the sessions payload (which carries every
      // board) just to read their names was the app's most expensive duplicate.
      tracks: this.tracksStore.load(),
      sessionsResponse: this.sessionsStore.load(),
    }).pipe(
      map(({ user, tracks, sessionsResponse }) => ({
        status: 'loaded' as const,
        user,
        trackNames: buildTrackNames(tracks),
        sessionNames: buildSessionNames(sessionsResponse),
        boardLimitsBySessionId: buildBoardLimitsBySessionId(user),
      })),
    );
  }

  boardLimitForSession(sessionId: string | null | undefined): UserBoardsLimits | null {
    if (sessionId == null) return null;
    return this.boardLimitsBySessionId().get(sessionId) ?? null;
  }

  isBoardLimitReached(sessionId: string | null | undefined): boolean {
    return this.boardLimitForSession(sessionId)?.boardLimitReached ?? false;
  }

  actualBoardsForSession(sessionId: string | null | undefined): number {
    return this.boardLimitForSession(sessionId)?.actualBoards ?? 0;
  }

  maxBoardsForSession(sessionId: string | null | undefined): number {
    return this.boardLimitForSession(sessionId)?.maxBoards ?? 0;
  }

  sessionNameForSession(sessionId: string | null | undefined): string {
    if (sessionId == null) return translate<string>('sessions.unknown');
    return (
      this.sessionNames().get(sessionId) ??
      translate<string>('profile.limits.sessionFallback', { id: sessionId })
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<unknown> {
    const body: UserChangePasswordRequest = {
      password: currentPassword,
      newPassword,
    };

    return this.usersApi.changeVerifiedPassword({ userChangePasswordRequest: body });
  }

  changeEmail(currentPassword: string, newEmail: string): Observable<unknown> {
    const body: ChangeEmailRequest = {
      email: newEmail,
      password: currentPassword,
    };

    // The new address is only staged as `pendingEmail` until the user confirms
    // the link, so the profile keeps showing the current one.
    return this.usersApi.changeVerifiedEmail({ changeEmailRequest: body });
  }

  changeUsername(name: string): Observable<User> {
    return this.usersApi.changeUsername({ changeUsernameRequest: { name } })
      .pipe(tap(user => {
        this.state.update(s => s.status === 'loaded'
          ? { ...s, user: { ...s.user, name: user.name ?? name } }
          : s);
      }));
  }
}

function buildTrackNames(tracks: readonly Track[] | null | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const t of tracks ?? []) {
    if (t.id == null) continue;

    const name = t.trackName?.trim() || t.trackOriginalName?.trim() || `Track #${t.id}`;
    map.set(t.id, name);
  }

  return map;
}

function buildSessionNames(response: SessionsResponse | null | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const s of response?.sessions ?? []) {
    if (s.sessionId == null) continue;

    const name = s.sessionName?.trim() || `Session #${s.sessionId}`;
    map.set(s.sessionId, name);
  }

  return map;
}

function buildBoardLimitsBySessionId(user: User): ReadonlyMap<string, UserBoardsLimits> {
  const map = new Map<string, UserBoardsLimits>();

  for (const limit of user.limits?.boards ?? []) {
    if (limit.sessionId == null) continue;
    map.set(limit.sessionId, limit);
  }

  return map;
}