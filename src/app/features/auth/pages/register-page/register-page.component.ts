import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    UiCardComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  template: `
    <div class="app-page app-page--narrow">
      <ui-card title="Register">
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <ui-form-field
            label="Username"
            [error]="form.controls.name.touched && form.controls.name.invalid ? 'Username is required.' : ''"
          >
            <ui-text-input formControlName="name" />
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
      </ui-card>
    </div>
  `,
  styles: [`
    .auth-page__link {
      margin-top: 1rem;
    }
  `],
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    const body: UserRegisterRequest = {
      name: this.form.controls.name.getRawValue(),
      password: this.form.controls.password.getRawValue(),
    };

    this.usersApi.registerUser({ userRegisterRequest: body })
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success('Account created.');
          void this.router.navigateByUrl('/login');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Registration failed.');
        },
      });
  }
}