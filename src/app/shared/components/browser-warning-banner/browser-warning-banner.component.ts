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
  templateUrl: './browser-warning-banner.component.html',
  styleUrl: './browser-warning-banner.component.scss',
})
export class BrowserWarningBannerComponent {
  /** Drives the open/closed slide animation; the element stays mounted while closed. */
  readonly open = input(true);

  readonly message = input(
    'Currently, only Chromium browsers are supported. For the optimal audio experience, please use a Chromium-based browser.',
  );

  readonly close = output<void>();
}
