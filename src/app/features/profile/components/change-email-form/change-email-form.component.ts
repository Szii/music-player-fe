import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';

@Component({
  selector: 'app-change-email-form',
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-email-form.component.html',
  styleUrl: './change-email-form.component.scss',
})
export class ChangeEmailFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProfileStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;
  readonly limits = FIELD_LIMITS.user;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    if (!SHOW_EMAIL_INPUTS) {
      this.form.disable();
    }
  }

  emailError(): string {
    const control = this.form.controls.email;
    if (!this.shouldShow(control)) return '';
    if (control.hasError('required')) return 'Email is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!this.shouldShow(control)) return '';
    return 'Current password is required.';
  }

  private shouldShow(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    if (!control.invalid) return false;
    return this.submitted() || (control.touched && control.dirty);
  }

  onSubmit(): void {
    if (!this.showEmailInputs) return;

    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const password = this.form.controls.password.getRawValue();
    const email = this.form.controls.email.getRawValue();

    this.store.changeEmail(password, email)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success('Verification email sent. Click the link to confirm the change.');
          this.form.reset({ email: '', password: '' });
          this.submitted.set(false);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, {
            overrides: {
              403: 'Current password is incorrect.',
              409: 'That email is already registered.',
            },
            fallback: 'Could not change email. Please try again.',
          }));
        },
      });
  }
}
