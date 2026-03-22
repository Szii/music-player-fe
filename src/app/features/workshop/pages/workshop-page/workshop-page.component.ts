import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  MusicTracksService,
  ShareService,
  Track,
  PublishTrackRequest,
  SubscribeRequest,
} from '../../../../api/generated';

@Component({
  selector: 'app-workshop-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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

      <div class="card mb-4" *ngIf="!loading">
        <div class="card-header bg-primary text-white">
          <h2 class="h5 mb-0">My tracks</h2>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">
            Publish your tracks so other users can find and subscribe to them.
          </p>

          <div *ngIf="myTracks.length === 0" class="text-muted">
            No tracks yet. Create some on the Home page.
          </div>

          <div class="table-responsive" *ngIf="myTracks.length > 0">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Duration</th>
                  <th style="width: 120px;">Status</th>
                  <th style="width: 320px;">Share code</th>
                  <th style="width: 220px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let track of myTracks; trackBy: trackById">
                  <td>{{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}</td>
                  <td>{{ formatDuration(track.duration) }}</td>
                  <td>
                    <span class="badge" [ngClass]="track.trackShare ? 'bg-success' : 'bg-secondary'">
                      {{ track.trackShare ? 'Published' : 'Not published' }}
                    </span>
                  </td>
                  <td>
                    <div *ngIf="track.trackShare?.shareCode" class="d-flex gap-1 align-items-center">
                      <code class="small flex-grow-1 text-break">{{ track.trackShare!.shareCode }}</code>
                      <button class="btn btn-outline-secondary btn-sm"
                        (click)="copyToClipboard(track.trackShare!.shareCode!)">Copy</button>
                    </div>
                    <span *ngIf="!track.trackShare?.shareCode" class="text-muted small">—</span>
                  </td>
                  <td>
                    <div *ngIf="!track.trackShare" class="d-flex gap-1">
                      <input
                        class="form-control form-control-sm"
                        type="text"
                        placeholder="Description..."
                        [value]="getPublishDesc(track)"
                        (input)="setPublishDesc(track, $any($event.target).value)"
                        style="max-width: 140px;"
                      />
                      <button
                        class="btn btn-sm btn-outline-success"
                        [disabled]="busyTrackId === track.id"
                        (click)="publishTrack(track)"
                      >Publish</button>
                    </div>
                    <button *ngIf="track.trackShare"
                      class="btn btn-sm btn-outline-danger"
                      [disabled]="busyTrackId === track.id"
                      (click)="unpublishTrack(track)"
                    >Unpublish</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card mb-4" *ngIf="!loading">
        <div class="card-header bg-info text-white">
          <h2 class="h5 mb-0">Browse shared tracks</h2>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">
            Tracks published by other users. Subscribe to use them in your groups and boards (read-only).
          </p>

          <div *ngIf="catalogTracks.length === 0" class="text-muted">
            No shared tracks available right now.
          </div>

          <div class="table-responsive" *ngIf="catalogTracks.length > 0">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Owner</th>
                  <th>Description</th>
                  <th>Duration</th>
                  <th style="width: 150px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let track of catalogTracks; trackBy: trackById">
                  <td>{{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}</td>
                  <td>{{ track.owner?.name ?? '—' }}</td>
                  <td>{{ track.trackShare?.description || '—' }}</td>
                  <td>{{ formatDuration(track.duration) }}</td>
                  <td>
                    <span *ngIf="isSubscribed(track)" class="badge bg-success me-1">Subscribed</span>
                    <button *ngIf="isSubscribed(track)"
                      class="btn btn-sm btn-outline-danger"
                      [disabled]="busyTrackId === track.id"
                      (click)="unsubscribe(track)"
                    >Unsubscribe</button>
                    <button *ngIf="!isSubscribed(track)"
                      class="btn btn-sm btn-outline-primary"
                      [disabled]="busyTrackId === track.id"
                      (click)="subscribeFromCatalog(track)"
                    >Subscribe</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card mb-4" *ngIf="!loading">
        <div class="card-header bg-success text-white">
          <h2 class="h5 mb-0">My subscriptions</h2>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">
            Tracks you've subscribed to. Use them in your groups and boards (read-only).
          </p>

          <div *ngIf="subscribedTracks.length === 0" class="text-muted">
            No subscriptions yet. Browse shared tracks above.
          </div>

          <div class="table-responsive" *ngIf="subscribedTracks.length > 0">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Duration</th>
                  <th>Owner</th>
                  <th style="width: 140px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let track of subscribedTracks; trackBy: trackById">
                  <td>{{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}</td>
                  <td>{{ formatDuration(track.duration) }}</td>
                  <td>{{ track.owner?.name ?? '—' }}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-danger"
                      [disabled]="busyTrackId === track.id"
                      (click)="unsubscribe(track)">
                      Unsubscribe
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
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

  private publishDescriptions = new Map<number, string>();

  private subscribedIds = new Set<number>();
  private myTrackIds = new Set<number>();

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

  private _allPublished: Track[] = [];

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

  isSubscribed(track: Track): boolean {
    return track.id != null && this.subscribedIds.has(track.id);
  }

  publishTrack(track: Track): void {
    if (track.id == null) return;
    const trackId = track.id;
    this.busyTrackId = trackId;

    const body: PublishTrackRequest = {
      description: this.publishDescriptions.get(trackId) || undefined,
    };

    this.shareApi.publishTrack({ trackId, publishTrackRequest: body }).subscribe({
      next: () => {
        this.publishDescriptions.delete(trackId);
        this.loadAll();
      },
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

  getPublishDesc(track: Track): string {
    return this.publishDescriptions.get(track.id ?? 0) ?? '';
  }

  setPublishDesc(track: Track, value: string): void {
    if (track.id != null) this.publishDescriptions.set(track.id, value);
  }

  trackById(_i: number, track: Track): number {
    return track.id ?? 0;
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {}, () => alert('Copy failed.'));
  }
}