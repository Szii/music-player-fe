import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../../core/auth/session.service';
import { TokenRenewalService } from '../../../../core/auth/token-renewal.service';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { UsersService, UserLoginRequest, AuthResponse } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { VerificationRequiredComponent } from '../../components/verification-required/verification-required.component';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';
import { httpErrorMessage } from '../../../../shared/utils/http-error';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiCardComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
    UiAlertComponent,
    VerificationRequiredComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly session = inject(SessionService);
  private readonly tokenRenewal = inject(TokenRenewalService);
  private readonly router = inject(Router);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly needsVerification = signal(false);
  /** Form-level error shown inline above the fields; persists until the next submit. */
  readonly formError = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  nameError(): string {
    const control = this.form.controls.name;
    if (!this.shouldShowError(control)) return '';
    return 'Username is required.';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!this.shouldShowError(control)) return '';
    return 'Password is required.';
  }

  private shouldShowError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    if (!control.invalid) return false;
    return this.submitted() || (control.touched && control.dirty);
  }

  onBackToLogin(): void {
    this.needsVerification.set(false);
    this.credentialsStore.clear();
    this.form.controls.password.setValue('');
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const body: UserLoginRequest = {
      name: this.form.controls.name.getRawValue(),
      password: this.form.controls.password.getRawValue(),
    };

    this.usersApi.loginUser({ userLoginRequest: body })
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res: AuthResponse) => {
          if (res.token) {
            this.session.setToken(res.token);
            // Login set the refresh cookie; renew the access token off it.
            this.tokenRenewal.start();
          }
          void this.router.navigateByUrl('/');
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.credentialsStore.set({ name: body.name, password: body.password, email: '' });
            this.needsVerification.set(true);
            return;
          }
          this.formError.set(httpErrorMessage(err, {
            overrides: { 401: 'Invalid username or password.' },
            fallback: 'Login failed. Please try again.',
          }));
        },
      });
  }

  ngOnDestroy(): void {
    this.credentialsStore.clear();
  }
}
