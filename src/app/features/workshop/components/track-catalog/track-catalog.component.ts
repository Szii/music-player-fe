import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Track } from '../../../../api/generated';

@Component({
  selector: 'app-track-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="card mb-4">
      <div class="card-header bg-info text-white">
        <h2 class="h5 mb-0">Browse shared tracks</h2>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-3">
          Tracks published by other users. Subscribe to use them in your groups and boards (read-only).
        </p>

        <div *ngIf="tracks.length === 0" class="text-muted">
          No shared tracks available right now.
        </div>

        <div class="table-responsive" *ngIf="tracks.length > 0">
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
              <tr *ngFor="let track of tracks; trackBy: trackById">
                <td>{{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}</td>
                <td>{{ track.owner?.name ?? '—' }}</td>
                <td>{{ track.trackShare?.description || '—' }}</td>
                <td>{{ formatDuration(track.duration) }}</td>
                <td>
                  <span *ngIf="isSubscribed(track)" class="badge bg-success me-1">Subscribed</span>
                  <button *ngIf="isSubscribed(track)"
                    class="btn btn-sm btn-outline-danger"
                    [disabled]="busyTrackId === track.id"
                    (click)="unsubscribe.emit(track)"
                  >Unsubscribe</button>
                  <button *ngIf="!isSubscribed(track)"
                    class="btn btn-sm btn-outline-primary"
                    [disabled]="busyTrackId === track.id"
                    (click)="subscribe.emit(track)"
                  >Subscribe</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class TrackCatalogComponent {
  @Input() tracks: Track[] = [];
  @Input() subscribedIds = new Set<number>();
  @Input() busyTrackId: number | null = null;

  @Output() subscribe = new EventEmitter<Track>();
  @Output() unsubscribe = new EventEmitter<Track>();

  isSubscribed(track: Track): boolean {
    return track.id != null && this.subscribedIds.has(track.id);
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
}