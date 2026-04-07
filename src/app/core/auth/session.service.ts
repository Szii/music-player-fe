import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BoardPlaybackService } from '../services/board-playback.service';

const TOKEN_KEY = 'access_token';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private router = inject(Router);
  private boardPlayback = inject(BoardPlaybackService);

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
    this.boardPlayback.stopAll();
    this.clear();
    void this.router.navigateByUrl('/login');
  }
}