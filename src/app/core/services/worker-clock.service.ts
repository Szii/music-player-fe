import { Injectable, NgZone, inject } from '@angular/core';

interface ClockInterval {
  callback: () => void;
  ms: number;
  workerBacked: boolean;
}

/**
 * Drop-in setInterval/clearInterval service.
 *
 * Uses a same-origin Web Worker when available, but does not rely on it.
 *
 * Important:
 * - Firefox and other browsers can still throttle timers in hidden tabs.
 * - A Worker helps avoid main-thread blocking, but it is not a reliable
 *   background timing guarantee.
 * - Timers created before the worker is ready are migrated to the worker
 *   once it becomes ready.
 * - Mobile locked-screen playback is still controlled by the OS/browser.
 */
@Injectable({ providedIn: 'root' })
export class WorkerClockService {
  private readonly zone = inject(NgZone);

  private worker: Worker | null = null;
  private workerReady = false;

  private readonly intervals = new Map<number, ClockInterval>();
  private readonly fallbackTimers = new Map<number, ReturnType<typeof setInterval>>();

  private nextId = 1;

  constructor() {
    this.tryInitWorker();
  }

  setInterval(callback: () => void, ms: number): number {
    const id = this.nextId++;

    this.intervals.set(id, {
      callback,
      ms,
      workerBacked: false,
    });

    if (this.workerReady && this.worker) {
      this.startWorkerInterval(id, ms);
    } else {
      this.startFallbackInterval(id, ms);
    }

    return id;
  }

  clearInterval(id: number): void {
    this.intervals.delete(id);

    this.worker?.postMessage({ cmd: 'stop', id });

    const fallbackTimer = this.fallbackTimers.get(id);
    if (fallbackTimer !== undefined) {
      clearInterval(fallbackTimer);
      this.fallbackTimers.delete(id);
    }
  }

  private startFallbackInterval(id: number, ms: number): void {
    this.clearFallbackInterval(id);

    this.zone.runOutsideAngular(() => {
      const timer = setInterval(() => this.fire(id), ms);
      this.fallbackTimers.set(id, timer);
    });
  }

  private startWorkerInterval(id: number, ms: number): void {
    const interval = this.intervals.get(id);

    if (!interval || !this.worker) {
      return;
    }

    this.clearFallbackInterval(id);

    interval.workerBacked = true;
    this.worker.postMessage({ cmd: 'start', id, ms });
  }

  private clearFallbackInterval(id: number): void {
    const fallbackTimer = this.fallbackTimers.get(id);

    if (fallbackTimer !== undefined) {
      clearInterval(fallbackTimer);
      this.fallbackTimers.delete(id);
    }
  }

  private fire(id: number): void {
    const interval = this.intervals.get(id);

    if (!interval) {
      return;
    }

    this.zone.runOutsideAngular(interval.callback);
  }

  private migrateFallbackIntervalsToWorker(): void {
    if (!this.worker) {
      return;
    }

    for (const [id, interval] of this.intervals) {
      if (!interval.workerBacked) {
        this.startWorkerInterval(id, interval.ms);
      }
    }
  }

  private tryInitWorker(): void {
    if (typeof Worker === 'undefined') {
      return;
    }

    let worker: Worker;

    try {
      worker = new Worker(new URL('./clock.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      return;
    }

    worker.onmessage = ({ data }: MessageEvent) => {
      if (data === 'ready') {
        this.worker = worker;
        this.workerReady = true;
        this.migrateFallbackIntervalsToWorker();
        return;
      }

      if (typeof data === 'number') {
        this.fire(data);
      }
    };

    worker.onerror = () => {
      this.workerReady = false;
      this.worker = null;

      for (const [id, interval] of this.intervals) {
        interval.workerBacked = false;

        if (!this.fallbackTimers.has(id)) {
          this.startFallbackInterval(id, interval.ms);
        }
      }
    };
  }
}