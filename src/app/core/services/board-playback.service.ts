import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BoardPlaybackService {
  private stopAllFn: (() => void) | null = null;
  private refreshFn: (() => void) | null = null;

  readonly isAnyPlaying = signal(false);

  register(stopFn: () => void, refreshFn: () => void): void {
    this.stopAllFn = stopFn;
    this.refreshFn = refreshFn;
  }

  stopAll(): void {
    this.stopAllFn?.();
  }

  refresh(): void {
    this.refreshFn?.();
  }

  setPlaying(value: boolean): void {
    this.isAnyPlaying.set(value);
  }
}
