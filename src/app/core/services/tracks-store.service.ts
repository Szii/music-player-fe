import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';

import {
  CreateTrackRequestV2,
  MusicTracksService,
  ReorderTrackWindowsRequest,
  ShareService,
  Track,
  TrackWindowRequest,
  UpdateTrackRequestV2,
} from '../../api/generated';
import { SessionService } from '../auth/session.service';

/**
 * How long a fetch stays fresh. Own tracks only change through this app, but a
 * subscribed track can be revoked whenever its publisher unpublishes it, and the
 * API has no push channel — so the pair is re-validated on the next load past
 * this window rather than held for the whole session.
 */
const FRESH_FOR_MS = 60_000;

/**
 * The user's track library: tracks they own plus tracks they subscribe to.
 *
 * Every page needs this list, so it is fetched once and shared instead of each
 * page issuing its own request. Mutations write the server's response straight
 * back into the signals — the API returns the updated `Track` for all of them —
 * so a save never costs a re-fetch.
 */
@Injectable({ providedIn: 'root' })
export class TracksStore {
  private readonly api = inject(MusicTracksService);
  private readonly shareApi = inject(ShareService);
  private readonly session = inject(SessionService);

  private readonly own = signal<Track[]>([]);
  private readonly subscribed = signal<Track[]>([]);

  readonly ownTracks = this.own.asReadonly();
  readonly subscribedTracks = this.subscribed.asReadonly();

  /** Own + subscribed, deduped by id: everything the user can put on a board. */
  readonly tracks = computed(() => dedupeById([...this.own(), ...this.subscribed()]));

  readonly loading = signal(false);
  readonly loaded = signal(false);

  /** Kept separate so pages can keep showing their own wording for each half. */
  readonly ownFailed = signal(false);
  readonly subscribedFailed = signal(false);

  private inFlight$: Observable<readonly Track[]> | null = null;
  private fetchedAt = 0;

  constructor() {
    this.session.logout$.subscribe(() => this.reset());
  }

  /**
   * Data for a page that is opening. Reuses an in-flight request or a still-fresh
   * result, so navigating between pages does not re-fetch the same library.
   */
  load(): Observable<readonly Track[]> {
    if (this.inFlight$) return this.inFlight$;

    const isFresh = this.loaded() && Date.now() - this.fetchedAt < FRESH_FOR_MS;
    if (isFresh) return of(this.tracks());

    return this.refresh();
  }

  /** Force a re-fetch of the whole library, ignoring freshness. */
  refresh(): Observable<readonly Track[]> {
    this.loading.set(true);

    // Each half is caught on its own so one failing endpoint still leaves the
    // other's tracks usable, and the last good data survives a failed refresh.
    const request$ = forkJoin({
      own: this.api.getUserTracks().pipe(
        tap(() => this.ownFailed.set(false)),
        catchError((err: unknown) => {
          console.error('Loading own tracks failed', err);
          this.ownFailed.set(true);
          return of(null);
        }),
      ),
      subscribed: this.api.getUserSubscribedTracks().pipe(
        tap(() => this.subscribedFailed.set(false)),
        catchError((err: unknown) => {
          console.error('Loading subscribed tracks failed', err);
          this.subscribedFailed.set(true);
          return of(null);
        }),
      ),
    }).pipe(
      tap(({ own, subscribed }) => {
        if (own) this.own.set(own);
        if (subscribed) this.subscribed.set(subscribed);

        this.fetchedAt = Date.now();
        this.loaded.set(true);
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

  /**
   * The public catalog. Deliberately never cached: other users publish and
   * unpublish these, and nothing tells us when they do, so it is only ever as
   * fresh as the moment it was asked for.
   */
  loadPublished(): Observable<Track[]> {
    return this.api.getPublishedTracks();
  }

  createTrack(body: CreateTrackRequestV2): Observable<Track> {
    return this.api.createTrackV2({ createTrackRequestV2: body }).pipe(
      tap(track => this.own.update(current => [...current, track])),
    );
  }

  updateTrack(trackId: number, body: UpdateTrackRequestV2): Observable<Track> {
    return this.api.updateTrack({ trackId, updateTrackRequestV2: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  deleteTrack(trackId: number): Observable<unknown> {
    return this.api.deleteTrack({ trackId }).pipe(
      tap(() => this.removeById(trackId)),
    );
  }

  createWindow(trackId: number, body: TrackWindowRequest): Observable<Track> {
    return this.api.createTrackWindow({ trackId, trackWindowRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  updateWindow(trackId: number, windowId: number, body: TrackWindowRequest): Observable<Track> {
    return this.api.updateTrackWindow({ trackId, windowId, trackWindowRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  deleteWindow(trackId: number, windowId: number): Observable<Track> {
    return this.api.deleteTrackWindow({ trackId, windowId }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  reorderWindows(trackId: number, body: ReorderTrackWindowsRequest): Observable<Track> {
    return this.api.reorderTrackWindows({ trackId, reorderTrackWindowsRequest: body }).pipe(
      tap(track => this.upsert(trackId, track)),
    );
  }

  publish(trackId: number, description?: string): Observable<Track> {
    return this.shareApi
      .publishTrack({ trackId, publishTrackRequest: { description } })
      .pipe(map(share => this.patchOwn(trackId, { trackShare: share })));
  }

  unpublish(trackId: number): Observable<Track> {
    return this.shareApi
      .unpublishTrack({ trackId })
      .pipe(map(() => this.patchOwn(trackId, { trackShare: undefined })));
  }

  /**
   * Subscribing is by share code, so the response carries no track we could fold
   * in — this is the one mutation that has to go back to the server. It re-fetches
   * only the subscribed half, not the whole library.
   */
  subscribe(shareCode: string): Observable<Track[]> {
    return this.shareApi.subscribeToTrack({ subscribeRequest: { shareCode } }).pipe(
      switchMap(() => this.api.getUserSubscribedTracks()),
      tap(tracks => this.subscribed.set(tracks ?? [])),
    );
  }

  unsubscribe(trackId: number): Observable<unknown> {
    return this.shareApi.unsubscribeFromTrack({ trackId }).pipe(
      tap(() => this.subscribed.update(current => current.filter(t => t.id !== trackId))),
    );
  }

  /**
   * Merge rather than replace: a fade-only `updateTrack` comes back without
   * `trackWindows`, and overwriting the track wholesale would drop the windows
   * from the library. Responses that do carry a field still win.
   */
  private upsert(trackId: number, track: Track): void {
    const merge = (current: Track[]): Track[] =>
      current.map(t => (t.id === trackId ? { ...t, ...track } : t));

    this.own.update(merge);
    this.subscribed.update(merge);
  }

  /** Applies a partial change to an owned track and returns the merged result. */
  private patchOwn(trackId: number, patch: Partial<Track>): Track {
    const existing = this.own().find(t => t.id === trackId);
    const merged: Track = { ...existing, ...patch, id: trackId };

    this.own.update(current => current.map(t => (t.id === trackId ? merged : t)));

    return merged;
  }

  private removeById(trackId: number): void {
    const without = (current: Track[]): Track[] => current.filter(t => t.id !== trackId);

    this.own.update(without);
    this.subscribed.update(without);
  }

  private reset(): void {
    this.own.set([]);
    this.subscribed.set([]);
    this.loaded.set(false);
    this.loading.set(false);
    this.ownFailed.set(false);
    this.subscribedFailed.set(false);
    this.inFlight$ = null;
    this.fetchedAt = 0;
  }
}

function dedupeById(tracks: readonly Track[]): Track[] {
  const seen = new Set<number>();

  return tracks.filter(track => {
    if (track.id == null || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}
