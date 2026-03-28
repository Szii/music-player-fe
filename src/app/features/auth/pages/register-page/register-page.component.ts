import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { UsersService, UserRegisterRequest } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

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
            <ui-text-input formControlName="name"></ui-text-input>
          </ui-form-field>

          <ui-form-field
            label="Password"
            [error]="form.controls.password.touched && form.controls.password.invalid ? 'Password must be at least 6 characters.' : ''"
          >
            <ui-text-input formControlName="password" type="password"></ui-text-input>
          </ui-form-field>

          <ui-form-actions>
            <normal-button
              type="submit"
              [disabled]="form.invalid || isSubmitting"
              [loading]="isSubmitting"
            >
              {{ isSubmitting ? 'Creating account...' : 'Create account' }}
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
  private fb = inject(FormBuilder);
  private usersApi = inject(UsersService);
  private router = inject(Router);

  isSubmitting = false;

  form = this.fb.group({
    name: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting = true;

    const { name, password } = this.form.getRawValue();

    const body: UserRegisterRequest = {
      name: name!,
      password: password!,
    };

    this.usersApi.registerUser({ userRegisterRequest: body }).subscribe({
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: (err) => {
        console.error(err);
        alert('Registration failed (check console).');
        this.isSubmitting = false;
      },
      complete: () => (this.isSubmitting = false),
    });
  }
}