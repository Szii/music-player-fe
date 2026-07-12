import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { BASE_PATH } from '../../../../api/generated';

@Component({
  imports: [TranslocoPipe],
  selector: 'app-google-sign-in-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './google-sign-in-button.component.html',
  styleUrl: './google-sign-in-button.component.scss',
})
export class GoogleSignInButtonComponent {
  private readonly basePath = inject(BASE_PATH);

  /** Empty falls back to the translated default. */
  readonly label = input('');

  /**
   * A full-page navigation, not an XHR: the backend redirects to Google and
   * lands the user back on /auth/callback with the refresh cookie already set.
   * Resolved against `document.baseURI` so it holds on any route depth.
   */
  onClick(): void {
    window.location.href = new URL(`${this.basePath}/auth/google`, document.baseURI).href;
  }
}
