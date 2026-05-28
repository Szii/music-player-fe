import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService, ForgotPasswordRequest } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';

@Component({
  selector: 'app-forgot-password-request-page',
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
      <ui-card title="Forgot password">
        @if (sent()) {
          <p class="forgot-page__text">
            If an account exists for that email, we have sent a password reset link.
            Please check your inbox.
          </p>
          <div class="forgot-page__link">
            <a routerLink="/login">Back to login</a>
          </div>
        } @else {
          <p class="forgot-page__text">
            Enter the email address associated with your account and we will send you
            a link to reset your password.
          </p>

          <form class="app-form-stack" [formGroup]="form" (ngSubmit)="onSubmit()">
            <ui-form-field
              label="Email"
              [error]="emailError()"
            >
              <ui-text-input formControlName="email" type="email" />
            </ui-form-field>

            <ui-form-actions>
              <normal-button
                type="submit"
                [disabled]="form.invalid || isSubmitting()"
                [loading]="isSubmitting()"
              >
                {{ isSubmitting() ? 'Sending...' : 'Send reset link' }}
              </normal-button>
            </ui-form-actions>
          </form>

          <div class="forgot-page__link">
            <a routerLink="/login">Back to login</a>
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: [`
    .forgot-page__text {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    .forgot-page__link {
      margin-top: 1rem;
    }
  `],
})
export class ForgotPasswordRequestPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly sent = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  emailError(): string {
    const control = this.form.controls.email;
    if (!control.invalid) return '';
    if (!(this.submitted() || (control.touched && control.dirty))) return '';
    if (control.hasError('required')) return 'Email is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const body: ForgotPasswordRequest = {
      email: this.form.controls.email.getRawValue(),
    };

    this.usersApi.forgotPassword({ forgotPasswordRequest: body })
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.sent.set(true),
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse) {
            if (err.status === 400) {
              this.toast.error('Invalid email format.');
              return;
            }
            if (err.status === 429) {
              this.toast.error('Too many reset requests. Please wait a moment and try again.');
              return;
            }
          }
          this.toast.error('Could not send password reset email. Please try again.');
        },
      });
  }
}
