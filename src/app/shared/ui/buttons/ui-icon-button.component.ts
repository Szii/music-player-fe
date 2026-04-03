import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type AppIconName =
  | 'edit'
  | 'delete'
  | 'tracks'
  | 'windows'
  | 'close'
  | 'play'
  | 'pause'
  | 'save'
  | 'plus';

export type AppIconButtonVariant =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost';

export type AppIconButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-icon-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="app-icon-btn"
      [class.app-icon-btn--sm]="size === 'sm'"
      [class.app-icon-btn--md]="size === 'md'"
      [class.app-icon-btn--lg]="size === 'lg'"
      [class.app-icon-btn--neutral]="variant === 'neutral'"
      [class.app-icon-btn--primary]="variant === 'primary'"
      [class.app-icon-btn--secondary]="variant === 'secondary'"
      [class.app-icon-btn--danger]="variant === 'danger'"
      [class.app-icon-btn--ghost]="variant === 'ghost'"
      [disabled]="disabled"
      [attr.aria-label]="label"
      [attr.title]="label"
      (click)="clicked.emit()"
    >
      <svg
        class="app-icon-btn__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        [attr.stroke-width]="1.9"
        aria-hidden="true"
      >
        <ng-container [ngSwitch]="icon">
          <ng-container *ngSwitchCase="'edit'">
            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
            <path d="M12.5 5.5l4 4" />
          </ng-container>

          <ng-container *ngSwitchCase="'delete'">
            <path d="M5 7h14" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M8 7l1-2h6l1 2" />
            <path d="M7 7l1 12h8l1-12" />
          </ng-container>

          <ng-container *ngSwitchCase="'tracks'">
            <path d="M9 18V7l10-2v11" />
            <path d="M9 18a2 2 0 1 1-4 0a2 2 0 0 1 4 0Z" />
            <path d="M19 16a2 2 0 1 1-4 0a2 2 0 0 1 4 0Z" />
          </ng-container>

          <ng-container *ngSwitchCase="'windows'">
            <!-- boundary markers -->
            <path d="M5 6v12" />
            <path d="M19 6v12" />
            <!-- selected segment -->
            <path d="M8 12h8" />
            <!-- inward arrows -->
            <path d="M10 10l-2 2 2 2" />
            <path d="M14 10l2 2-2 2" />
          </ng-container>

          <ng-container *ngSwitchCase="'close'">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </ng-container>

          <ng-container *ngSwitchCase="'play'">
            <path d="M8 6l10 6-10 6V6Z" fill="currentColor" stroke="none" />
          </ng-container>

          <ng-container *ngSwitchCase="'pause'">
            <path d="M8 6v12" />
            <path d="M16 6v12" />
          </ng-container>

          <ng-container *ngSwitchCase="'save'">
            <path d="M5 6a1 1 0 0 1 1-1h9l4 4v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6Z" />
            <path d="M8 5v5h8" />
            <path d="M8 19v-5h8v5" />
          </ng-container>

          <ng-container *ngSwitchCase="'plus'">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </ng-container>

          <ng-container *ngSwitchDefault>
            <circle cx="12" cy="12" r="7" />
          </ng-container>
        </ng-container>
      </svg>
    </button>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .app-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: var(--app-radius-sm);
      border: 1px solid transparent;
      cursor: pointer;
      outline: none;
      line-height: 1;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease,
        opacity 0.15s ease,
        transform 0.1s ease,
        box-shadow 0.15s ease;
    }

    .app-icon-btn:focus-visible {
      box-shadow: var(--app-focus-ring);
    }

    .app-icon-btn:active:not(:disabled) {
      transform: scale(0.96);
    }

    .app-icon-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }

    .app-icon-btn--sm {
      width: 30px;
      height: 30px;
    }

    .app-icon-btn--md {
      width: 36px;
      height: 36px;
    }

    .app-icon-btn--lg {
      width: 42px;
      height: 42px;
    }

    .app-icon-btn__icon {
      display: block;
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
    }

    .app-icon-btn--lg .app-icon-btn__icon {
      width: 18px;
      height: 18px;
    }

    .app-icon-btn--neutral {
      background: var(--app-surface-elevated);
      color: var(--app-text-muted);
      border-color: var(--app-border-color-soft);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        0 2px 8px rgba(30, 16, 4, 0.12);
    }

    .app-icon-btn--neutral:hover:not(:disabled) {
      background: var(--app-surface);
      color: var(--app-text);
      border-color: var(--app-border-color);
    }

    .app-icon-btn--primary {
      background: linear-gradient(180deg, #6a1e10 0%, #58180d 100%);
      color: #fff8ee;
      border-color: #3d1008;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 3px 10px rgba(20, 5, 2, 0.24);
    }

    .app-icon-btn--primary:hover:not(:disabled) {
      background: linear-gradient(180deg, #4e1609 0%, #3d1008 100%);
    }

    .app-icon-btn--secondary {
      background: linear-gradient(180deg, #d8b45e 0%, #c9a44c 100%);
      color: #2b1c0c;
      border-color: #a8832e;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        0 2px 8px rgba(30, 16, 4, 0.16);
    }

    .app-icon-btn--secondary:hover:not(:disabled) {
      background: linear-gradient(180deg, #c4a040 0%, #a8832e 100%);
    }

    .app-icon-btn--danger {
      background: linear-gradient(180deg, #b82020 0%, #9e1818 100%);
      color: #fff0ec;
      border-color: #781010;
      box-shadow:
        inset 0 1px 0 rgba(255, 210, 200, 0.12),
        0 2px 8px rgba(60, 8, 4, 0.22);
    }

    .app-icon-btn--danger:hover:not(:disabled) {
      background: linear-gradient(180deg, #9e1818 0%, #841212 100%);
    }

    .app-icon-btn--ghost {
      background: transparent;
      color: var(--app-primary);
      border-color: rgba(88, 24, 13, 0.22);
    }

    .app-icon-btn--ghost:hover:not(:disabled) {
      background: rgba(88, 24, 13, 0.07);
      border-color: rgba(88, 24, 13, 0.38);
    }
  `],
})
export class IconButtonComponent {
  @Input() icon: AppIconName = 'edit';
  @Input() label = 'Action';
  @Input() variant: AppIconButtonVariant = 'neutral';
  @Input() size: AppIconButtonSize = 'md';
  @Input() disabled = false;

  @Output() clicked = new EventEmitter<void>();
}