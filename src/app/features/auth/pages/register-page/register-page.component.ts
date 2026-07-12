import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { UsersService, UserRegisterRequest } from '../../../../api/generated';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { matchPasswords } from '../../utils/match-passwords.validator';
import {
  USERNAME_ERROR_PARAMS,
  usernameErrorKey,
  usernameValidators,
} from '../../utils/username.validator';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { VerificationRequiredComponent } from '../../components/verification-required/verification-required.component';
import { GoogleSignInButtonComponent } from '../../components/google-sign-in-button/google-sign-in-button.component';
import { AuthToolbarComponent } from '../../components/auth-toolbar/auth-toolbar.component';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

@Component({
  selector: 'app-register-page',
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
    AuthToolbarComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent implements OnDestroy {
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
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly limits = FIELD_LIMITS.user;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly registered = signal(false);
  /** Form-level error shown inline above the fields; persists until the next submit. */
  readonly formError = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', usernameValidators],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', [Validators.required]],
    agree: [false, [Validators.requiredTrue]],
  }, { validators: [matchPasswords()] });

  nameError(): string {
    const control = this.form.controls.name;
    if (!this.shouldShowError(control)) return '';

    const key = usernameErrorKey(control);
    return key ? this.transloco.translate(key, USERNAME_ERROR_PARAMS) : '';
  }

  emailError(): string {
    const control = this.form.controls.email;
    if (!this.shouldShowError(control)) return '';
    if (control.hasError('required')) return this.t('profile.emailForm.emailRequired');
    if (control.hasError('email')) return this.t('profile.emailForm.emailInvalid');
    return '';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!this.shouldShowError(control)) return '';
    return this.t('auth.passwordMinLength');
  }

  confirmError(): string {
    const control = this.form.controls.confirm;
    const showControlError = this.shouldShowError(control);
    if (showControlError && control.hasError('required')) return this.t('auth.confirmRequired');

    const showMismatch = this.form.hasError('passwordMismatch')
      && (this.submitted() || (control.touched && control.dirty));
    if (showMismatch) return this.t('auth.passwordsMismatch');
    return '';
  }

  private shouldShowError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    if (!control.invalid) return false;
    return this.submitted() || (control.touched && control.dirty);
  }

  onGoToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  onRegisterAgain(): void {
    this.registered.set(false);
    this.formError.set('');
    this.credentialsStore.clear();
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const body: UserRegisterRequest = {
      name: this.form.controls.name.getRawValue(),
      email: this.form.controls.email.getRawValue(),
      password: this.form.controls.password.getRawValue(),
    };

    this.usersApi.registerUser({ userRegisterRequest: body })
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.credentialsStore.set({
            email: body.email,
            password: body.password,
          });
          this.toast.success(this.t('auth.msg.accountCreated'));
          this.registered.set(true);
        },
        error: (err: unknown) => {
          console.error(err);
          this.formError.set(httpErrorMessage(err, {
            overrides: { 409: this.t('auth.err.userExists') },
            fallback: this.t('auth.err.registerFailed'),
          }));
        },
      });
  }

  ngOnDestroy(): void {
    this.credentialsStore.clear();
  }
}
