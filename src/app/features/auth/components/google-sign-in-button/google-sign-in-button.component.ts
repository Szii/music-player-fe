import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { BASE_PATH } from '../../../../api/generated';

@Component({
  selector: 'app-google-sign-in-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './google-sign-in-button.component.html',
  styleUrl: './google-sign-in-button.component.scss',
})
export class GoogleSignInButtonComponent {
  private readonly basePath = inject(BASE_PATH);

  readonly label = input('Sign in with Google');

  /**
   * A full-page navigation, not an XHR: the backend redirects to Google and
   * lands the user back on /auth/callback with the refresh cookie already set.
   * Resolved against `document.baseURI` so it holds on any route depth.
   */
  onClick(): void {
    window.location.href = new URL(`${this.basePath}/auth/google`, document.baseURI).href;
  }
}
