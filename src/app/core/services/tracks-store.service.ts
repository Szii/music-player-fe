import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';

import {
  CreateTrackRequestV2,
  MusicTracksService,
  ReorderTrackWindowsRequest,
  Track,
  TrackWindowRequest,
  UpdateTrackRequestV2,
} from '../../api/generated';
import { SessionService } from '../auth/session.service';

const FRESH_FOR_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class TracksStore {
  private readonly api = inject(MusicTracksService);
  private readonly session = inject(SessionService);

  private readonly own = signal<Track[]>([]);

  readonly tracks = this.own.asReadonly();

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly ownFailed = signal(false);

  private inFlight$: Observable<readonly Track[]> | null = null;
  private fetchedAt = 0;

  constructor() {
    this.session.logout$.subscribe(() => this.reset());
  }

  load(): Observable<readonly Track[]> {
    if (this.inFlight$) return this.inFlight$;

    const isFresh = this.loaded() && Date.now() - this.fetchedAt < FRESH_FOR_MS;
    if (isFresh) return of(this.tracks());

    return this.refresh();
  }

  refresh(): Observable<readonly Track[]> {
    this.loading.set(true);

    const request$ = this.api.getUserTracks().pipe(
      tap(tracks => {
        this.own.set(tracks ?? []);
        this.ownFailed.set(false);
        this.fetchedAt = Date.now();
        this.loaded.set(true);
      }),
      catchError((err: unknown) => {
        console.error('Loading own tracks failed', err);
        this.ownFailed.set(true);
        return of(null);
      }),
      map(() => this.tracks()),
      finalize(() => {
        this.loading.set(false);
        this.inFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight$ = request$;
    return request$;
  }

  createTrack(body: CreateTrackRequestV2): Observable<Track> {
    return this.api.createTrackV2({ createTrackRequestV2: body }).pipe(
      tap(track => this.own.update(current => [...current, track])),
    );
  }

  updateTrack(trackId: string, body: UpdateTrackRequestV2): Observable<Track> {
    return this.api.updateTrack({ trackId, updateTrackRequestV2: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  deleteTrack(trackId: string): Observable<unknown> {
    return this.api.deleteTrack({ trackId }).pipe(
      tap(() => this.removeById(trackId)),
    );
  }

  createWindow(trackId: string, body: TrackWindowRequest): Observable<Track> {
    return this.api.createTrackWindow({ trackId, trackWindowRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  updateWindow(trackId: string, windowId: string, body: TrackWindowRequest): Observable<Track> {
    return this.api.updateTrackWindow({ trackId, windowId, trackWindowRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  deleteWindow(trackId: string, windowId: string): Observable<Track> {
    return this.api.deleteTrackWindow({ trackId, windowId }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  reorderWindows(trackId: string, body: ReorderTrackWindowsRequest): Observable<Track> {
    return this.api.reorderTrackWindows({ trackId, reorderTrackWindowsRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  /**
   * Merge rather than replace: a fade-only `updateTrack` comes back without
   * `trackWindows`, and overwriting the track wholesale would drop the windows
   * from the library. Responses that do carry a field still win.
   */
  private upsert(trackId: string, track: Track): void {
    const merge = (current: Track[]): Track[] =>
      current.map(t => (t.id === trackId ? { ...t, ...track } : t));

    this.own.update(merge);
  }

  private removeById(trackId: string): void {
    const without = (current: Track[]): Track[] => current.filter(t => t.id !== trackId);

    this.own.update(without);
  }

  private reset(): void {
    this.own.set([]);
    this.loaded.set(false);
    this.loading.set(false);
    this.ownFailed.set(false);
    this.inFlight$ = null;
    this.fetchedAt = 0;
  }
}
