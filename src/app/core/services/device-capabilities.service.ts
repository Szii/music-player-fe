import { Injectable, Signal, signal } from '@angular/core';

/**
 * Single source of truth for *input modality* — how the user points and types —
 * as opposed to *viewport width* (which lives in styles.css as the sm/md/lg
 * breakpoints). These are independent axes and must not be conflated:
 *
 *   - Width decides layout: table vs. cards, popover vs. full-width bottom sheet.
 *   - Modality decides interaction: whether to autofocus a field (and thus pop a
 *     soft keyboard), whether hover affordances make sense, tap-target sizing.
 *
 * Judging interaction by width is the classic bug where a tablet (wide, but
 * touch) gets desktop behaviour. Modality media features sidestep the width
 * "middle state" entirely.
 */
@Injectable({ providedIn: 'root' })
export class DeviceCapabilitiesService {
  /**
   * Precise pointer *and* hover — i.e. a real mouse/trackpad. True on desktops
   * and laptops (including hybrid laptops with a touchscreen, whose primary
   * pointer is still the trackpad); false on phones and tablets. This is the
   * condition under which autofocusing a text field is safe: there's no virtual
   * keyboard to pop up over the content.
   */
  readonly prefersAutoFocus = this.matches('(hover: hover) and (pointer: fine)');

  /** Whether the primary pointer can hover (desktop-style hover affordances). */
  readonly canHover = this.matches('(hover: hover)');

  /**
   * A touch-first device with no precise pointer or hover — i.e. phones and
   * tablets, excluding desktops/laptops (even touchscreen ones, whose primary
   * pointer is still a trackpad). Used to warn that a desktop environment is
   * needed for uninterrupted background playback.
   */
  readonly isMobile = this.matches('(pointer: coarse) and (hover: none)');

  private matches(query: string): Signal<boolean> {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return signal(false).asReadonly();
    }

    const mql = window.matchMedia(query);
    const state = signal(mql.matches);
    mql.addEventListener('change', (event) => state.set(event.matches));
    return state.asReadonly();
  }
}
