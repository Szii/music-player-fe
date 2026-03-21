import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

const TOKEN_KEY = 'access_token';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private router = inject(Router);

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
    this.clear();
    void this.router.navigateByUrl('/login');
  }
}