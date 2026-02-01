import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { SessionService } from '../../../../core/auth/session.service';

// ✅ use generated types + service (adjust import path/name based on your generated files)
import { UsersService, UserRegisterRequest, AuthResponse } from '../../../../api/generated';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="container py-5" style="max-width: 520px;">
      <h1 class="mb-4">Register</h1>

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
            Password must be at least 6 characters.
          </div>
        </div>

        <button class="btn btn-primary" [disabled]="form.invalid || isSubmitting">
          {{ isSubmitting ? 'Creating account...' : 'Create account' }}
        </button>
      </form>

      <div class="mt-3">
        <a routerLink="/login">Already have an account? Login</a>
      </div>
    </div>
  `,
})
export class RegisterPageComponent {
  private fb = inject(FormBuilder);
  private usersApi = inject(UsersService);   
  private session = inject(SessionService);
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
    next: (res) => {
      if (res.token) this.session.setToken(res.token);
      this.router.navigateByUrl('/');
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

