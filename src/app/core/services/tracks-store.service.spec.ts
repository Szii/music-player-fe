import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';

import { MusicTracksService, ShareService, Track } from '../../api/generated';
import { SessionService } from '../auth/session.service';
import { TracksStore } from './tracks-store.service';

/** Only the members TracksStore touches, with call counts so we can prove dedupe. */
class MusicTracksServiceStub {
  own: Track[] = [];
  subscribed: Track[] = [];
  updated: Track = {};

  ownCalls = 0;
  subscribedCalls = 0;

  getUserTracks(): Observable<Track[]> {
    this.ownCalls++;
    return of(this.own);
  }

  getUserSubscribedTracks(): Observable<Track[]> {
    this.subscribedCalls++;
    return of(this.subscribed);
  }

  updateTrack(): Observable<Track> {
    return of(this.updated);
  }
}

class SessionServiceStub {
  readonly logout$ = new Subject<void>();
}

describe('TracksStore', () => {
  let api: MusicTracksServiceStub;
  let session: SessionServiceStub;
  let store: TracksStore;

  beforeEach(() => {
    api = new MusicTracksServiceStub();
    session = new SessionServiceStub();

    TestBed.configureTestingModule({
      providers: [
        TracksStore,
        { provide: MusicTracksService, useValue: api },
        { provide: ShareService, useValue: {} },
        { provide: SessionService, useValue: session },
      ],
    });

    store = TestBed.inject(TracksStore);
  });

  it('merges own and subscribed tracks, dropping duplicates', () => {
    api.own = [{ id: '1' }, { id: '2' }];
    api.subscribed = [{ id: '2' }, { id: '3' }];

    store.load().subscribe();

    expect(store.tracks().map(t => t.id)).toEqual(['1', '2', '3']);
  });

  // The whole point of the store: five pages asking for the library must not
  // produce five round trips.
  it('serves a second load from cache instead of re-fetching', () => {
    api.own = [{ id: '1' }];

    store.load().subscribe();
    store.load().subscribe();

    expect(api.ownCalls).toBe(1);
    expect(api.subscribedCalls).toBe(1);
  });

  it('re-fetches when refresh() is called explicitly', () => {
    store.load().subscribe();
    store.refresh().subscribe();

    expect(api.ownCalls).toBe(2);
  });


  // A fade-only updateTrack comes back without trackWindows. Replacing the track
  // wholesale would silently drop the windows from every board using it.
  it('keeps fields the mutation response omits', () => {
    api.own = [{ id: '1', trackName: 'old', trackWindows: [{ id: '10' }] }];
    store.load().subscribe();

    api.updated = { id: '1', trackName: 'new' };
    store.updateTrack('1', { trackName: 'new' }).subscribe();

    const track = store.tracks().find(t => t.id === '1');

    expect(track?.trackName).toBe('new');
    expect(track?.trackWindows).toEqual([{ id: '10' }]);
    // Written through from the response — no re-fetch.
    expect(api.ownCalls).toBe(1);
  });

  it('drops everything on logout so the next user starts clean', () => {
    api.own = [{ id: '1' }];
    store.load().subscribe();

    session.logout$.next();

    expect(store.tracks()).toEqual([]);
    expect(store.loaded()).toBe(false);

    store.load().subscribe();
    expect(api.ownCalls).toBe(2);
  });
});
