import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { ToastService } from '../../../../shared/features/toast/toast.service';
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
  ],
  template: `
    <div class="app-page workshop-page">
      <ui-page-title
        title="Workshop"

      >
        <normal-button type="button" (clicked)="openMyTracks()">
          My tracks
        </normal-button>
      </ui-page-title>

      @if (errorMessage()) {
        <ui-alert variant="danger">{{ errorMessage() }}</ui-alert>
      }

      @if (loading()) {
        <div class="app-muted">Loading...</div>
      } @else {
        <div class="workshop-page__body">
          <app-track-catalog
            [tracks]="catalogTracks()"
            [subscribedIds]="subscribedIds()"
            [busyTrackId]="busyTrackId()"
            (subscribe)="subscribeFromCatalog($event)"
            (unsubscribe)="unsubscribe($event)"
          />

          <hr class="workshop-page__divider" />
        </div>
      }

      @if (myTracksOpen()) {
        <app-my-tracks
          [tracks]="myTracks()"
          [busyTrackId]="busyTrackId()"
          (publish)="publishTrack($event)"
          (unpublish)="unpublishTrack($event)"
          (close)="closeMyTracks()"
        />
      }
    </div>
  `,
  styles: [`

    .workshop-page__divider {
      border: none;
      border-top: var(--app-border);
    }

    .workshop-page,
    .workshop-page__body {
      min-height: 0;
    }

  `],
})
export class WorkshopPageComponent implements OnInit {
  private readonly tracksApi = inject(MusicTracksService);
  private readonly shareApi = inject(ShareService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
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

  loadAll(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      ownTracks: this.tracksApi.getUserTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading your tracks failed.');
          return of([] as Track[]);
        }),
      ),
      publishedTracks: this.tracksApi.getPublishedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading published tracks failed.');
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading subscribed tracks failed.');
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
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError('Loading workshop data failed.');
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
          this.toast.success('Track published.');
          this.loadAll();
        },
        error: (err: any) => {
          console.error(err);

          if (err?.status === 409) {
            this.toast.warning('Track is already published.');
            this.loadAll();
            return;
          }

          this.toast.error('Publishing failed.');
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
          this.toast.success('Track unpublished.');
          this.loadAll();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Unpublishing failed.');
        },
      });
  }

  subscribeFromCatalog(track: Track): void {
    const shareCode = track.trackShare?.shareCode;
    if (!shareCode) {
      this.toast.error('No share code available.');
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
          this.toast.success('Subscribed to track.');
          this.loadAll();
        },
        error: (err: any) => {
          console.error(err);

          if (err?.status === 409 || err?.status === 400) {
            this.toast.warning('Already subscribed or invalid code.');
            this.loadAll();
            return;
          }

          this.toast.error('Subscribe failed.');
        },
      });
  }

  async unsubscribe(track: Track): Promise<void> {
    if (track.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Unsubscribe from track',
      message: `Unsubscribe from "${track.trackName || track.trackOriginalName || track.id}"?`,
      confirmText: 'Unsubscribe',
      cancelText: 'Cancel',
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
          this.toast.success('Unsubscribed from track.');
          this.loadAll();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Unsubscribing failed.');
        },
      });
  }

  private appendError(message: string): void {
    this.errorMessage.update(current =>
      current ? (current.includes(message) ? current : `${current} ${message}`) : message,
    );
  }
}