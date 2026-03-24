import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Track } from '../../../../api/generated';

@Component({
  selector: 'app-my-subscriptions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="card mb-4">
      <div class="card-header bg-success text-white">
        <h2 class="h5 mb-0">My subscriptions</h2>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-3">
          Tracks you've subscribed to. Use them in your groups and boards (read-only).
        </p>

        <div *ngIf="tracks.length === 0" class="text-muted">
          No subscriptions yet. Browse shared tracks above.
        </div>

        <div class="table-responsive" *ngIf="tracks.length > 0">
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
              <tr *ngFor="let track of tracks; trackBy: trackById">
                <td>{{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}</td>
                <td>{{ formatDuration(track.duration) }}</td>
                <td>{{ track.owner?.name ?? '—' }}</td>
                <td>
                  <button class="btn btn-sm btn-outline-danger"
                    [disabled]="busyTrackId === track.id"
                    (click)="unsubscribe.emit(track)">
                    Unsubscribe
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MySubscriptionsComponent {
  @Input() tracks: Track[] = [];
  @Input() busyTrackId: number | null = null;

  @Output() unsubscribe = new EventEmitter<Track>();

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