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

@Component({
  selector: 'app-change-password-form',
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="app-form-stack" [formGroup]="form" (ngSubmit)="onSubmit()">
      <ui-form-field
        label="Current password"
        [error]="currentError()"
      >
        <ui-text-input formControlName="current" type="password" />
      </ui-form-field>

      <ui-form-field
        label="New password"
        [error]="newError()"
      >
        <ui-text-input formControlName="next" type="password" />
      </ui-form-field>

      <ui-form-actions>
        <normal-button
          type="submit"
          [disabled]="form.invalid || isSubmitting()"
          [loading]="isSubmitting()"
        >
          {{ isSubmitting() ? 'Saving...' : 'Change password' }}
        </normal-button>
      </ui-form-actions>
    </form>
  `,
})
export class ChangePasswordFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProfileStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.minLength(6)]],
  });

  currentError(): string {
    const control = this.form.controls.current;
    if (!this.shouldShow(control)) return '';
    return 'Current password is required.';
  }

  newError(): string {
    const control = this.form.controls.next;
    if (!this.shouldShow(control)) return '';
    return 'New password must be at least 6 characters.';
  }

  private shouldShow(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    if (!control.invalid) return false;
    return this.submitted() || (control.touched && control.dirty);
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const current = this.form.controls.current.getRawValue();
    const next = this.form.controls.next.getRawValue();

    this.store.changePassword(current, next)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success('Password changed.');
          this.form.reset({ current: '', next: '' });
          this.submitted.set(false);
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.toast.error('Current password is incorrect.');
            return;
          }
          this.toast.error('Could not change password. Please try again.');
        },
      });
  }
}
