import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  MusicTracksService,
  ShareService,
  Track,
  PublishTrackRequest,
  SubscribeRequest,
} from '../../../../api/generated';

import { MyTracksComponent, PublishEvent } from '../../components/my-tracks/my-tracks.component';
import { TrackCatalogComponent } from '../../components/track-catalog/track-catalog.component';
import { MySubscriptionsComponent } from '../../components/my-subscriptions/my-subscriptions.component';

@Component({
  selector: 'app-workshop-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MyTracksComponent,
    TrackCatalogComponent,
    MySubscriptionsComponent,
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <a routerLink="/" class="btn btn-outline-primary">Home</a>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-4">
        <a routerLink="*/boards" class="btn btn-outline-primary">Boards</a>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-4">
        <a routerLink="/groups" class="btn btn-outline-primary">Groups</a>
      </div>

      <h1 class="mb-4">Workshop</h1>

      <div *ngIf="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
      <div *ngIf="loading">Loading...</div>

      <ng-container *ngIf="!loading">
        <app-my-tracks
          [tracks]="myTracks"
          [busyTrackId]="busyTrackId"
          (publish)="publishTrack($event)"
          (unpublish)="unpublishTrack($event)"
        ></app-my-tracks>

        <app-track-catalog
          [tracks]="catalogTracks"
          [subscribedIds]="subscribedIds"
          [busyTrackId]="busyTrackId"
          (subscribe)="subscribeFromCatalog($event)"
          (unsubscribe)="unsubscribe($event)"
        ></app-track-catalog>

        <app-my-subscriptions
          [tracks]="subscribedTracks"
          [busyTrackId]="busyTrackId"
          (unsubscribe)="unsubscribe($event)"
        ></app-my-subscriptions>
      </ng-container>
    </div>
  `,
})
export class WorkshopPageComponent implements OnInit {
  private tracksApi = inject(MusicTracksService);
  private shareApi = inject(ShareService);

  loading = false;
  errorMessage = '';
  busyTrackId: number | null = null;

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

    let ownDone = false;
    let pubDone = false;
    let subDone = false;
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
        console.error('getUserTracks failed', err);
        this.errorMessage = 'Loading tracks failed.';
        ownDone = true; done();
      },
      complete: () => { ownDone = true; done(); },
    });

    this.tracksApi.getPublishedTracks().subscribe({
      next: (tracks) => { this._allPublished = tracks ?? []; },
      error: (err) => {
        console.error('getPublishedTracks failed', err);
        pubDone = true; done();
      },
      complete: () => { pubDone = true; done(); },
    });

    this.tracksApi.getUserSubscribedTracks().subscribe({
      next: (tracks) => { this.subscribedTracks = tracks ?? []; },
      error: (err) => {
        console.error('getUserSubscribedTracks failed', err);
        subDone = true; done();
      },
      complete: () => { subDone = true; done(); },
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
    this.catalogTracks = this._allPublished.filter(t =>
      t.id != null && !this.myTrackIds.has(t.id)
    );
  }

  publishTrack(event: PublishEvent): void {
    const track = event.track;
    if (track.id == null) return;
    const trackId = track.id;
    this.busyTrackId = trackId;

    const body: PublishTrackRequest = {
      description: event.description || undefined,
    };

    this.shareApi.publishTrack({ trackId, publishTrackRequest: body }).subscribe({
      next: () => { this.loadAll(); },
      error: (err: any) => {
        console.error('publishTrack failed', err);
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
        console.error('unpublishTrack failed', err);
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
        console.error('subscribe failed', err);
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
    const trackId = track.id;

    if (!confirm(`Unsubscribe from "${track.trackName || track.trackOriginalName || track.id}"?`)) return;

    this.busyTrackId = trackId;

    this.shareApi.unsubscribeFromTrack({ trackId }).subscribe({
      next: () => { this.loadAll(); },
      error: (err) => {
        console.error('unsubscribe failed', err);
        alert('Unsubscribing failed.');
        this.busyTrackId = null;
      },
      complete: () => { this.busyTrackId = null; },
    });
  }
}