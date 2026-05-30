import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { BoardPlaybackService } from '../services/board-playback.service';

const TOKEN_KEY = 'access_token';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private router = inject(Router);
  private boardPlayback = inject(BoardPlaybackService);

  private readonly logoutSubject = new Subject<void>();
  /** Emits when the user logs out. Stores subscribe to clear their state. */
  readonly logout$: Observable<void> = this.logoutSubject.asObservable();

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    this.boardPlayback.reset();
    this.logoutSubject.next();
    this.clear();
    void this.router.navigateByUrl('/login');
  }
}