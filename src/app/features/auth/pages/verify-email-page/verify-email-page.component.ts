import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UsersService } from '../../../../api/generated';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { httpErrorMessage } from '../../../../shared/utils/http-error';

type VerifyState =
  | { status: 'pending' }
  | { status: 'verifying' }
  | { status: 'success' }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink, UiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email-page.component.html',
  styleUrl: './verify-email-page.component.scss',
})
export class VerifyEmailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersApi = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<VerifyState>({ status: 'pending' });

  errorMessage(): string {
    const current = this.state();
    return current.status === 'error' ? current.message : '';
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set({ status: 'error', message: 'Missing verification token.' });
      return;
    }

    this.state.set({ status: 'verifying' });

    this.usersApi.verifyUserToken({ verificationToken: token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set({ status: 'success' }),
        error: (err: unknown) => {
          console.error(err);
          this.state.set({ status: 'error', message: this.mapError(err) });
        },
      });
  }

  private mapError(err: unknown): string {
    return httpErrorMessage(err, {
      overrides: {
        403: 'This verification link is invalid or has expired. Please request a new one.',
      },
      fallback: 'Verification failed. Please try again.',
    });
  }
}
