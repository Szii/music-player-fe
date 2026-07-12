import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import {
  MusicTracksService,
  ShareService,
  Track,
  PublishTrackRequest,
  SubscribeRequest,
} from '../../../../api/generated';

import {
  MyTracksComponent,
  PublishEvent,
} from '../../components/my-tracks/my-tracks.component';
import { TrackCatalogComponent } from '../../components/track-catalog/track-catalog.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-workshop-page',
  standalone: true,
  imports: [
    MyTracksComponent,
    TrackCatalogComponent,
    UiAlertComponent,
    NormalButtonComponent,
    UiPageTitleComponent,
    FooterComponent,
    TranslocoPipe,
  ],
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

  private readonly tracksApi = inject(MusicTracksService);
  private readonly shareApi = inject(ShareService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly hasLoaded = signal(false);
  readonly errorMessage = signal('');
  readonly busyTrackId = signal<number | null>(null);
  readonly myTracksOpen = signal(false);

  readonly myTracks = signal<Track[]>([]);
  readonly publishedTracks = signal<Track[]>([]);
  readonly subscribedTracks = signal<Track[]>([]);

  readonly myTrackIds = computed(() =>
    new Set(
      this.myTracks()
        .map(track => track.id)
        .filter((id): id is number => id != null),
    ),
  );

  readonly subscribedIds = computed(() =>
    new Set(
      this.subscribedTracks()
        .map(track => track.id)
        .filter((id): id is number => id != null),
    ),
  );

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

  loadAll(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      ownTracks: this.tracksApi.getUserTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('tracks.err.loadOwn') }));
          return of([] as Track[]);
        }),
      ),
      publishedTracks: this.tracksApi.getPublishedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('workshop.err.loadPublished') }));
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('tracks.err.loadSubscribed') }));
          return of([] as Track[]);
        }),
      ),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ ownTracks, publishedTracks, subscribedTracks }) => {
          this.myTracks.set(ownTracks ?? []);
          this.publishedTracks.set(publishedTracks ?? []);
          this.subscribedTracks.set(subscribedTracks ?? []);
          this.hasLoaded.set(true);
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('workshop.err.loadData') }));
        },
      });
  }

  publishTrack(event: PublishEvent): void {
    if (event.track.id == null) return;

    const trackId = event.track.id;
    const body: PublishTrackRequest = {
      description: event.description || undefined,
    };

    this.busyTrackId.set(trackId);

    this.shareApi.publishTrack({ trackId, publishTrackRequest: body })
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(this.t('workshop.msg.published'));
          this.loadAll();
        },
        error: (err: any) => {
          console.error(err);

          if (err?.status === 409) {
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

    this.shareApi.unpublishTrack({ trackId })
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(this.t('workshop.msg.unpublished'));
          this.loadAll();
        },
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

    const body: SubscribeRequest = { shareCode };

    this.shareApi.subscribeToTrack({ subscribeRequest: body })
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(this.t('workshop.msg.subscribed'));
          this.loadAll();
        },
        error: (err: any) => {
          console.error(err);

          if (err?.status === 409 || err?.status === 400) {
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

    this.shareApi.unsubscribeFromTrack({ trackId })
      .pipe(
        finalize(() => this.busyTrackId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(this.t('workshop.msg.unsubscribed'));
          this.loadAll();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('workshop.err.unsubscribe') }));
        },
      });
  }

  private appendError(message: string): void {
    this.errorMessage.update(current =>
      current ? (current.includes(message) ? current : `${current} ${message}`) : message,
    );
  }
}