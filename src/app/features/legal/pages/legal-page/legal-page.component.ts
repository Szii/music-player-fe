import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { LegalContentComponent } from '../../../../shared/components/legal-content/legal-content.component';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

/** Public Privacy & Terms page — reachable without signing in. */
@Component({
  selector: 'app-legal-page',
  imports: [LegalContentComponent, UiCardComponent, FooterComponent, NormalButtonComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
})
export class LegalPageComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /**
   * Landing here directly (a new tab from the register form, a shared link) leaves
   * nothing to go back to, so fall back to the app root — the auth guard sends
   * signed-out visitors on to /login from there.
   */
  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }

    void this.router.navigateByUrl('/');
  }
}
