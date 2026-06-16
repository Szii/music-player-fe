import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';

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
  imports: [OverlayModule],
  host: {
    '(document:keydown.escape)': 'close()',
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
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      [cdkConnectedOverlayPush]="true"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="close()"
      (detach)="close()"
    >
      <div class="app-popover-surface action-menu__panel" role="menu">
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
      padding: 4px;
    }

    .app-popover-item {
      border-radius: var(--app-radius-sm);
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

  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  readonly hasItems = computed(() => this.items().length > 0);

  toggle(): void {
    this.open.update(value => !value);
  }

  close(): void {
    if (this.open()) this.open.set(false);
  }

  onSelect(item: ActionMenuItem): void {
    if (item.disabled) return;
    this.select.emit(item.id);
    this.close();
  }
}
