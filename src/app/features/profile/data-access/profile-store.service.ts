import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, tap } from 'rxjs';

import {
  MusicTracksService,
  Track,
  User,
  UserChangePasswordRequest,
  UserRegisterRequest,
  UsersService,
} from '../../../api/generated';
import { SessionService } from '../../../core/auth/session.service';

type ProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; user: User; trackNames: ReadonlyMap<number, string> }
  | { status: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly usersApi = inject(UsersService);
  private readonly tracksApi = inject(MusicTracksService);
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
  readonly trackNames = computed<ReadonlyMap<number, string>>(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.trackNames : new Map();
  });
  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  load(): void {
    const current = this.state().status;
    if (current === 'loading' || current === 'loaded') return;

    this.state.set({ status: 'loading' });
    forkJoin({
      user: this.usersApi.getCurrentUser(),
      tracks: this.tracksApi.getUserTracks(),
    }).subscribe({
      next: ({ user, tracks }) => this.state.set({
        status: 'loaded',
        user,
        trackNames: buildTrackNames(tracks),
      }),
      error: () => this.state.set({
        status: 'error',
        message: 'Could not load your profile.',
      }),
    });
  }

  reload(): void {
    this.state.set({ status: 'idle' });
    this.load();
  }

  changePassword(currentPassword: string, newPassword: string): Observable<unknown> {
    const user = this.requireUser('changePassword');
    const body: UserChangePasswordRequest = {
      name: user.name ?? '',
      password: currentPassword,
      newPassword,
    };
    return this.usersApi.changeVerifiedPassword({ userChangePasswordRequest: body });
  }

  changeEmail(currentPassword: string, newEmail: string): Observable<unknown> {
    const user = this.requireUser('changeEmail');
    const body: UserRegisterRequest = {
      name: user.name ?? '',
      email: newEmail,
      password: currentPassword,
    };
    return this.usersApi.changeVerifiedEmail({ userRegisterRequest: body })
      .pipe(tap(() => {
        this.state.update(s => s.status === 'loaded'
          ? { ...s, user: { ...s.user, email: newEmail } }
          : s);
      }));
  }

  private requireUser(operation: string): User {
    const user = this.user();
    if (!user) {
      throw new Error(`Cannot run ${operation} before profile is loaded.`);
    }
    return user;
  }
}

function buildTrackNames(tracks: readonly Track[]): ReadonlyMap<number, string> {
  const map = new Map<number, string>();
  for (const t of tracks) {
    if (t.id == null) continue;
    const name = t.trackName?.trim() || t.trackOriginalName?.trim() || `Track #${t.id}`;
    map.set(t.id, name);
  }
  return map;
}
