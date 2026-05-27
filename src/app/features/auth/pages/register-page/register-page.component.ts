import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService, UserRegisterRequest } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-page app-page--narrow">
      <ui-card title="Register">
        @if (submittedEmail(); as email) {
          <p class="auth-page__notice">
            We sent a verification link to <strong>{{ email }}</strong>. Click the link
            in the email to activate your account, then sign in.
          </p>

          <div class="auth-page__link">
            <a routerLink="/login">Back to login</a>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <ui-form-field
              label="Username"
              [error]="form.controls.name.touched && form.controls.name.invalid ? 'Username is required.' : ''"
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
              [error]="form.controls.password.touched && form.controls.password.invalid ? 'Password must be at least 6 characters.' : ''"
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
    .auth-page__notice {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
  `],
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly submittedEmail = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  emailError(): string {
    const control = this.form.controls.email;
    if (!control.touched || control.valid) return '';
    if (control.hasError('required')) return 'Email is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  onSubmit(): void {
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
          this.toast.success('Account created. Check your email to verify.');
          this.submittedEmail.set(body.email);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Registration failed.');
        },
      });
  }
}
