import { Injectable, computed, signal } from '@angular/core';

import { TUTORIAL_STEPS } from '../data/tutorial-steps';

const SEEN_KEY = 'tutorial-seen';

/**
 * Drives the onboarding tour: open/close, step navigation, and the
 * "show once on first login" gate (persisted in localStorage).
 */
@Injectable({ providedIn: 'root' })
export class TutorialService {
  readonly steps = TUTORIAL_STEPS;

  private readonly _index = signal<number | null>(null);

  constructor() {
    this.preloadImages();
  }

  readonly isOpen = computed(() => this._index() !== null);
  readonly index = this._index.asReadonly();
  readonly step = computed(() => {
    const i = this._index();
    return i === null ? null : this.steps[i];
  });
  readonly isFirst = computed(() => this._index() === 0);
  readonly isLast = computed(() => this._index() === this.steps.length - 1);

  /** Open the tour from the start (e.g. the profile "?" button). */
  start(): void {
    if (this.steps.length === 0) return;
    this._index.set(0);
  }

  /** Show the tour once, the first time a user reaches the app. No-op afterwards. */
  maybeAutoStart(): void {
    if (this.read(SEEN_KEY)) return;
    this.write(SEEN_KEY, '1');
    this.start();
  }

  next(): void {
    this._index.update((i) => (i === null ? i : Math.min(i + 1, this.steps.length - 1)));
  }

  prev(): void {
    this._index.update((i) => (i === null ? i : Math.max(i - 1, 0)));
  }

  close(): void {
    this._index.set(null);
  }

  // ponytail: warm the browser cache so swiping between steps swaps the <img>
  // src in place without a blank flash. Trivial for ~14 small screenshots.
  private preloadImages(): void {
    if (typeof Image === 'undefined') return;
    for (const step of this.steps) {
      if (step.image) new Image().src = step.image;
      if (step.imageMobile) new Image().src = step.imageMobile;
    }
  }

  // ponytail: try/catch because localStorage throws in private-mode/SSR; a
  // failed read just means "show the tour", which is harmless.
  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}
