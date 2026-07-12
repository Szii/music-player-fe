import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { SessionsResponse, SessionsService } from '../../api/generated';
import { SessionService } from '../auth/session.service';
import { SessionsStore } from './sessions-store.service';

/** Only the members SessionsStore touches. */
class SessionsServiceStub {
  response: SessionsResponse | null = null;

  getSessions(): Observable<SessionsResponse> {
    return of(this.response as SessionsResponse);
  }
}

class SessionServiceStub {
  readonly logout$ = new Observable<void>();
}

describe('SessionsStore.load', () => {
  let api: SessionsServiceStub;
  let store: SessionsStore;

  beforeEach(() => {
    localStorage.clear();
    api = new SessionsServiceStub();

    TestBed.configureTestingModule({
      providers: [
        SessionsStore,
        { provide: SessionsService, useValue: api },
        { provide: SessionService, useValue: new SessionServiceStub() },
      ],
    });

    store = TestBed.inject(SessionsStore);
  });

  // A user with no sessions gets an empty body, which HttpClient yields as null
  // even though the generated client's type says otherwise.
  it('normalises a null response into an empty session list', () => {
    api.response = null;

    let emitted: SessionsResponse | undefined;
    store.load().subscribe(response => (emitted = response));

    expect(emitted).toEqual({ sessions: [] });
    expect(store.sessions()).toEqual([]);
    expect(store.hasSessions()).toBe(false);
    expect(store.selectedSessionId()).toBeNull();
  });

  it('passes a populated response through and selects the first session', () => {
    api.response = { sessions: [{ sessionId: 7 }, { sessionId: 9 }] };

    let emitted: SessionsResponse | undefined;
    store.load().subscribe(response => (emitted = response));

    expect(emitted?.sessions?.length).toBe(2);
    expect(store.hasSessions()).toBe(true);
    expect(store.selectedSessionId()).toBe(7);
  });
});
