import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { ChangePasswordFormComponent } from '../../components/change-password-form/change-password-form.component';
import { ChangeEmailFormComponent } from '../../components/change-email-form/change-email-form.component';
import { UserLimitsCardComponent } from '../../components/user-limits-card/user-limits-card.component';

@Component({
  selector: 'app-profile-page',
  imports: [
    UiCardComponent,
    UiPageTitleComponent,
    ChangePasswordFormComponent,
    ChangeEmailFormComponent,
    UserLimitsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-page">
      <ui-page-title title="User profile" />

      @switch (status()) {
        @case ('loading') {
          <p class="app-muted">Loading your profile...</p>
        }

        @case ('error') {
          <p class="profile-error">{{ errorMessage() }}</p>
        }

        @case ('loaded') {
          <ui-card title="Account">
            <dl class="profile-identity">
              <dt>Username</dt>
              <dd>{{ user()?.name || '—' }}</dd>

              <dt>Email</dt>
              <dd>{{ user()?.email || '—' }}</dd>
            </dl>
          </ui-card>

          <div class="profile-grid">
            <div class="profile-grid__security">
              <ui-card title="Change password">
                <app-change-password-form />
              </ui-card>

              <ui-card title="Change email">
                <app-change-email-form />
              </ui-card>
            </div>

            <ui-card title="Rank & limits">
              <app-user-limits-card
                [limits]="user()?.limits ?? null"
                [trackNames]="trackNames()"
                [sessionNames]="sessionNames()"
              />
            </ui-card>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .app-page > ui-card {
      display: block;
      margin-bottom: 1.5rem;
    }

    .profile-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 1.5rem;
      align-items: start;
    }

    @media (max-width: 900px) {
      .profile-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .profile-grid__security {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .profile-identity {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.5rem 1rem;
      margin: 0;
    }

    .profile-identity dt {
      font-family: var(--app-font-heading);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-text-muted);
      align-self: center;
    }

    .profile-identity dd {
      margin: 0;
      font-weight: 600;
      color: var(--app-text);
      word-break: break-all;
    }

    .profile-error {
      color: var(--app-danger);
    }
  `],
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