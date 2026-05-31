import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Large, centered "create" call-to-action card used for empty states
 * (e.g. first session, first board, first group). Emits `clicked` so the
 * host can open the relevant create flow.
 */
@Component({
  selector: 'ui-create-cta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-create-cta__wrap">
      <button
        type="button"
        class="ui-create-cta"
        [attr.aria-label]="ariaLabel() || label()"
        (click)="clicked.emit($event)"
      >
        <span class="ui-create-cta__plus" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <span class="ui-create-cta__label">{{ label() }}</span>
      </button>
    </div>
  `,
  styles: [`
    .ui-create-cta__wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4rem 1rem;
    }

    .ui-create-cta {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 2.2rem 2.4rem 2.6rem;
      min-width: 260px;
      background: var(--app-parchment);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      color: var(--app-heading);
      cursor: pointer;
      box-shadow: var(--app-shadow);
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition:
        border-color 0.15s ease,
        transform 0.12s ease,
        box-shadow 0.18s ease,
        background-color 0.15s ease;
    }

    .ui-create-cta:hover {
      border-color: var(--app-primary);
      transform: translateY(-1px);
      box-shadow:
        0 16px 38px rgba(15, 8, 3, 0.28),
        0 4px 14px rgba(15, 8, 3, 0.16);
    }

    .ui-create-cta:focus {
      outline: none;
    }

    .ui-create-cta:focus:not(:focus-visible) {
      outline: none;
      box-shadow: var(--app-shadow);
    }

    .ui-create-cta:focus-visible {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring), var(--app-shadow);
    }

    .ui-create-cta:active {
      transform: translateY(1px) scale(0.99);
      box-shadow:
        inset 0 2px 6px rgba(15, 8, 3, 0.18),
        0 4px 12px rgba(15, 8, 3, 0.16);
    }

    .ui-create-cta__plus {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(180deg, #6a1e10 0%, #58180d 100%);
      color: #fff8ee;
      font-size: 3rem;
      line-height: 1;
      font-weight: 400;
      border: 1px solid #3d1008;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 4px 12px rgba(30, 8, 4, 0.28);
    }

    .ui-create-cta__label {
      position: relative;
      padding-bottom: 0.7rem;
      font-family: var(--app-font-heading);
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--app-heading);
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.12);
    }

    .ui-create-cta__label::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 100%;
      height: 2px;
      background: var(--app-divider-decor);
      opacity: 0.85;
    }
  `],
})
export class UiCreateCtaComponent {
  readonly label = input.required<string>();
  readonly ariaLabel = input('');
  readonly clicked = output<MouseEvent>();
}
