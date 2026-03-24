import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';

export interface PublishEvent {
  track: Track;
  description: string;
}

@Component({
  selector: 'app-my-tracks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2 class="h5 mb-0">My tracks</h2>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-3">
          Publish your tracks so other users can find and subscribe to them.
        </p>

        <div *ngIf="tracks.length === 0" class="text-muted">
          No tracks yet. Create some on the Home page.
        </div>

        <div class="table-responsive" *ngIf="tracks.length > 0">
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
              <tr *ngFor="let track of tracks; trackBy: trackById">
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
                      (click)="onPublish(track)"
                    >Publish</button>
                  </div>
                  <button *ngIf="track.trackShare"
                    class="btn btn-sm btn-outline-danger"
                    [disabled]="busyTrackId === track.id"
                    (click)="unpublish.emit(track)"
                  >Unpublish</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MyTracksComponent {
  @Input() tracks: Track[] = [];
  @Input() busyTrackId: number | null = null;

  @Output() publish = new EventEmitter<PublishEvent>();
  @Output() unpublish = new EventEmitter<Track>();

  private publishDescriptions = new Map<number, string>();

  onPublish(track: Track): void {
    this.publish.emit({
      track,
      description: this.publishDescriptions.get(track.id ?? 0) ?? '',
    });
    this.publishDescriptions.delete(track.id ?? 0);
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