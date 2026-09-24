import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap } from 'rxjs/operators';
import {
  Board,
  SessionResponse,
  SessionShareResponse,
  SessionsResponse,
  SessionsService,
  ShareService,
} from '../../api/generated';
import { SessionService } from '../auth/session.service';
import { GroupsStore } from './groups-store.service';

const STORAGE_KEY = 'music-player.selected-session-id';

/** Sessions only ever change through this app, so a fetch stays good for a while. */
const FRESH_FOR_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class SessionsStore {
  private readonly api = inject(SessionsService);
  private readonly shareApi = inject(ShareService);
  private readonly session = inject(SessionService);
  private readonly groupsStore = inject(GroupsStore);

  readonly sessions = signal<SessionResponse[]>([]);
  readonly selectedSessionId = signal<string | null>(loadStoredId());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  readonly selectedSession = computed<SessionResponse | null>(() => {
    const id = this.selectedSessionId();
    if (id == null) return null;
    return this.sessions().find(s => s.sessionId === id) ?? null;
  });

  readonly hasSessions = computed(() => this.sessions().length > 0);

  readonly selectedSubscription = computed(() => this.selectedSession()?.subscription ?? null);

  readonly ownSessions = computed(() => this.sessions().filter(s => !s.readOnly));

  readonly sessionTrackIds = computed<ReadonlySet<string>>(
    () => new Set(this.selectedSession()?.trackIds ?? []),
  );

  readonly sessionGroupIds = computed<ReadonlySet<string>>(
    () => new Set(this.selectedSession()?.groupIds ?? []),
  );

  /** Tracks of the selected session: added directly or through one of its groups. */
  readonly scopedTrackIds = computed<ReadonlySet<string>>(() => {
    const subscription = this.selectedSubscription();
    if (subscription) {
      return new Set((subscription.tracks ?? []).map(track => track.id).filter((id): id is string => id != null));
    }

    const ids = new Set(this.sessionTrackIds());
    const groupIds = this.sessionGroupIds();

    for (const group of this.groupsStore.groups()) {
      if (group.id == null || !groupIds.has(group.id)) continue;
      for (const track of group.tracks ?? []) {
        if (track.id != null) ids.add(track.id);
      }
    }

    return ids;
  });

  private inFlight$: Observable<SessionsResponse> | null = null;
  private fetchedAt = 0;

  constructor() {
    effect(() => {
      const id = this.selectedSessionId();
      if (id != null) storeId(id);
    });

    this.session.logout$.subscribe(() => {
      this.sessions.set([]);
      this.selectedSessionId.set(null);
      this.loaded.set(false);
      this.loading.set(false);
      this.inFlight$ = null;
      this.fetchedAt = 0;
    });
  }

  /**
   * Sessions for a page that is opening. Reuses an in-flight request or a still
   * fresh result — the navbar's profile menu and the always-alive boards page both
   * want this on cold start, and the payload carries every board, so fetching it
   * twice is expensive.
   */
  load(): Observable<SessionsResponse> {
    if (this.inFlight$) return this.inFlight$;

    const isFresh = this.loaded() && Date.now() - this.fetchedAt < FRESH_FOR_MS;
    if (isFresh) return of({ sessions: this.sessions() });

    return this.refresh();
  }

  /**
   * Force a re-read. Boards must do this when the route is re-entered: the
   * response carries the boards themselves, so it is the one thing that genuinely
   * has to be current.
   */
  refresh(): Observable<SessionsResponse> {
    this.loading.set(true);

    const request$ = this.api.getSessions().pipe(
      map(response => response ?? { sessions: [] }),
      tap(response => {
        this.applyResponse(response);
        this.loading.set(false);
        this.loaded.set(true);
      }),
      catchError(err => {
        console.error('Loading sessions failed', err);
        this.loading.set(false);
        return of({ sessions: [] } as SessionsResponse);
      }),
      finalize(() => {
        this.inFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight$ = request$;
    return request$;
  }

    refreshSession(sessionId: string): Observable<SessionResponse> {
      return this.api.getSessionById({ sessionId }).pipe(
        tap(session => this.upsertSessionLocal(session)),
      );
    }

    refreshSelectedSession(): Observable<SessionResponse | null> {
      const sessionId = this.selectedSessionId();

      if (sessionId == null) {
        return of(null);
      }

      return this.refreshSession(sessionId);
    }

  createSession(name: string, description?: string): Observable<SessionsResponse> {
    return this.api.upsertSession({
      sessionRequest: {
        sessionName: name,
        sessionDescription: description,
      },
    }).pipe(
      tap(response => {
        const previousIds = new Set(this.sessions().map(s => s.sessionId));
        this.applyResponse(response, { preserveSelection: true });
        const created = (response.sessions ?? []).find(
          s => s.sessionId != null && !previousIds.has(s.sessionId),
        );
        if (created?.sessionId != null) {
          this.selectedSessionId.set(created.sessionId);
        }
      }),
    );
  }

  renameSession(
    sessionId: string,
    name: string,
    description?: string,
  ): Observable<SessionsResponse> {
    return this.api.upsertSession({
      sessionRequest: {
        sessionId,
        sessionName: name,
        sessionDescription: description,
      },
    }).pipe(
      tap(response => this.applyResponse(response, { preserveSelection: true })),
    );

  }

  deleteSession(sessionId: string): Observable<SessionsResponse> {
    return this.api.deleteSession({ sessionId }).pipe(
      tap(response => this.applyResponse(response)),
    );
  }

  loadPublished(): Observable<SessionShareResponse[]> {
    return this.shareApi.getPublishedSessions().pipe(map(shares => shares ?? []));
  }

  subscribe(shareCode: string): Observable<SessionResponse> {
    return this.shareApi.subscribeToSession({ subscribeRequest: { shareCode } }).pipe(
      tap(session => {
        this.upsertSessionLocal(session);
        if (session.sessionId != null) this.selectedSessionId.set(session.sessionId);
      }),
    );
  }

  sync(sessionId: string): Observable<SessionResponse> {
    return this.shareApi.syncSession({ sessionId }).pipe(
      tap(session => this.upsertSessionLocal(session)),
    );
  }

  publish(sessionId: string, description?: string): Observable<SessionResponse> {
    return this.shareApi.publishSession({ sessionId, publishSessionRequest: { description } }).pipe(
      switchMap(() => this.refreshSession(sessionId)),
    );
  }

  publishUpdate(sessionId: string): Observable<SessionResponse> {
    return this.shareApi.publishSessionUpdate({ sessionId }).pipe(
      switchMap(() => this.refreshSession(sessionId)),
    );
  }

  updateShareDescription(sessionId: string, description?: string): Observable<SessionResponse> {
    return this.shareApi.updateSessionShare({ sessionId, updateSessionShareRequest: { description } }).pipe(
      switchMap(() => this.refreshSession(sessionId)),
    );
  }

  unpublish(sessionId: string): Observable<SessionResponse> {
    return this.shareApi.unpublishSession({ sessionId }).pipe(
      switchMap(() => this.refreshSession(sessionId)),
    );
  }

  /** Names of the selected session's stages that match `predicate`. */
  selectedSessionStageNames(predicate: (board: Board) => boolean): string[] {
    return (this.selectedSession()?.boards ?? [])
      .filter(predicate)
      .map(board => board.name || '—');
  }

  addTrack(sessionId: string, trackId: string): Observable<SessionResponse> {
    return this.api.addTrackToSession({ sessionId, trackId }).pipe(
      tap(session => this.upsertSessionLocal(session)),
    );
  }

  removeTrack(sessionId: string, trackId: string): Observable<SessionResponse> {
    return this.api.removeTrackFromSession({ sessionId, trackId }).pipe(
      tap(session => this.upsertSessionLocal(session)),
    );
  }

  addGroup(sessionId: string, groupId: string): Observable<SessionResponse> {
    return this.api.addGroupToSession({ sessionId, groupId }).pipe(
      tap(session => this.upsertSessionLocal(session)),
    );
  }

  removeGroup(sessionId: string, groupId: string): Observable<SessionResponse> {
    return this.api.removeGroupFromSession({ sessionId, groupId }).pipe(
      tap(session => this.upsertSessionLocal(session)),
    );
  }

  /** Mirrors a server-side add that came back on another endpoint's response. */
  noteAdded(sessionId: string, added: { trackId?: string; groupId?: string }): void {
    this.sessions.update(current =>
      current.map(s => {
        if (s.sessionId !== sessionId) return s;
        const trackIds = s.trackIds ?? [];
        const groupIds = s.groupIds ?? [];
        return {
          ...s,
          trackIds: added.trackId != null && !trackIds.includes(added.trackId)
            ? [...trackIds, added.trackId]
            : trackIds,
          groupIds: added.groupId != null && !groupIds.includes(added.groupId)
            ? [...groupIds, added.groupId]
            : groupIds,
        };
      }),
    );
  }

  selectSession(sessionId: string | null): void {
    this.selectedSessionId.set(sessionId);
  }

  upsertSessionLocal(session: SessionResponse): void {
    if (session.sessionId == null) return;
    this.sessions.update(current => {
      const existing = current.findIndex(s => s.sessionId === session.sessionId);
      if (existing === -1) return [...current, session];
      const next = [...current];
      next[existing] = session;
      return next;
    });
  }

  private applyResponse(
    response: SessionsResponse | null,
    options: { preserveSelection?: boolean } = {},
  ): void {
    const sessions = response?.sessions ?? [];
    this.sessions.set(sessions);

    // Create/rename/delete all return the full list, so a mutation leaves the
    // store as current as a fetch would.
    this.fetchedAt = Date.now();
    this.loaded.set(true);

    const currentId = this.selectedSessionId() ?? loadStoredId();
    const stillExists = currentId != null && sessions.some(s => s.sessionId === currentId);

    if (stillExists) {
      this.selectedSessionId.set(currentId);
      return;
    }

    if (options.preserveSelection) {
      this.selectedSessionId.set(null);
    } else {
      this.selectedSessionId.set(sessions[0]?.sessionId ?? null);
    }
  }
}

function storeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
}

function loadStoredId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // A returning user may still have an old numeric id cached here. It simply
    // won't match any current uuid session, and applyResponse() falls back to
    // the first session — so no explicit migration is needed.
    return raw ? raw : null;
  } catch {
    return null;
  }
}
