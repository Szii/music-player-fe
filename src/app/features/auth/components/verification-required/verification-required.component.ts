import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService } from '../../../../api/generated';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

type ResendStatus = 'idle' | 'sending' | 'sent' | 'rate-limited' | 'wrong-credentials' | 'error';
export type VerificationMode = 'registered' | 'unverified';

@Component({
  selector: 'app-verification-required',
  imports: [NormalButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verification-required.component.html',
  styleUrl: './verification-required.component.scss',
})
export class VerificationRequiredComponent {
  private readonly usersApi = inject(UsersService);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly email = input<string | null>(null);
  readonly mode = input<VerificationMode>('registered');
  readonly cancel = output<void>();
  readonly registerAgain = output<void>();

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

  readonly currentEmail = computed(
    () => this.credentialsStore.credentials()?.email ?? this.email() ?? null,
  );

  readonly leadText = computed(() => this.mode() === 'registered'
    ? 'Registration successful.'
    : 'This account is not verified yet.');

  readonly cancelText = computed(() => this.mode() === 'registered'
    ? 'Go to login'
    : 'Back to login');

  readonly resendStatus = signal<ResendStatus>('idle');

  onResend(): void {
    if (!this.showEmailInputs) return;
    const credentials = this.credentialsStore.credentials();
    if (!credentials) {
      this.resendStatus.set('wrong-credentials');
      return;
    }

    this.resendStatus.set('sending');

    this.usersApi.resendVerificationEmail({
      userLoginRequest: { name: credentials.name, password: credentials.password },
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.resendStatus.set('sent'),
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse) {
            if (err.status === 401) {
              this.resendStatus.set('wrong-credentials');
              return;
            }
            if (err.status === 429) {
              this.resendStatus.set('rate-limited');
              return;
            }
          }
          this.resendStatus.set('error');
        },
      });
  }
}
