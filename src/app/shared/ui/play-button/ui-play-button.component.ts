import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type PlayButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-play-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="ui-play-button"
      [class.ui-play-button--playing]="playing()"
      [class.ui-play-button--labeled]="!!label()"
      [class]="sizeClass()"
      [disabled]="disabled()"
      [attr.aria-label]="effectiveAriaLabel()"
      (click)="clicked.emit()"
    >
      <span class="ui-play-button__icon" aria-hidden="true">
        @if (playing()) {
          <svg viewBox="0 0 20 20" width="14" height="14">
            <rect x="4" y="4" width="12" height="12" rx="1" fill="currentColor" />
          </svg>
        } @else {
          <svg viewBox="0 0 20 20" width="14" height="14">
            <polygon points="5,3 5,17 17,10" fill="currentColor" />
          </svg>
        }
      </span>
      @if (label()) {
        <span class="ui-play-button__label">{{ playing() ? stopLabel() : label() }}</span>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .ui-play-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex-shrink: 0;
        border: 0;
        cursor: pointer;
        color: #fff;
        background: var(--app-primary);
        box-shadow: 0 8px 16px color-mix(in srgb, var(--app-primary) 22%, transparent);
        transition:
          background 0.16s ease,
          box-shadow 0.16s ease,
          transform 0.1s ease;
      }

      .ui-play-button:hover:not(:disabled) {
        background: var(--app-primary-hover);
        transform: translateY(-1px);
      }

      .ui-play-button:active:not(:disabled) {
        transform: scale(0.96);
      }

      .ui-play-button:focus-visible {
        outline: none;
        box-shadow:
          0 8px 16px color-mix(in srgb, var(--app-primary) 22%, transparent),
          var(--app-focus-ring);
      }

      .ui-play-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        box-shadow: none;
      }

      .ui-play-button--playing {
        background: var(--app-danger);
        box-shadow: 0 8px 16px color-mix(in srgb, var(--app-danger) 20%, transparent);
      }

      .ui-play-button--playing:hover:not(:disabled) {
        background: color-mix(in srgb, var(--app-danger) 88%, black);
      }

      /* Round variant — default */
      .ui-play-button--sm {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }
      .ui-play-button--md {
        width: 42px;
        height: 42px;
        border-radius: 50%;
      }
      .ui-play-button--lg {
        width: 46px;
        height: 46px;
        border-radius: 50%;
      }

      .ui-play-button--sm .ui-play-button__icon svg { width: 11px; height: 11px; }
      .ui-play-button--md .ui-play-button__icon svg { width: 14px; height: 14px; }
      .ui-play-button--lg .ui-play-button__icon svg { width: 16px; height: 16px; }

      /* Labeled variant — pill */
      .ui-play-button--labeled {
        width: auto;
        height: auto;
        padding: 8px 14px;
        border-radius: 999px;
        font-family: var(--app-font-heading);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .ui-play-button--labeled.ui-play-button--sm {
        padding: 6px 12px;
        font-size: 11px;
      }

      .ui-play-button--labeled.ui-play-button--lg {
        padding: 10px 18px;
        font-size: 13px;
      }
    `,
  ],
})
export class UiPlayButtonComponent {
  readonly playing = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly size = input<PlayButtonSize>('md');
  readonly label = input<string | null>(null);
  readonly stopLabel = input<string>('Stop');
  readonly ariaLabel = input<string | null>(null);

  readonly clicked = output<void>();

  readonly sizeClass = computed(() => `ui-play-button--${this.size()}`);

  readonly effectiveAriaLabel = computed(() => {
    const explicit = this.ariaLabel();
    if (explicit) return explicit;
    return this.playing() ? this.stopLabel() : (this.label() ?? 'Play');
  });
}
