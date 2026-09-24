import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { Track } from '../../../../api/generated';

import {
  MyTracksComponent,
  PublishEvent,
} from '../../components/my-tracks/my-tracks.component';
import { TrackCatalogComponent } from '../../components/track-catalog/track-catalog.component';
import { TracksStore } from '../../../../core/services/tracks-store.service';
import { SessionsStore } from '../../../../core/services/sessions-store.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-workshop-page',
  imports: [
    MyTracksComponent,
    TrackCatalogComponent,
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

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  private readonly tracksStore = inject(TracksStore);
  private readonly sessionsStore = inject(SessionsStore);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly hasLoaded = signal(false);
  readonly busyTrackId = signal<string | null>(null);
  readonly myTracksOpen = signal(false);

  readonly myTracks = this.tracksStore.ownTracks;

  /**
   * The public catalog is deliberately outside the store's cached library: other
   * users publish and unpublish these entries and nothing notifies us, so it is
   * re-fetched every time this page opens.
   */
  private readonly publishedTracks = signal<Track[]>([]);
  private readonly catalogFailed = signal(false);

  readonly errorMessage = computed(() => {
    const messages: string[] = [];

    if (this.tracksStore.ownFailed()) messages.push(this.t('tracks.err.loadOwn'));
    if (this.catalogFailed()) messages.push(this.t('workshop.err.loadPublished'));
    if (this.tracksStore.subscribedFailed()) messages.push(this.t('tracks.err.loadSubscribed'));

    return messages.join(' ');
  });

  readonly subscribedIds = computed(() => idsOf(this.tracksStore.subscribedTracks()));

  private readonly myTrackIds = computed(() => idsOf(this.myTracks()));

  readonly catalogTracks = computed(() =>
    this.publishedTracks().filter(
      track => track.id != null && !this.myTrackIds().has(track.id),
    ),
  );

  ngOnInit(): void {
    this.loadAll();
  }

  openMyTracks(): void {
    this.myTracksOpen.set(true);
  }

  closeMyTracks(): void {
    this.myTracksOpen.set(false);
  }

  goToAddTrack(): void {
    this.closeMyTracks();
    this.router.navigate(['/tracks']);
  }

  /**
   * Full resync: the library plus the catalog. Used on open, and as the recovery
   * path when the server rejects a share action because the catalog we were
   * showing had gone stale.
   */
  private loadAll(): void {
    forkJoin({
      library: this.tracksStore.refresh(),
      catalog: this.loadCatalog(),
    })
      .pipe(
        finalize(() => this.hasLoaded.set(true)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private loadCatalog(): Observable<Track[]> {
    return this.tracksStore.loadPublished().pipe(
      tap(tracks => {
        this.publishedTracks.set(tracks ?? []);
        this.catalogFailed.set(false);
      }),
      catchError((err: unknown) => {
        console.error('Loading the published catalog failed', err);
        this.catalogFailed.set(true);
        return of([] as Track[]);
      }),
    );
  }

  publishTrack(event: PublishEvent): void {
    if (event.track.id == null) return;

    const trackId = event.track.id;
    this.busyTrackId.set(trackId);

    this.tracksStore.publish(trackId, event.description || undefined)
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.toast.success(this.t('workshop.msg.published')),
        error: (err: unknown) => {
          console.error(err);

          if (statusOf(err) === 409) {
            this.toast.warning(this.t('workshop.msg.alreadyPublished'));
            this.loadAll();
            return;
          }

          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.publish') }));
        },
      });
  }

  unpublishTrack(track: Track): void {
    if (track.id == null) return;

    const trackId = track.id;
    this.busyTrackId.set(trackId);

    this.tracksStore.unpublish(trackId)
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.toast.success(this.t('workshop.msg.unpublished')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.unpublish') }));
        },
      });
  }

  subscribeFromCatalog(track: Track): void {
    const shareCode = track.trackShare?.shareCode;

    if (!shareCode) {
      this.toast.error(this.t('workshop.err.noShareCode'));
      return;
    }

    this.busyTrackId.set(track.id ?? null);

    const sessionId = this.sessionsStore.selectedSessionId();

    this.tracksStore.subscribe(shareCode, sessionId)
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (sessionId != null && track.id != null) {
            this.sessionsStore.noteAdded(sessionId, { trackId: track.id });
          }
          this.toast.success(this.t('workshop.msg.subscribed'));
        },
        error: (err: unknown) => {
          console.error(err);

          const status = statusOf(err);

          // The catalog we rendered had gone stale — the share is already taken,
          // or no longer exists. Resync rather than keep showing a track the
          // server disagrees about.
          if (status === 409 || status === 400) {
            this.toast.warning(this.t('workshop.msg.alreadySubscribed'));
            this.loadAll();
            return;
          }

          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.subscribe') }));
        },
      });
  }

  async unsubscribe(track: Track): Promise<void> {
    if (track.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.unsubscribeTitle'),
      message: this.t('workshop.unsubscribeConfirm', {
        name: track.trackName || track.trackOriginalName || track.id,
      }),
      confirmText: this.t('workshop.unsubscribe'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    const trackId = track.id;
    this.busyTrackId.set(trackId);

    this.tracksStore.unsubscribe(trackId)
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.toast.success(this.t('workshop.msg.unsubscribed')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.unsubscribe') }));
        },
      });
  }
}

function idsOf(tracks: readonly Track[]): ReadonlySet<string> {
  return new Set(
    tracks
      .map(track => track.id)
      .filter((id): id is string => id != null),
  );
}

function statusOf(err: unknown): number | null {
  return err instanceof HttpErrorResponse ? err.status : null;
}
