import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output,  } from '@angular/core';
import { Track } from '../../../../api/generated';

@Component({
  selector: 'app-track-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-responsive">
      <table class="table table-striped table-bordered align-middle">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Original Name</th>
            <th>Link</th>
            <th>Duration</th>
            <th>Groups</th>
            <th>Windows</th>
            <th>Owner</th>
            <th style="width: 240px;">Actions</th>
          </tr>
        </thead>

        <tbody *ngIf="loading">
          <tr>
            <td colspan="9">Loading tracks...</td>
          </tr>
        </tbody>

        <tbody *ngIf="!loading && tracks.length === 0">
          <tr>
            <td colspan="9">No tracks found.</td>
          </tr>
        </tbody>

        <tbody *ngIf="!loading && tracks.length > 0">
          <tr *ngFor="let track of tracks; trackBy: trackByTrackId">
            <td>{{ track.id ?? '-' }}</td>
            <td>{{ track.trackName || '-' }}</td>
            <td>{{ track.trackOriginalName || '-' }}</td>
            <td>
              <a
                *ngIf="track.trackLink"
                [href]="track.trackLink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
              <span *ngIf="!track.trackLink">-</span>
            </td>
            <td>{{ formatDuration(track.duration) }}</td>
            <td>{{ track.groupIds?.length ?? 0 }}</td>
            <td>{{ track.trackWindows?.length ?? 0 }}</td>
            <td>{{ track.owner?.name ?? '-' }}</td>
            <td>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary me-2"
                (click)="edit.emit(track)"
              >
                Edit
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-secondary me-2"
                (click)="windows.emit(track)"
              >
                Windows
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                (click)="remove.emit(track)"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class TrackTableComponent {
  @Input() tracks: Track[] = [];
  @Input() loading = false;

  @Output() edit = new EventEmitter<Track>();
  @Output() remove = new EventEmitter<Track>();
  @Output() windows = new EventEmitter<Track>();

  trackByTrackId(index: number, track: Track): number | string {
    return track.id ?? index;
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) {
      return '-';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
