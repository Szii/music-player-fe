import { Injectable, computed, signal } from '@angular/core';

export interface PendingCredentials {
  readonly email: string;
  readonly password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthCredentialsStore {
  private readonly _credentials = signal<PendingCredentials | null>(null);

  readonly credentials = this._credentials.asReadonly();
  readonly hasCredentials = computed(() => this._credentials() !== null);

  set(credentials: PendingCredentials): void {
    this._credentials.set(credentials);
  }

  clear(): void {
    this._credentials.set(null);
  }
}
