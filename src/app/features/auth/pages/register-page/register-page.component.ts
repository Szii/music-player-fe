import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService, UserRegisterRequest } from '../../../../api/generated';
import { AuthCredentialsStore } from '../../../../core/auth/auth-credentials.store';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { VerificationRequiredComponent } from '../../components/verification-required/verification-required.component';

@Component({
  selector: 'app-register-page',
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
      <ui-card title="Register">
        @if (registered()) {
          <app-verification-required (cancel)="onGoToLogin()" />
        } @else {
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <ui-form-field
              label="Username"
              [error]="nameError()"
            >
              <ui-text-input formControlName="name" />
            </ui-form-field>

            <ui-form-field
              label="Email"
              [error]="emailError()"
            >
              <ui-text-input formControlName="email" type="email" />
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
                {{ isSubmitting() ? 'Creating account...' : 'Create account' }}
              </normal-button>
            </ui-form-actions>
          </form>

          <div class="auth-page__link">
            <a routerLink="/login">Already have an account? Login</a>
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: [`
    .auth-page__link {
      margin-top: 1rem;
    }
  `],
})
export class RegisterPageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly credentialsStore = inject(AuthCredentialsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly registered = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  nameError(): string {
    const control = this.form.controls.name;
    if (!this.shouldShowError(control)) return '';
    return 'Username is required.';
  }

  emailError(): string {
    const control = this.form.controls.email;
    if (!this.shouldShowError(control)) return '';
    if (control.hasError('required')) return 'Email is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!this.shouldShowError(control)) return '';
    return 'Password must be at least 6 characters.';
  }

  private shouldShowError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    if (!control.invalid) return false;
    return this.submitted() || (control.touched && control.dirty);
  }

  onGoToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  onSubmit(): void {
    this.submitted.set(true);
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
            name: body.name,
            password: body.password,
            email: body.email,
          });
          this.toast.success('Account created. Check your email to verify.');
          this.registered.set(true);
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse && err.status === 409) {
            this.toast.error('Username or email already exists.');
          } else {
            this.toast.error('Registration failed.');
          }
        },
      });
  }

  ngOnDestroy(): void {
    this.credentialsStore.clear();
  }
}
