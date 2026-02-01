import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { SessionService } from '../../../../core/auth/session.service';

// ✅ generated imports (adjust the path if yours differs)
import { UsersService, UserLoginRequest, AuthResponse } from '../../../../api/generated';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="container py-5" style="max-width: 520px;">
      <h1 class="mb-4">Login</h1>

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="mb-3">
          <label class="form-label">Username</label>
          <input class="form-control" formControlName="name" type="text" />
          <div class="text-danger mt-1" *ngIf="form.controls.name.touched && form.controls.name.invalid">
            Username is required.
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label">Password</label>
          <input class="form-control" formControlName="password" type="password" />
          <div class="text-danger mt-1" *ngIf="form.controls.password.touched && form.controls.password.invalid">
            Password is required.
          </div>
        </div>

        <button class="btn btn-primary" [disabled]="form.invalid || isSubmitting">
          {{ isSubmitting ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>

      <div class="mt-3">
        <a routerLink="/register">Need an account? Register</a>
      </div>
    </div>
  `,
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
        if (res.token) this.session.setToken(res.token);
        this.router.navigateByUrl('/');
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

