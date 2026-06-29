import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { ChangePasswordFormComponent } from '../../components/change-password-form/change-password-form.component';
import { ChangeEmailFormComponent } from '../../components/change-email-form/change-email-form.component';
import { UserLimitsCardComponent } from '../../components/user-limits-card/user-limits-card.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

@Component({
  selector: 'app-profile-page',
  imports: [
    UiCardComponent,
    UiPageTitleComponent,
    ChangePasswordFormComponent,
    ChangeEmailFormComponent,
    UserLimitsCardComponent,
    FooterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent implements OnInit {
  private readonly store = inject(ProfileStore);

  readonly status = this.store.status;
  readonly user = this.store.user;
  readonly trackNames = this.store.trackNames;
  readonly sessionNames = this.store.sessionNames;
  readonly errorMessage = this.store.errorMessage;

  ngOnInit(): void {
    // Always re-fetch /me so the profile shows current data on each visit.
    this.store.refresh();
  }
}