import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';

import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { BottomSheetDragDirective } from '../bottom-sheet/bottom-sheet-drag.directive';

export interface ActionMenuItem {
  /** Stable identifier emitted on select. */
  id: string;
  label: string;
  /** Danger items are tinted and typically destructive (e.g. delete). */
  variant?: 'default' | 'danger';
  disabled?: boolean;
  /** When set the item is a link (opens in a new tab) rather than an action. */
  href?: string;
}

/**
 * Kebab (three-dot) trigger that opens a dropdown of actions. Rendered through
 * a CDK overlay so it escapes scrollable / overflow-hidden containers such as
 * data tables. Action items emit `select`; link items navigate.
 */
@Component({
  selector: 'ui-action-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, BottomSheetDragDirective],
  host: {
    '(document:keydown.escape)': 'animateClose()',
  },
  templateUrl: './ui-action-menu.component.html',
  styleUrl: './ui-action-menu.component.scss',
})
export class UiActionMenuComponent {
  readonly items = input.required<ActionMenuItem[]>();
  readonly triggerLabel = input('More actions');
  readonly disabled = input(false);

  readonly select = output<string>();

  readonly open = signal(false);
  /** Drives the slide-down animation before the mobile sheet detaches. */
  readonly closing = signal(false);

  private readonly scrollLock = inject(ScrollLockService);
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  readonly hasItems = computed(() => this.items().length > 0);

  constructor() {
    // On phones the menu is a bottom sheet: lock background scroll so it can't
    // drift. Keep the bottom nav visible (hideBottomNav: false) — the sheet is a
    // body-level CDK overlay that already stacks above it, and hiding/showing the
    // nav on open/close jolts the layout. Ref-counted, mobile only.
    effect((onCleanup) => {
      if (!this.open()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock(false);
      onCleanup(() => this.scrollLock.unlock(false));
    });
  }

  toggle(): void {
    if (this.open()) {
      this.animateClose();
      return;
    }
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.closing.set(false);
    this.open.set(true);
  }

  /**
   * Close the menu. On mobile (where it's a bottom sheet) play a slide-down
   * first, mirroring the open animation, then remove it.
   */
  animateClose(): void {
    if (!this.open() || this.closing()) return;

    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) {
      this.close();
      return;
    }

    this.closing.set(true);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.close();
    }, 200);
  }

  close(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.closing.set(false);
    if (this.open()) this.open.set(false);
  }

  onSelect(item: ActionMenuItem): void {
    if (item.disabled) return;
    this.select.emit(item.id);
    this.close();
  }
}
