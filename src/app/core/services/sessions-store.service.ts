import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  SessionResponse,
  SessionsResponse,
  SessionsService,
} from '../../api/generated';
import { SessionService } from '../auth/session.service';

const STORAGE_KEY = 'music-player.selected-session-id';

@Injectable({ providedIn: 'root' })
export class SessionsStore {
  private readonly api = inject(SessionsService);
  private readonly session = inject(SessionService);

  readonly sessions = signal<SessionResponse[]>([]);
  readonly selectedSessionId = signal<number | null>(loadStoredId());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  readonly selectedSession = computed<SessionResponse | null>(() => {
    const id = this.selectedSessionId();
    if (id == null) return null;
    return this.sessions().find(s => s.sessionId === id) ?? null;
  });

  readonly hasSessions = computed(() => this.sessions().length > 0);

  constructor() {
    effect(() => {
      const id = this.selectedSessionId();
      if (id == null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(id));
      }
    });

    this.session.logout$.subscribe(() => {
      this.sessions.set([]);
      this.selectedSessionId.set(null);
      this.loaded.set(false);
      this.loading.set(false);
    });
  }

  load(): Observable<SessionsResponse> {
    this.loading.set(true);
    return this.api.getSessions().pipe(
      tap(response => this.applyResponse(response)),
      tap({
        next: () => {
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: () => this.loading.set(false),
      }),
      catchError(err => {
        console.error('Loading sessions failed', err);
        this.loading.set(false);
        return of({ sessions: [] } as SessionsResponse);
      }),
    );
  }

    refreshSession(sessionId: number): Observable<SessionResponse> {
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
    sessionId: number,
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

  deleteSession(sessionId: number): Observable<SessionsResponse> {
    return this.api.deleteSession({ sessionId }).pipe(
      tap(response => this.applyResponse(response)),
    );
  }

  selectSession(sessionId: number | null): void {
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
    response: SessionsResponse,
    options: { preserveSelection?: boolean } = {},
  ): void {
    const sessions = response.sessions ?? [];
    this.sessions.set(sessions);

    const currentId = this.selectedSessionId();
    const stillExists = currentId != null && sessions.some(s => s.sessionId === currentId);

    if (stillExists) return;

    if (options.preserveSelection) {
      this.selectedSessionId.set(null);
    } else {
      this.selectedSessionId.set(sessions[0]?.sessionId ?? null);
    }
  }
}

function loadStoredId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
