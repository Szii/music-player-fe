import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';

import { Group, GroupRequest, MusicGroupsService } from '../../api/generated';
import { SessionService } from '../auth/session.service';

/** Groups only ever change through this app, so a fetch stays good for a while. */
const FRESH_FOR_MS = 60_000;

/**
 * The user's track groups. Shared by the groups and boards pages, which both used
 * to fetch them separately on every visit.
 *
 * `createGroup` and `updateGroup` return the saved `Group`, so mutations fold the
 * response straight into the signal instead of re-fetching the list.
 */
@Injectable({ providedIn: 'root' })
export class GroupsStore {
  private readonly api = inject(MusicGroupsService);
  private readonly session = inject(SessionService);

  private readonly items = signal<Group[]>([]);

  readonly groups = this.items.asReadonly();
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly failed = signal(false);

  private inFlight$: Observable<readonly Group[]> | null = null;
  private fetchedAt = 0;

  constructor() {
    this.session.logout$.subscribe(() => this.reset());
  }

  load(): Observable<readonly Group[]> {
    if (this.inFlight$) return this.inFlight$;

    const isFresh = this.loaded() && Date.now() - this.fetchedAt < FRESH_FOR_MS;
    if (isFresh) return of(this.items());

    return this.refresh();
  }

  refresh(): Observable<readonly Group[]> {
    this.loading.set(true);

    const request$ = this.api.getUserGroups().pipe(
      tap(groups => {
        this.items.set(groups ?? []);
        this.failed.set(false);
        this.fetchedAt = Date.now();
        this.loaded.set(true);
      }),
      // Keep the last good list rather than blanking the page on a failed refresh.
      catchError((err: unknown) => {
        console.error('Loading groups failed', err);
        this.failed.set(true);
        return of(this.items());
      }),
      map(() => this.items()),
      finalize(() => {
        this.loading.set(false);
        this.inFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight$ = request$;
    return request$;
  }

  create(request: GroupRequest): Observable<Group> {
    return this.api.createGroup({ groupRequest: request }).pipe(
      tap(created => this.items.update(current => [...current, created])),
    );
  }

  update(groupId: number, request: GroupRequest): Observable<Group> {
    return this.api.updateGroup({ groupId, groupRequest: request }).pipe(
      tap(updated =>
        this.items.update(current => current.map(g => (g.id === groupId ? updated : g))),
      ),
    );
  }

  remove(groupId: number): Observable<unknown> {
    return this.api.deleteGroup({ groupId }).pipe(
      tap(() => this.items.update(current => current.filter(g => g.id !== groupId))),
    );
  }

  private reset(): void {
    this.items.set([]);
    this.loaded.set(false);
    this.loading.set(false);
    this.failed.set(false);
    this.inFlight$ = null;
    this.fetchedAt = 0;
  }
}
