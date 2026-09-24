import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { SessionResponse, SessionShareResponse } from '../../../../api/generated';
import {
  MySessionsComponent,
  SessionDescriptionEvent,
} from '../../components/my-sessions/my-sessions.component';
import { SessionCatalogComponent } from '../../components/session-catalog/session-catalog.component';
import { MySubscriptionsComponent } from '../../components/my-subscriptions/my-subscriptions.component';
import { SessionsStore } from '../../../../core/services/sessions-store.service';
import { SessionActionsService } from '../../../../core/services/session-actions.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';

@Component({
  selector: 'app-workshop-page',
  imports: [
    MySessionsComponent,
    MySubscriptionsComponent,
    SessionCatalogComponent,
    UiAlertComponent,
    NormalButtonComponent,
    UiPageTitleComponent,
    FooterComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workshop-page.component.html',
  styleUrl: './workshop-page.component.scss',
})
export class WorkshopPageComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  private readonly sessionsStore = inject(SessionsStore);
  private readonly sessionActions = inject(SessionActionsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly hasLoaded = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly mySessionsOpen = signal(false);
  readonly mySubscriptionsOpen = signal(false);

  readonly ownSessions = this.sessionsStore.ownSessions;
  readonly subscribedSessions = computed(() => this.sessionsStore.sessions().filter(s => s.readOnly));

  private readonly allShares = signal<SessionShareResponse[]>([]);

  readonly shares = computed(() => {
    const subscribedShareIds = new Set(this.subscribedSessions().map(s => s.subscription?.shareId));
    return this.allShares().filter(share => !share.owned && !subscribedShareIds.has(share.id));
  });
  private readonly catalogFailed = signal(false);

  readonly errorMessage = computed(() =>
    this.catalogFailed() ? this.t('workshop.err.loadPublished') : '',
  );

  private subscriptionKey = '';

  constructor() {
    effect(() => {
      const key = this.subscribedSessions()
        .map(session => session.subscription?.shareId ?? '')
        .sort()
        .join(',');
      const loaded = this.hasLoaded();
      if (key === this.subscriptionKey) return;
      this.subscriptionKey = key;
      if (!loaded) return;
      untracked(() => this.loadCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe());
    });
  }

  ngOnInit(): void {
    this.loadAll();
  }

  openMySessions(): void {
    this.mySessionsOpen.set(true);
  }

  closeMySessions(): void {
    this.mySessionsOpen.set(false);
  }

  openMySubscriptions(): void {
    this.mySubscriptionsOpen.set(true);
  }

  closeMySubscriptions(): void {
    this.mySubscriptionsOpen.set(false);
  }

  subscribe(share: SessionShareResponse): void {
    if (!share.shareCode) return;

    this.busyId.set(share.id ?? null);
    this.sessionsStore.subscribe(share.shareCode)
      .pipe(
        finalize(() => this.busyId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: session => {
          this.toast.success(this.t('workshop.msg.subscribed', { name: session.sessionName ?? '' }), 6000, {
            label: this.t('workshop.goToStages'),
            run: () => void this.router.navigate(['/boards']),
          });
        },
        error: (err: unknown) => {
          console.error(err);
          const status = statusOf(err);
          if (status === 404 || status === 409) {
            this.toast.warning(this.t('workshop.msg.catalogStale'));
            this.loadAll();
            return;
          }
          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.subscribe') }));
        },
      });
  }

  unsubscribe(session: SessionResponse): void {
    void this.sessionActions.delete(session);
  }

  update(session: SessionResponse): void {
    this.sessionActions.update(session);
  }

  publish(event: SessionDescriptionEvent): void {
    this.runOwnerAction(
      event.session,
      id => this.sessionsStore.publish(id, event.description || undefined),
      'workshop.msg.published',
      'workshop.err.publish',
    );
  }

  publishUpdate(session: SessionResponse): void {
    this.runOwnerAction(
      session,
      id => this.sessionsStore.publishUpdate(id),
      'workshop.msg.updatePublished',
      'workshop.err.publish',
    );
  }

  editDescription(event: SessionDescriptionEvent): void {
    this.runOwnerAction(
      event.session,
      id => this.sessionsStore.updateShareDescription(id, event.description || undefined),
      'workshop.msg.descriptionSaved',
      'workshop.err.description',
    );
  }

  unpublish(session: SessionResponse): void {
    this.runOwnerAction(
      session,
      id => this.sessionsStore.unpublish(id),
      'workshop.msg.unpublished',
      'workshop.err.unpublish',
    );
  }

  private runOwnerAction(
    session: SessionResponse,
    action: (sessionId: string) => Observable<SessionResponse>,
    successKey: string,
    errorKey: string,
  ): void {
    const sessionId = session.sessionId;
    if (sessionId == null) return;

    this.busyId.set(sessionId);
    action(sessionId)
      .pipe(
        finalize(() => this.busyId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(this.t(successKey));
          this.loadCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        },
        error: (err: unknown) => {
          console.error(err);
          if (statusOf(err) === 409 || statusOf(err) === 404) {
            this.toast.warning(this.t('workshop.msg.catalogStale'));
            this.loadAll();
            return;
          }
          this.toast.error(httpErrorMessage(err, { fallback: this.t(errorKey) }));
        },
      });
  }

  private loadAll(): void {
    forkJoin({
      sessions: this.sessionsStore.refresh(),
      catalog: this.loadCatalog(),
    })
      .pipe(
        finalize(() => this.hasLoaded.set(true)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private loadCatalog(): Observable<SessionShareResponse[]> {
    return this.sessionsStore.loadPublished().pipe(
      tap(shares => {
        this.allShares.set(shares);
        this.catalogFailed.set(false);
      }),
      catchError((err: unknown) => {
        console.error('Loading the published catalog failed', err);
        this.catalogFailed.set(true);
        return of([] as SessionShareResponse[]);
      }),
    );
  }
}

function statusOf(err: unknown): number | null {
  return err instanceof HttpErrorResponse ? err.status : null;
}
