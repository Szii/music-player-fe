import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../../core/auth/session.service';
import { TokenRenewalService } from '../../../../core/auth/token-renewal.service';
import { UiCardComponent } from '../../../../shared/ui/card/ui-card.component';
import { TutorialService } from '../../../tutorial/data-access/tutorial.service';

type CallbackState = 'signing-in' | 'failed';

@Component({
  selector: 'app-auth-callback-page',
  imports: [RouterLink, UiCardComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-callback-page.component.html',
  styleUrl: './auth-callback-page.component.scss',
})
export class AuthCallbackPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly tokenRenewal = inject(TokenRenewalService);
  private readonly tutorial = inject(TutorialService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<CallbackState>('signing-in');

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('error')) {
      this.fail();
      return;
    }

    // The backend set the refresh cookie before redirecting here, so this is the
    // same exchange a page reload performs: cookie in, access token in memory.
    this.tokenRenewal.refreshOnce()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(ok => {
        if (!ok) {
          this.fail();
          return;
        }

        this.tokenRenewal.start();
        void this.router.navigateByUrl('/').then(() => this.tutorial.maybeAutoStart());
      });
  }

  private fail(): void {
    this.session.clear();
    this.state.set('failed');
  }
}
