import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  MusicTracksService,
  ShareService,
  Track,
  PublishTrackRequest,
  SubscribeRequest,
} from '../../../../api/generated';

import { MyTracksComponent, PublishEvent } from '../../components/my-tracks/my-tracks.component';
import { TrackCatalogComponent } from '../../components/track-catalog/track-catalog.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

@Component({
  selector: 'app-workshop-page',
  standalone: true,
  imports: [
    CommonModule,
    MyTracksComponent,
    TrackCatalogComponent,
    UiAlertComponent,
    NormalButtonComponent,
  ],
  template: `
    <div class="app-page workshop-page">
      <div class="workshop-page__header">
        <div>
          <h1 class="workshop-page__title">Workshop</h1>
          <p class="workshop-page__subtitle">Manage publishing and subscriptions for your tracks.</p>
        </div>

        <normal-button type="button" (clicked)="myTracksOpen = true">
          My tracks
        </normal-button>
      </div>

      <ui-alert *ngIf="errorMessage" variant="danger">{{ errorMessage }}</ui-alert>
      <div *ngIf="loading" class="app-muted">Loading...</div>

      <div *ngIf="!loading" class="workshop-page__body">
        <app-track-catalog
          [tracks]="catalogTracks"
          [subscribedIds]="subscribedIds"
          [busyTrackId]="busyTrackId"
          (subscribe)="subscribeFromCatalog($event)"
          (unsubscribe)="unsubscribe($event)"
        />

        <hr class="workshop-page__divider" />

      <app-my-tracks
        *ngIf="myTracksOpen"
        [tracks]="myTracks"
        [busyTrackId]="busyTrackId"
        (publish)="publishTrack($event)"
        (unpublish)="unpublishTrack($event)"
        (close)="myTracksOpen = false"
      />
    </div>
  `,
  styles: [`
    .workshop-page__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 1.5rem;
    }

    .workshop-page__title {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--app-text);
    }

    .workshop-page__subtitle {
      margin: 0.35rem 0 0;
      color: var(--app-text-muted);
      font-size: 0.95rem;
    }

    .workshop-page__body {
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: var(--app-shadow);
    }

    .workshop-page__divider {
      border: none;
      border-top: var(--app-border);
    }

      .workshop-page,
  .workshop-page__body {
    min-height: 0;
  }

    @media (max-width: 720px) {
      .workshop-page__header {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `],
})
export class WorkshopPageComponent implements OnInit {
  private tracksApi = inject(MusicTracksService);
  private shareApi = inject(ShareService);

  loading = false;
  errorMessage = '';
  busyTrackId: number | null = null;

  myTracksOpen = false;

  myTracks: Track[] = [];
  catalogTracks: Track[] = [];
  subscribedTracks: Track[] = [];
  subscribedIds = new Set<number>();

  private myTrackIds = new Set<number>();
  private _allPublished: Track[] = [];

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMessage = '';

    let ownDone = false, pubDone = false, subDone = false;
    const done = () => {
      if (ownDone && pubDone && subDone) {
        this.buildSets();
        this.filterCatalog();
        this.loading = false;
      }
    };

    this.tracksApi.getUserTracks().subscribe({
      next: (tracks) => { this.myTracks = tracks ?? []; },
      error: (err) => {
        console.error(err);
        this.errorMessage = 'Loading tracks failed.';
        ownDone = true;
        done();
      },
      complete: () => {
        ownDone = true;
        done();
      },
    });

    this.tracksApi.getPublishedTracks().subscribe({
      next: (tracks) => { this._allPublished = tracks ?? []; },
      error: (err) => {
        console.error(err);
        pubDone = true;
        done();
      },
      complete: () => {
        pubDone = true;
        done();
      },
    });

    this.tracksApi.getUserSubscribedTracks().subscribe({
      next: (tracks) => { this.subscribedTracks = tracks ?? []; },
      error: (err) => {
        console.error(err);
        subDone = true;
        done();
      },
      complete: () => {
        subDone = true;
        done();
      },
    });
  }

  publishTrack(event: PublishEvent): void {
    if (event.track.id == null) return;
    const trackId = event.track.id;
    this.busyTrackId = trackId;
    const body: PublishTrackRequest = { description: event.description || undefined };

    this.shareApi.publishTrack({ trackId, publishTrackRequest: body }).subscribe({
      next: () => { this.loadAll(); },
      error: (err: any) => {
        console.error(err);
        if (err?.status === 409) {
          alert('Track is already published.');
          this.loadAll();
        } else {
          alert('Publishing failed.');
        }
        this.busyTrackId = null;
      },
      complete: () => { this.busyTrackId = null; },
    });
  }

  unpublishTrack(track: Track): void {
    if (track.id == null) return;
    const trackId = track.id;
    this.busyTrackId = trackId;

    this.shareApi.unpublishTrack({ trackId }).subscribe({
      next: () => { this.loadAll(); },
      error: (err) => {
        console.error(err);
        alert('Unpublishing failed.');
        this.busyTrackId = null;
      },
      complete: () => { this.busyTrackId = null; },
    });
  }

  subscribeFromCatalog(track: Track): void {
    if (!track.trackShare?.shareCode) {
      alert('No share code available.');
      return;
    }

    this.busyTrackId = track.id ?? null;
    const body: SubscribeRequest = { shareCode: track.trackShare.shareCode };

    this.shareApi.subscribeToTrack({ subscribeRequest: body }).subscribe({
      next: () => { this.loadAll(); },
      error: (err: any) => {
        console.error(err);
        if (err?.status === 409 || err?.status === 400) {
          alert('Already subscribed or invalid code.');
          this.loadAll();
        } else {
          alert('Subscribe failed.');
        }
        this.busyTrackId = null;
      },
      complete: () => { this.busyTrackId = null; },
    });
  }

  unsubscribe(track: Track): void {
    if (track.id == null) return;
    if (!confirm(`Unsubscribe from "${track.trackName || track.trackOriginalName || track.id}"?`)) {
      return;
    }

    const trackId = track.id;
    this.busyTrackId = trackId;

    this.shareApi.unsubscribeFromTrack({ trackId }).subscribe({
      next: () => { this.loadAll(); },
      error: (err) => {
        console.error(err);
        alert('Unsubscribing failed.');
        this.busyTrackId = null;
      },
      complete: () => { this.busyTrackId = null; },
    });
  }

  private buildSets(): void {
    this.myTrackIds = new Set(
      this.myTracks.map(t => t.id).filter((id): id is number => id != null)
    );

    this.subscribedIds = new Set(
      this.subscribedTracks.map(t => t.id).filter((id): id is number => id != null)
    );
  }

  private filterCatalog(): void {
    this.catalogTracks = this._allPublished.filter(
      t => t.id != null && !this.myTrackIds.has(t.id)
    );
  }
}