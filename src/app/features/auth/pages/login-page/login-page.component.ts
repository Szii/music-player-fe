import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../../../core/auth/session.service';
import { UsersService, UserLoginRequest, AuthResponse } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

@Component({
  selector: 'app-login-page',
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
      <ui-card title="Login">
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <ui-form-field
            label="Username"
            [error]="form.controls.name.touched && form.controls.name.invalid ? 'Username is required.' : ''"
          >
            <ui-text-input formControlName="name"></ui-text-input>
          </ui-form-field>

          <ui-form-field
            label="Password"
            [error]="form.controls.password.touched && form.controls.password.invalid ? 'Password is required.' : ''"
          >
            <ui-text-input formControlName="password" type="password"></ui-text-input>
          </ui-form-field>

          <ui-form-actions>
            <normal-button
              type="submit"
              [disabled]="form.invalid || isSubmitting"
              [loading]="isSubmitting"
            >
              {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
            </normal-button>
          </ui-form-actions>
        </form>

        <div class="auth-page__link">
          <a routerLink="/register">Need an account? Register</a>
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
export class LoginPageComponent {
  private fb = inject(FormBuilder);
  private usersApi = inject(UsersService);
  private session = inject(SessionService);
  private router = inject(Router);

  isSubmitting = false;

  form = this.fb.group({
    name: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting = true;

    const { name, password } = this.form.getRawValue();

    const body: UserLoginRequest = {
      name: name!,
      password: password!,
    };

    this.usersApi.loginUser({ userLoginRequest: body }).subscribe({
      next: (res: AuthResponse) => {
        if (res.token) {
          this.session.setToken(res.token);
        }
        void this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        console.error(err);
        alert('Login failed (check console).');
        this.isSubmitting = false;
      },
      complete: () => (this.isSubmitting = false),
    });
  }
}