import { Injectable, computed, effect, signal } from '@angular/core';

import { TUTORIAL_STEPS } from '../data/tutorial-steps';
import { TutorialStep } from '../models/tutorial-step';

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
    // Warm only the steps adjacent to the open one, so swiping swaps the <img>
    // src without a blank flash. Preloading the whole tour up front cost every
    // visitor the full screenshot set on the login page, before they had even
    // signed in — most never open the tour at all.
    effect(() => {
      const i = this._index();
      if (i === null) return;

      this.preloadStep(this.steps[i + 1]);
      this.preloadStep(this.steps[i - 1]);
    });
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

  /** Jump straight to a step (e.g. tapping a pagination dot). */
  goTo(index: number): void {
    if (this._index() === null) return;
    if (index < 0 || index >= this.steps.length) return;
    this._index.set(index);
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

  private preloadStep(step: TutorialStep | undefined): void {
    if (!step || typeof Image === 'undefined') return;
    if (step.image) new Image().src = step.image;
    if (step.imageMobile) new Image().src = step.imageMobile;
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
