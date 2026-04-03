import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  durationMs: number;
  createdAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

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
    };

    this.toasts.update(current => [...current, toast]);

    if (durationMs > 0) {
      const timer = setTimeout(() => {
        this.dismiss(id);
      }, durationMs);

      this.timers.set(id, timer);
    }

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

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.toasts.set([]);
  }
}