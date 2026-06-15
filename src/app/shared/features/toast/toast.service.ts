import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  durationMs: number;
  createdAt: number;
  /** True while the toast plays its exit animation before being removed. */
  leaving: boolean;
}

interface ToastTimer {
  /** `null` while paused (e.g. the user is hovering/focusing the toast). */
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  /** Most toasts kept on screen at once; older ones are retired early. */
  private static readonly MAX_VISIBLE = 4;
  /** Must match the `toast-out` animation duration in the container styles. */
  private static readonly LEAVE_MS = 160;

  readonly toasts = signal<ToastItem[]>([]);

  private nextId = 1;
  private readonly timers = new Map<number, ToastTimer>();

  show(
    message: string,
    type: ToastType = 'info',
    durationMs = 3200,
  ): number {
    const id = this.nextId++;
    const toast: ToastItem = {
      id,
      type,
      message,
      durationMs,
      createdAt: Date.now(),
      leaving: false,
    };

    this.toasts.update(current => [...current, toast]);
    this.enforceLimit();
    this.startTimer(id, durationMs);

    return id;
  }

  success(message: string, durationMs = 2600): number {
    return this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 4200): number {
    return this.show(message, 'error', durationMs);
  }

  info(message: string, durationMs = 3200): number {
    return this.show(message, 'info', durationMs);
  }

  warning(message: string, durationMs = 3600): number {
    return this.show(message, 'warning', durationMs);
  }

  /** Pause auto-dismiss while the user is reading or interacting with a toast. */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;

    clearTimeout(timer.handle);
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    timer.handle = null;
  }

  /** Resume auto-dismiss after the pointer leaves / focus moves away. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;

    if (timer.remaining <= 0) {
      this.dismiss(id);
      return;
    }

    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  /** Start the exit animation, then remove the toast once it finishes. */
  dismiss(id: number): void {
    this.clearTimer(id);

    const toast = this.toasts().find(t => t.id === id);
    if (!toast || toast.leaving) return;

    this.toasts.update(current =>
      current.map(t => (t.id === id ? { ...t, leaving: true } : t)),
    );
    setTimeout(() => this.remove(id), ToastService.LEAVE_MS);
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      if (timer.handle !== null) clearTimeout(timer.handle);
    }
    this.timers.clear();
    this.toasts.set([]);
  }

  private startTimer(id: number, durationMs: number): void {
    if (durationMs <= 0) return;

    const handle = setTimeout(() => this.dismiss(id), durationMs);
    this.timers.set(id, { handle, remaining: durationMs, startedAt: Date.now() });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle != null) clearTimeout(timer.handle);
    this.timers.delete(id);
  }

  private remove(id: number): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  /** Retire the oldest live toasts when too many are on screen at once. */
  private enforceLimit(): void {
    const live = this.toasts().filter(t => !t.leaving);
    const overflow = live.length - ToastService.MAX_VISIBLE;
    for (let i = 0; i < overflow; i++) {
      this.dismiss(live[i].id);
    }
  }
}
