import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { ProfileStore } from '../../data-access/profile-store.service';
import { LanguageSelectComponent } from '../../../../shared/components/language-select/language-select.component';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { ChangePasswordFormComponent } from '../../components/change-password-form/change-password-form.component';
import { ChangeEmailFormComponent } from '../../components/change-email-form/change-email-form.component';
import { ChangeUsernameFormComponent } from '../../components/change-username-form/change-username-form.component';
import { UserLimitsCardComponent } from '../../components/user-limits-card/user-limits-card.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { TutorialService } from '../../../tutorial/data-access/tutorial.service';

@Component({
  selector: 'app-profile-page',
  imports: [
    UiCardComponent,
    UiPageTitleComponent,
    ChangePasswordFormComponent,
    ChangeEmailFormComponent,
    ChangeUsernameFormComponent,
    UserLimitsCardComponent,
    FooterComponent,
    LanguageSelectComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent implements OnInit {
  private readonly store = inject(ProfileStore);
  readonly tutorial = inject(TutorialService);

  readonly status = this.store.status;
  readonly user = this.store.user;
  readonly trackNames = this.store.trackNames;
  readonly sessionNames = this.store.sessionNames;
  readonly errorMessage = this.store.errorMessage;

  /**
   * Google owns the credentials for these accounts: the password and email
   * endpoints answer 403, so the forms are hidden rather than left to fail.
   */
  readonly managedByGoogle = computed(() => this.user()?.managedByGoogle === true);

  ngOnInit(): void {
    // Always re-fetch /me so the profile shows current data on each visit.
    this.store.refresh();
  }
}