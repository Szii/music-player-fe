import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { SHOW_EMAIL_INPUTS } from '../../../../core/config/feature-flags';

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
  template: `
    <p class="change-email__hint">
      We will send a verification link to the new address.
      The change becomes active once you click that link.
    </p>

    @if (!showEmailInputs) {
      <p class="change-email__disabled-note">Email changes are currently unavailable.</p>
    }

    <form
      class="app-form-stack"
      [class.change-email__form--disabled]="!showEmailInputs"
      [formGroup]="form"
      (ngSubmit)="onSubmit()"
    >
      <ui-form-field
        label="New email"
        [error]="emailError()"
      >
        <ui-text-input formControlName="email" type="email" />
      </ui-form-field>

      <ui-form-field
        label="Current password"
        [error]="passwordError()"
      >
        <ui-text-input formControlName="password" type="password" />
      </ui-form-field>

      <ui-form-actions>
        <normal-button
          type="submit"
          [disabled]="form.invalid || isSubmitting() || !showEmailInputs"
          [loading]="isSubmitting()"
        >
          {{ isSubmitting() ? 'Sending...' : 'Send verification' }}
        </normal-button>
      </ui-form-actions>
    </form>
  `,
  styles: [`
    .change-email__hint {
      margin: 0 0 1rem;
      line-height: 1.5;
      color: var(--app-text-muted);
    }
    .change-email__disabled-note {
      margin: 0 0 1rem;
      line-height: 1.5;
      color: var(--app-text-muted);
    }
    .change-email__form--disabled {
      opacity: 0.6;
    }
  `],
})
export class ChangeEmailFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProfileStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly showEmailInputs = SHOW_EMAIL_INPUTS;

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
          if (err instanceof HttpErrorResponse) {
            if (err.status === 403) {
              this.toast.error('Current password is incorrect.');
              return;
            }
            if (err.status === 409) {
              this.toast.error('That email is already registered.');
              return;
            }
          }
          this.toast.error('Could not change email. Please try again.');
        },
      });
  }
}
