import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../../core/auth/session.service';
import { TokenRenewalService } from '../../../../core/auth/token-renewal.service';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { UsersService, UserLoginRequest, AuthResponse } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { VerificationRequiredComponent } from '../../components/verification-required/verification-required.component';
import { GoogleSignInButtonComponent } from '../../components/google-sign-in-button/google-sign-in-button.component';
import { AuthToolbarComponent } from '../../components/auth-toolbar/auth-toolbar.component';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { TutorialService } from '../../../tutorial/data-access/tutorial.service';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FooterComponent,
    UiCardComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    UiAlertComponent,
    VerificationRequiredComponent,
    GoogleSignInButtonComponent,
    TranslocoPipe,
    AuthToolbarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent implements OnDestroy {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly session = inject(SessionService);
  private readonly tokenRenewal = inject(TokenRenewalService);
  private readonly router = inject(Router);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tutorial = inject(TutorialService);

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly needsVerification = signal(false);
  /** Form-level error shown inline above the fields; persists until the next submit. */
  readonly formError = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  emailError(): string {
    const control = this.form.controls.email;
    if (!this.shouldShowError(control)) return '';
    if (control.hasError('required')) return this.t('profile.emailForm.emailRequired');
    return this.t('profile.emailForm.emailInvalid');
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!this.shouldShowError(control)) return '';
    return this.t('auth.passwordRequired');
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

  onRegisterAgain(): void {
    this.credentialsStore.clear();
    void this.router.navigateByUrl('/register');
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const body: UserLoginRequest = {
      email: this.form.controls.email.getRawValue(),
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
          void this.router.navigateByUrl('/').then(() => this.tutorial.maybeAutoStart());
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.credentialsStore.set({ email: body.email, password: body.password });
            this.needsVerification.set(true);
            return;
          }
          this.formError.set(httpErrorMessage(err, {
            overrides: { 401: this.t('auth.err.invalidCredentials') },
            fallback: this.t('auth.err.loginFailed'),
          }));
        },
      });
  }

  ngOnDestroy(): void {
    this.credentialsStore.clear();
  }
}
