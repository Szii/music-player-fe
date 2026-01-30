import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService, AuthResponse } from '../../api/auth-api.service';
import { SessionService } from '../../../../core/auth/session.service';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-login-page',
  standalone: true,
  template: `<div style="padding: 2rem;">Login works</div>`,
})
export class LoginPageComponent {
  private fb = inject(FormBuilder);
  private authApi = inject(AuthApiService);
  private session = inject(SessionService);
  private router = inject(Router);

  isSubmitting = false;

}
