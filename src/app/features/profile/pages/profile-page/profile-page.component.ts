import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiSelectComponent, UiSelectOption } from '../../../../shared/ui/select/ui-select.component';
import { AppLanguage, LANGUAGE_CHOICES, LanguageService } from '../../../../core/services/language.service';
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
    UiSelectComponent,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent implements OnInit {
  private readonly store = inject(ProfileStore);
  private readonly languages = inject(LanguageService);
  readonly tutorial = inject(TutorialService);

  readonly languageOptions: UiSelectOption[] = LANGUAGE_CHOICES.map(choice => ({
    value: choice.value,
    label: choice.label,
    icon: choice.flag,
  }));

  readonly languageControl = new FormControl<AppLanguage>(this.languages.language(), {
    nonNullable: true,
  });

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

  constructor() {
    this.languageControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(language => this.languages.setLanguage(language));
  }

  ngOnInit(): void {
    // Always re-fetch /me so the profile shows current data on each visit.
    this.store.refresh();
  }
}