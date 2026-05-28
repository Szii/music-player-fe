import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService, UserChangePasswordWithTokenRequest } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { matchPasswords } from '../../utils/match-passwords.validator';

type FormStatus = 'ready' | 'submitting' | 'invalid-token' | 'error';

@Component({
  selector: 'app-reset-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiCardComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-page app-page--narrow">
      <ui-card title="Reset password">
        @if (!token()) {
          <p class="reset-page__text reset-page__text--error">
            This password reset link is missing a token. Please request a new one.
          </p>
          <div class="reset-page__link">
            <a routerLink="/forgot-password">Request a new reset link</a>
          </div>
        } @else if (success()) {
          <p class="reset-page__text">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <div class="reset-page__link">
            <a routerLink="/login">Go to login</a>
          </div>
        } @else {
          <p class="reset-page__text">
            Choose a new password for your account.
          </p>

          <form class="app-form-stack" [formGroup]="form" (ngSubmit)="onSubmit()">
            <ui-form-field
              label="New password"
              [error]="passwordError()"
            >
              <ui-text-input formControlName="password" type="password" />
            </ui-form-field>

            <ui-form-field
              label="Confirm new password"
              [error]="confirmError()"
            >
              <ui-text-input formControlName="confirm" type="password" />
            </ui-form-field>

            @switch (status()) {
              @case ('invalid-token') {
                <p class="reset-page__text reset-page__text--error">
                  This reset link is invalid or has expired. Please request a new one.
                </p>
              }
              @case ('error') {
                <p class="reset-page__text reset-page__text--error">
                  Could not change your password. Please try again.
                </p>
              }
            }

            <ui-form-actions>
              <normal-button
                type="submit"
                [disabled]="form.invalid || status() === 'submitting'"
                [loading]="status() === 'submitting'"
              >
                {{ status() === 'submitting' ? 'Saving...' : 'Change password' }}
              </normal-button>
            </ui-form-actions>
          </form>

          <div class="reset-page__link">
            <a routerLink="/login">Back to login</a>
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: [`
    .reset-page__text {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    .reset-page__text--error {
      color: var(--color-danger, #b00020);
    }
    .reset-page__link {
      margin-top: 1rem;
    }
  `],
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly token = signal<string | null>(null);
  readonly status = signal<FormStatus>('ready');
  readonly success = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', [Validators.required]],
  }, { validators: [matchPasswords()] });

  ngOnInit(): void {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (!control.invalid) return '';
    if (!(this.submitted() || (control.touched && control.dirty))) return '';
    if (control.hasError('required')) return 'Password is required.';
    if (control.hasError('minlength')) return 'Password must be at least 6 characters.';
    return '';
  }

  confirmError(): string {
    const control = this.form.controls.confirm;
    const showControlError = control.invalid
      && (this.submitted() || (control.touched && control.dirty));
    if (showControlError && control.hasError('required')) return 'Please confirm your password.';

    const showMismatch = this.form.hasError('passwordMismatch')
      && (this.submitted() || (control.touched && control.dirty));
    if (showMismatch) return 'Passwords do not match.';
    return '';
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();

    const token = this.token();
    if (!token) return;
    if (this.form.invalid) return;

    this.status.set('submitting');

    const body: UserChangePasswordWithTokenRequest = {
      token,
      password: this.form.controls.password.getRawValue(),
    };

    this.usersApi.changeUnverifiedPassword({ userChangePasswordWithTokenRequest: body })
      .pipe(
        finalize(() => {
          if (this.status() === 'submitting') this.status.set('ready');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.success.set(true);
          this.status.set('ready');
          this.toast.success('Password changed. You can now sign in.');
          void this.router.navigateByUrl('/login');
        },
        error: (err: unknown) => {
          console.error(err);
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.status.set('invalid-token');
            return;
          }
          this.status.set('error');
        },
      });
  }
}

