import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ProfileStore } from '../../data-access/profile-store.service';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  USERNAME_ERROR_PARAMS,
  usernameErrorKey,
  usernameValidators,
} from '../../../auth/utils/username.validator';

@Component({
  selector: 'app-change-username-form',
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-username-form.component.html',
})
export class ChangeUsernameFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProfileStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly nameMaxLength = FIELD_LIMITS.user.name;
  readonly currentName = computed(() => this.store.user()?.name ?? '');

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', usernameValidators],
  });

  nameError(): string {
    const control = this.form.controls.name;
    if (!control.invalid) return '';
    if (!(this.submitted() || (control.touched && control.dirty))) return '';

    const key = usernameErrorKey(control);
    return key ? this.transloco.translate(key, USERNAME_ERROR_PARAMS) : '';
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    this.store.changeUsername(this.form.controls.name.getRawValue())
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: user => {
          this.toast.success(
            this.transloco.translate('profile.usernameForm.success', { name: user.name }),
          );
          this.form.reset({ name: '' });
          this.submitted.set(false);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, {
            overrides: { 409: this.transloco.translate('profile.usernameForm.taken') },
            fallback: this.transloco.translate('profile.usernameForm.failed'),
          }));
        },
      });
  }
}
