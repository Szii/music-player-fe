import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../../core/auth/session.service';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { UsersService, UserLoginRequest, AuthResponse } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { VerificationRequiredComponent } from '../../components/verification-required/verification-required.component';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';

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
    VerificationRequiredComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-page app-page--narrow">
      <ui-card title="Login">
        @if (needsVerification()) {
          <app-verification-required (cancel)="onBackToLogin()" />
        } @else {
          <form class="app-form-stack" [formGroup]="form" (ngSubmit)="onSubmit()">
            <ui-form-field
              label="Username"
              [error]="nameError()"
            >
              <ui-text-input formControlName="name" />
            </ui-form-field>

            <ui-form-field
              label="Password"
              [error]="passwordError()"
            >
              <ui-text-input formControlName="password" type="password" />
            </ui-form-field>

            <ui-form-actions>
              <normal-button
                type="submit"
                [disabled]="form.invalid || isSubmitting()"
                [loading]="isSubmitting()"
              >
                {{ isSubmitting() ? 'Signing in...' : 'Sign in' }}
              </normal-button>
            </ui-form-actions>
          </form>

          <div class="auth-page__link">
            @if (showEmailInputs) {
              <a routerLink="/forgot-password">Forgot password?</a>
            } @else {
              <span class="auth-page__link--disabled" aria-disabled="true">Forgot password?</span>
            }
          </div>

          <div class="auth-page__link">
            <a routerLink="/register">Need an account? Register</a>
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: [`
    .auth-page__link {
      margin-top: 1rem;
    }
    .auth-page__link--disabled {
      color: var(--app-text-muted);
      cursor: not-allowed;
      opacity: 0.6;
    }
  `],
})
export class LoginPageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly needsVerification = signal(false);

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
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.toast.error('Invalid username or password.');
            return;
          }
          this.toast.error('Login failed.');
        },
      });
  }

  ngOnDestroy(): void {
    this.credentialsStore.clear();
  }
}
