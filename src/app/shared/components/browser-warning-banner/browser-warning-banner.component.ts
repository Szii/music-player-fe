import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Dismissible environment notice shown under the navbar (e.g. unsupported
 * browser, or background playback needing a desktop). Visibility and message are
 * owned by the caller; this component only renders the message and emits
 * {@link close} when the user dismisses it.
 */
@Component({
  selector: 'app-browser-warning-banner',
  imports: [TranslocoPipe],
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

  /** Translation key, resolved in the template. */
  readonly message = input('warnings.browser');

  readonly close = output<void>();
}
