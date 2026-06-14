import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Locks background scrolling while modal surfaces are open. Reference-counted
 * so nested dialogs (e.g. a confirm opened from inside another dialog) only
 * release the lock once the last one closes. Compensates for the removed
 * scrollbar width to avoid a layout shift on desktop.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private readonly doc = inject(DOCUMENT);

  private lockCount = 0;
  private previousOverflow = '';
  private previousPaddingRight = '';

  lock(): void {
    if (this.lockCount === 0) {
      const body = this.doc.body;
      const view = this.doc.defaultView;
      const scrollbarWidth = view
        ? view.innerWidth - this.doc.documentElement.clientWidth
        : 0;

      this.previousOverflow = body.style.overflow;
      this.previousPaddingRight = body.style.paddingRight;

      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // Lets global CSS react to an open overlay (e.g. hide the mobile bottom
      // navigation so the modal owns the screen).
      body.classList.add('app-modal-open');
    }

    this.lockCount++;
  }

  unlock(): void {
    if (this.lockCount === 0) return;

    this.lockCount--;
    if (this.lockCount === 0) {
      const body = this.doc.body;
      body.style.overflow = this.previousOverflow;
      body.style.paddingRight = this.previousPaddingRight;
      body.classList.remove('app-modal-open');
    }
  }
}
