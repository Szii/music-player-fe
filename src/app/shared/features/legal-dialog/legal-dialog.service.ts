import { Injectable, signal } from '@angular/core';

/**
 * App-wide Privacy & Terms modal. Lets any component (footer, registration)
 * show the legal text as an overlay instead of navigating to /legal — so the
 * current page (e.g. a playing board) is never torn down.
 */
@Injectable({
  providedIn: 'root',
})
export class LegalDialogService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
