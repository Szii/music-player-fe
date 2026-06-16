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
  template: `
    <button
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      type="button"
      class="action-menu__trigger"
      [class.action-menu__trigger--open]="open()"
      [attr.aria-label]="triggerLabel()"
      [attr.title]="triggerLabel()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" class="action-menu__icon">
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
      </svg>
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="action-menu-backdrop"
      cdkConnectedOverlayPanelClass="action-menu-pane"
      [cdkConnectedOverlayPush]="true"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="animateClose()"
      (detach)="close()"
    >
      <div
        #sheetEl
        class="app-popover-surface action-menu__panel"
        [class.action-menu__panel--closing]="closing()"
        role="menu"
      >
        <button
          type="button"
          class="action-menu__handle"
          [appBottomSheetDrag]="sheetEl"
          (dismiss)="close()"
          aria-label="Close menu"
        >
          <span class="action-menu__handle-bar" aria-hidden="true"></span>
        </button>

        <div class="app-popover-header action-menu__heading">{{ triggerLabel() }}</div>

        @for (item of items(); track item.id) {
          @if (item.href) {
            <a
              class="app-popover-item"
              [class.app-popover-item--danger]="item.variant === 'danger'"
              role="menuitem"
              [href]="item.href"
              target="_blank"
              rel="noopener noreferrer"
              (click)="close()"
            >
              {{ item.label }}
            </a>
          } @else {
            <button
              type="button"
              class="app-popover-item"
              [class.app-popover-item--danger]="item.variant === 'danger'"
              role="menuitem"
              [disabled]="item.disabled"
              (click)="onSelect(item)"
            >
              {{ item.label }}
            </button>
          }
        }
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    .action-menu__trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
      color: var(--app-text-muted);
      cursor: pointer;
      outline: none;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;
    }

    .action-menu__trigger:hover:not(:disabled),
    .action-menu__trigger--open {
      background: var(--app-surface);
      color: var(--app-text);
      border-color: var(--app-border-color);
    }

    .action-menu__trigger:focus-visible {
      box-shadow: var(--app-focus-ring);
    }

    .action-menu__trigger:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }

    .action-menu__icon {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    .action-menu__panel {
      min-width: 180px;
      /* No padding so rows run edge-to-edge and their hairline dividers read as
         a clean list (the rounded panel clips the first/last row). */
      padding: 0;
    }

    /* Drag handle + heading are phone-only; shown via the global bottom-sheet
       rules. Desktop stays a compact anchored dropdown with no header. */
    .action-menu__handle,
    .action-menu__heading {
      display: none;
    }

    /* Full-width rows separated by hairlines, on desktop and mobile alike. */
    .app-popover-item {
      border-radius: 0;
      border-bottom: 1px solid rgba(158, 98, 53, 0.12);
    }

    .app-popover-item:last-child {
      border-bottom: none;
    }

    .app-popover-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
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
    // On phones the menu is a bottom sheet that owns the screen: lock background
    // scroll (and hide the bottom nav via the shared body class) so the sheet
    // can't drift on scroll. Ref-counted, mobile only.
    effect((onCleanup) => {
      if (!this.open()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
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
