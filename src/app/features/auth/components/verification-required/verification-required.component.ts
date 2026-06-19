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
  templateUrl: './verification-required.component.html',
  styleUrl: './verification-required.component.scss',
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
