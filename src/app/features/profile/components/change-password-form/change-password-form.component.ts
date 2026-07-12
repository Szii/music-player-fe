import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../../core/auth/session.service';
import { ProfileStore } from '../../data-access/profile-store.service';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';

@Component({
  selector: 'app-change-password-form',
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password-form.component.html',
})
export class ChangePasswordFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProfileStore);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly passwordMaxLength = FIELD_LIMITS.user.password;
  readonly username = computed(() => this.store.user()?.name ?? '');

  readonly form = this.fb.nonNullable.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.minLength(6)]],
  });

  currentError(): string {
    const control = this.form.controls.current;
    if (!this.shouldShow(control)) return '';
    return this.transloco.translate('profile.passwordForm.currentRequired');
  }

  newError(): string {
    const control = this.form.controls.next;
    if (!this.shouldShow(control)) return '';
    return this.transloco.translate('profile.passwordForm.newMinLength');
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
          this.toast.success(this.transloco.translate('profile.passwordForm.success'));
          this.session.logout();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, {
            overrides: { 403: this.transloco.translate('profile.passwordForm.incorrect') },
            fallback: this.transloco.translate('profile.passwordForm.failed'),
          }));
        },
      });
  }
}
