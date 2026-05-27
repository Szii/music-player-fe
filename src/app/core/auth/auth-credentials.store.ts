import { Injectable, computed, signal } from '@angular/core';

export interface PendingCredentials {
  readonly name: string;
  readonly password: string;
  readonly email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthCredentialsStore {
  private readonly _credentials = signal<PendingCredentials | null>(null);

  readonly credentials = this._credentials.asReadonly();
  readonly hasCredentials = computed(() => this._credentials() !== null);

  set(credentials: PendingCredentials): void {
    this._credentials.set(credentials);
  }

  updateEmail(email: string): void {
    const current = this._credentials();
    if (!current) return;
    this._credentials.set({ ...current, email });
  }

  clear(): void {
    this._credentials.set(null);
  }
}
