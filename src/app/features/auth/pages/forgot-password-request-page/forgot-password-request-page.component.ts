import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService, ForgotPasswordRequest } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';

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
  templateUrl: './forgot-password-request-page.component.html',
  styleUrl: './forgot-password-request-page.component.scss',
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
          this.toast.error(httpErrorMessage(err, {
            overrides: { 400: 'Please enter a valid email address.' },
            fallback: 'Could not send password reset email. Please try again.',
          }));
        },
      });
  }
}
