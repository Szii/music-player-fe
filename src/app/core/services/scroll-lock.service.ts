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
  /** Separate count for locks that also hide the bottom nav (see lock()). */
  private hideNavCount = 0;
  private previousOverflow = '';
  private previousPaddingRight = '';
  private savedScrollY = 0;

  /**
   * @param hideBottomNav When true (default) the mobile bottom nav is hidden so
   * the surface owns the screen — needed for dialogs/selects that render inside
   * a stacking context and can't be raised above the nav by z-index. Pass false
   * for body-level CDK overlays (e.g. the action-menu sheet) that already stack
   * above the nav: hiding/showing it on open/close jolts the layout.
   */
  lock(hideBottomNav = true): void {
    if (this.lockCount === 0) {
      const body = this.doc.body;
      const view = this.doc.defaultView;
      const scrollbarWidth = view
        ? view.innerWidth - this.doc.documentElement.clientWidth
        : 0;

      // Capture the scroll position before mutating the layout. Hiding the bottom
      // nav (via app-modal-open) shortens the document, which can clamp scrollY
      // upward while the overlay is open; we restore it on unlock so closing the
      // overlay never leaves the page scrolled to a different spot.
      this.savedScrollY = view ? view.scrollY : 0;

      this.previousOverflow = body.style.overflow;
      this.previousPaddingRight = body.style.paddingRight;

      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    // Lets global CSS react to an open overlay (e.g. hide the mobile bottom
    // navigation so the modal owns the screen).
    if (hideBottomNav && this.hideNavCount++ === 0) {
      this.doc.body.classList.add('app-modal-open');
    }

    this.lockCount++;
  }

  unlock(hideBottomNav = true): void {
    if (this.lockCount === 0) return;

    if (hideBottomNav && this.hideNavCount > 0 && --this.hideNavCount === 0) {
      this.doc.body.classList.remove('app-modal-open');
    }

    this.lockCount--;
    if (this.lockCount === 0) {
      const body = this.doc.body;
      body.style.overflow = this.previousOverflow;
      body.style.paddingRight = this.previousPaddingRight;

      // Restore the pre-lock scroll position (see lock()).
      this.doc.defaultView?.scrollTo(0, this.savedScrollY);
    }
  }
}
