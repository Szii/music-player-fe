import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Dismissible environment notice shown under the navbar (e.g. unsupported
 * browser, or background playback needing a desktop). Visibility and message are
 * owned by the caller; this component only renders the message and emits
 * {@link close} when the user dismisses it.
 */
@Component({
  selector: 'app-browser-warning-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.browser-warning-host--open]': 'open()',
  },
  template: `
    <div class="browser-warning" role="status">
      <div class="browser-warning__inner">
        <span class="browser-warning__icon" aria-hidden="true">!</span>
        <p class="browser-warning__text">{{ message() }}</p>
        <button
          type="button"
          class="browser-warning__close"
          (click)="close.emit()"
          aria-label="Dismiss notice"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Quick slide: collapse the row height to content (0fr -> 1fr) and fade. */
    :host {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      transition: grid-template-rows 0.2s ease, opacity 0.18s ease;
    }

    :host(.browser-warning-host--open) {
      grid-template-rows: 1fr;
      opacity: 1;
    }

    .browser-warning {
      overflow: hidden;
      min-height: 0;
      background: var(--app-warning-soft, #fbf0d4);
      border-bottom: 1px solid rgba(158, 110, 16, 0.3);
      color: var(--app-warning, #9e6e10);
    }

    .browser-warning__inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0.55rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.7rem;
    }

    .browser-warning__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 50%;
      background: var(--app-warning, #9e6e10);
      color: var(--app-warning-soft, #fbf0d4);
      font-family: var(--app-font-heading);
      font-weight: 700;
      font-size: 0.85rem;
      line-height: 1;
    }

    .browser-warning__text {
      margin: 0;
      flex: 1;
      min-width: 0;
      font-size: 0.85rem;
      line-height: 1.35;
      color: var(--app-text, #2d1b0e);
    }

    .browser-warning__close {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.7rem;
      height: 1.7rem;
      border: 1px solid transparent;
      border-radius: var(--app-radius-sm);
      background: transparent;
      color: var(--app-warning, #9e6e10);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .browser-warning__close:hover {
      background: rgba(158, 110, 16, 0.12);
      border-color: rgba(158, 110, 16, 0.3);
    }

    .browser-warning__close:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(158, 110, 16, 0.25);
    }
  `],
})
export class BrowserWarningBannerComponent {
  /** Drives the open/closed slide animation; the element stays mounted while closed. */
  readonly open = input(true);

  readonly message = input(
    'Currently, only Chromium browsers are supported. For the optimal audio experience, please use a Chromium-based browser.',
  );

  readonly close = output<void>();
}
