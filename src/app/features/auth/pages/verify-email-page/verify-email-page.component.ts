import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';

type VerifyState =
  | { status: 'pending' }
  | { status: 'verifying' }
  | { status: 'success' }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink, UiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-page app-page--narrow">
      <ui-card title="Verify email">
        @switch (state().status) {
          @case ('pending') {
            <p class="verify-page__text">Preparing verification...</p>
          }
          @case ('verifying') {
            <p class="verify-page__text">Verifying your email, please wait...</p>
          }
          @case ('success') {
            <p class="verify-page__text">
              Your email has been verified. You can now sign in.
            </p>
            <div class="verify-page__link">
              <a routerLink="/login">Go to login</a>
            </div>
          }
          @case ('error') {
            <p class="verify-page__text verify-page__text--error">
              {{ errorMessage() }}
            </p>
            <div class="verify-page__link">
              <a routerLink="/register">Back to register</a>
            </div>
          }
        }
      </ui-card>
    </div>
  `,
  styles: [`
    .verify-page__text {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    .verify-page__text--error {
      color: var(--color-danger, #b00020);
    }
    .verify-page__link {
      margin-top: 1rem;
    }
  `],
})
export class VerifyEmailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersApi = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<VerifyState>({ status: 'pending' });

  errorMessage(): string {
    const current = this.state();
    return current.status === 'error' ? current.message : '';
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set({ status: 'error', message: 'Missing verification token.' });
      return;
    }

    this.state.set({ status: 'verifying' });

    this.usersApi.verifyUserToken({ verificationToken: token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set({ status: 'success' }),
        error: (err: unknown) => {
          console.error(err);
          this.state.set({
            status: 'error',
            message: 'Verification failed. The link may be invalid or expired.',
          });
        },
      });
  }
}
