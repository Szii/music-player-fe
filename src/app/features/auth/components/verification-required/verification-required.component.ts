import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService } from '../../../../api/generated';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

type ResendStatus = 'idle' | 'sending' | 'sent' | 'rate-limited' | 'wrong-credentials' | 'error';
type ChangeStatus = 'idle' | 'submitting' | 'already-registered' | 'wrong-credentials' | 'error';

@Component({
  selector: 'app-verification-required',
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="verify-required__notice">
      Registration successful. Please check
      @if (currentEmail(); as email) {
        <strong>{{ email }}</strong>
      } @else {
        your email
      }
      and click the verification link to activate your account.
    </p>

    @if (!showEmailInputs) {
      <p class="verify-required__status verify-required__status--error">
        Email actions are currently unavailable. Procceed to login.
      </p>
    }

    <div class="verify-required__actions">
      <normal-button
        variant="primary"
        [disabled]="!showEmailInputs || resendStatus() === 'sending'"
        [loading]="resendStatus() === 'sending'"
        (clicked)="onResend()"
      >
        {{ resendStatus() === 'sending' ? 'Sending...' : 'Resend verification email' }}
      </normal-button>

      <normal-button
        variant="secondary"
        [disabled]="!showEmailInputs"
        (clicked)="toggleChangeEmail()"
      >
        {{ showChangeEmail() ? 'Cancel change' : 'Change email address' }}
      </normal-button>
    </div>

    @switch (resendStatus()) {
      @case ('sent') {
        <p class="verify-required__status verify-required__status--success">
          A new verification email has been sent.
        </p>
      }
      @case ('rate-limited') {
        <p class="verify-required__status verify-required__status--error">
          Too many requests. Please wait a moment and try again.
        </p>
      }
      @case ('wrong-credentials') {
        <p class="verify-required__status verify-required__status--error">
          We could not resend. Please log in again to retry.
        </p>
      }
      @case ('error') {
        <p class="verify-required__status verify-required__status--error">
          Could not resend the verification email. Please try again.
        </p>
      }
    }

    @if (showChangeEmail()) {
      <form
        class="verify-required__change-form app-form-stack"
        [formGroup]="changeForm"
        (ngSubmit)="onChangeEmail()"
      >
        <ui-form-field
          label="New email"
          [error]="newEmailError()"
        >
          <ui-text-input formControlName="newEmail" type="email" />
        </ui-form-field>

        @switch (changeStatus()) {
          @case ('already-registered') {
            <p class="verify-required__status verify-required__status--error">
              That email is already registered.
            </p>
          }
          @case ('wrong-credentials') {
            <p class="verify-required__status verify-required__status--error">
              We could not change the email. Please log in again to retry.
            </p>
          }
          @case ('error') {
            <p class="verify-required__status verify-required__status--error">
              Could not change the email. Please try again.
            </p>
          }
        }

        <ui-form-actions>
          <normal-button
            type="submit"
            [disabled]="changeForm.invalid || changeStatus() === 'submitting'"
            [loading]="changeStatus() === 'submitting'"
          >
            {{ changeStatus() === 'submitting' ? 'Saving...' : 'Save new email' }}
          </normal-button>
        </ui-form-actions>
      </form>
    }

    <div class="verify-required__link">
      <normal-button variant="ghost" (clicked)="cancel.emit()">
        Go to login
      </normal-button>
    </div>
  `,
  styles: [`
    .verify-required__notice {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    .verify-required__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .verify-required__status {
      margin: 0.5rem 0;
      line-height: 1.5;
    }
    .verify-required__status--success {
      color: var(--color-success, #2e7d32);
    }
    .verify-required__status--error {
      color: var(--color-danger, #b00020);
    }
    .verify-required__change-form {
      margin-top: 1rem;
    }
    .verify-required__link {
      margin-top: 1rem;
    }
  `],
})
export class VerificationRequiredComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly email = input<string | null>(null);
  readonly cancel = output<void>();

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

  readonly currentEmail = computed(
    () => this.credentialsStore.credentials()?.email ?? this.email() ?? null,
  );

  readonly showChangeEmail = signal(false);
  readonly submittedChange = signal(false);
  readonly resendStatus = signal<ResendStatus>('idle');
  readonly changeStatus = signal<ChangeStatus>('idle');

  readonly changeForm = this.fb.nonNullable.group({
    newEmail: ['', [Validators.required, Validators.email]],
  });

  newEmailError(): string {
    const control = this.changeForm.controls.newEmail;
    if (!control.invalid) return '';
    if (!(this.submittedChange() || (control.touched && control.dirty))) return '';
    if (control.hasError('required')) return 'Email is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  toggleChangeEmail(): void {
    if (!this.showEmailInputs) return;
    this.showChangeEmail.update(v => !v);
    if (!this.showChangeEmail()) {
      this.changeForm.reset({ newEmail: '' });
      this.submittedChange.set(false);
      this.changeStatus.set('idle');
    }
  }

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

  onChangeEmail(): void {
    if (!this.showEmailInputs) return;
    this.submittedChange.set(true);
    this.changeForm.markAllAsTouched();
    if (this.changeForm.invalid) return;

    const credentials = this.credentialsStore.credentials();
    if (!credentials) {
      this.changeStatus.set('wrong-credentials');
      return;
    }

    const newEmail = this.changeForm.controls.newEmail.getRawValue();
    this.changeStatus.set('submitting');

    this.usersApi.changeUnverifiedEmail({
      userRegisterRequest: {
        name: credentials.name,
        password: credentials.password,
        email: newEmail,
      },
    })
      .pipe(
        finalize(() => {
          if (this.changeStatus() === 'submitting') this.changeStatus.set('idle');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.credentialsStore.updateEmail(newEmail);
          this.changeStatus.set('idle');
          this.showChangeEmail.set(false);
          this.changeForm.reset({ newEmail: '' });
          this.submittedChange.set(false);
          this.toast.success('Email updated. A new verification link has been sent.');
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse) {
            if (err.status === 403) {
              this.changeStatus.set('wrong-credentials');
              return;
            }
            if (err.status === 409) {
              this.changeStatus.set('already-registered');
              return;
            }
          }
          this.changeStatus.set('error');
        },
      });
  }
}
