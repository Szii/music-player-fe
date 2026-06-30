import { Injectable, NgZone, inject } from '@angular/core';

/**
 * Drop-in `setInterval`/`clearInterval` whose ticks come from a Web Worker.
 *
 * Main-thread timers are clamped to ~1s in backgrounded tabs, which makes the
 * player's poll loop and volume ramps coarse and jumpy when the tab is hidden.
 * A worker's timers are not clamped (on desktop), so the clock stays smooth.
 *
 * Note: this does NOT keep audio alive on a *locked mobile screen* — the OS
 * suspends the whole page, worker included. It only fixes hidden-tab timing.
 *
 * Callbacks run outside the Angular zone, matching the call sites that used
 * `zone.runOutsideAngular(() => setInterval(...))` and zone.run() internally.
 */
@Injectable({ providedIn: 'root' })
export class WorkerClockService {
  private readonly zone = inject(NgZone);
  private worker: Worker | null = null;
  private readonly callbacks = new Map<number, () => void>();
  private nextId = 1;

  setInterval(callback: () => void, ms: number): number {
    const worker = this.ensureWorker();
    // ponytail: no worker (SSR/old browser) → plain timer fallback, still works.
    if (!worker) {
      return this.zone.runOutsideAngular(() =>
        setInterval(() => this.zone.runOutsideAngular(callback), ms),
      ) as unknown as number;
    }
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    worker.postMessage({ cmd: 'start', id, ms });
    return id;
  }

  clearInterval(id: number): void {
    if (!this.worker) {
      clearInterval(id);
      return;
    }
    this.callbacks.delete(id);
    this.worker.postMessage({ cmd: 'stop', id });
  }

  private ensureWorker(): Worker | null {
    if (this.worker) {
      return this.worker;
    }
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      return null;
    }
    const src = `
      const timers = {};
      onmessage = (e) => {
        const { cmd, id, ms } = e.data;
        if (cmd === 'start') {
          clearInterval(timers[id]);
          timers[id] = setInterval(() => postMessage(id), ms);
        } else if (cmd === 'stop') {
          clearInterval(timers[id]);
          delete timers[id];
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent<number>) => {
      const cb = this.callbacks.get(e.data);
      if (cb) {
        this.zone.runOutsideAngular(cb);
      }
    };
    return this.worker;
  }
}
