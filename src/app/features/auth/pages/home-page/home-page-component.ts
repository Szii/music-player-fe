import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';

import { TrackTableComponent } from '../../../tracks/components/track-table/track-table.component';
import { TrackFormComponent, TrackFormEvent } from '../../../../features/tracks/components/track-form/track-form.component';
import {
  TrackWindowsPanelComponent,
  WindowSaveEvent,
  WindowDeleteEvent,
} from '../../../tracks/components/track-window-panel/track-window-panel.component';
import {
  MusicBoardsService,
  MusicTracksService,
  Track,
  TrackRequest,
} from '../../../../api/generated';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    TrackTableComponent,
    TrackFormComponent,
    TrackWindowsPanelComponent,
    UiAlertComponent,
  ],
  template: `
    <div class="app-page home-page">
      <h1 class="app-page__title">Home</h1>

      <app-track-form
        [editingTrackId]="editingTrackId"
        [editTrackName]="editTrackName"
        [editTrackLink]="editTrackLink"
        [submitting]="createSubmitting"
        (save)="saveTrack($event)"
        (cancel)="cancelEdit()"
      ></app-track-form>

      <ui-alert *ngIf="errorMessage" variant="danger">
        {{ errorMessage }}
      </ui-alert>

      <div class="home-page__section">
        <h2 class="home-page__subtitle">My tracks</h2>

        <div class="home-page__table-wrap">
          <app-track-table
            [tracks]="tracks"
            [loading]="loading"
            (edit)="onEdit($event)"
            (remove)="onRemove($event)"
            (windows)="onWindows($event)"
          ></app-track-table>
        </div>
      </div>

      <app-track-windows-panel
        [track]="windowTrack"
        (close)="closeWindows()"
        (saveWindow)="onSaveWindow($event)"
        (deleteWindow)="onDeleteWindow($event)"
      ></app-track-windows-panel>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .home-page {
      --track-table-max-height: calc(100dvh - 360px);
    }

    .home-page__section {
      margin-top: 1.5rem;
    }

    .home-page__subtitle {
      margin: 0 0 1rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--app-text);
    }

    .home-page__table-wrap {
      --track-table-max-height: var(--track-table-max-height);
      min-height: 0;
    }

    @media (max-width: 860px) {
      .home-page {
        --track-table-max-height: calc(100dvh - 280px);
      }
    }
  `],
})
export class HomePageComponent implements OnInit {
  @ViewChild(TrackFormComponent) private trackForm?: TrackFormComponent;

  private tracksApi = inject(MusicTracksService);

  tracks: Track[] = [];
  loading = false;
  createSubmitting = false;
  errorMessage = '';

  editingTrackId: number | null = null;
  editTrackName = '';
  editTrackLink = '';

  windowTrack: Track | null = null;

  ngOnInit(): void {
    this.loadTracks();
  }

loadTracks(): void {
  this.loading = true;
  this.errorMessage = '';

  forkJoin({
    userTracks: this.tracksApi.getUserTracks(),
    subscribedTracks: this.tracksApi.getUserSubscribedTracks()
  }).subscribe({
    next: ({ userTracks, subscribedTracks }) => {
      const own = userTracks ?? [];
      const subscribed = subscribedTracks ?? [];

      this.tracks = [...own, ...subscribed];

      if (this.windowTrack?.id != null) {
        const fresh = this.tracks.find(t => t.id === this.windowTrack!.id);
        this.windowTrack = fresh ?? null;
      }
    },
    error: (err: unknown) => {
      console.error(err);
      this.errorMessage = 'Loading tracks failed.';
      this.loading = false;
    },
    complete: () => {
      this.loading = false;
    }
  });
}

  saveTrack(event: TrackFormEvent): void {
    this.createSubmitting = true;
    const body: TrackRequest = {
      trackName: event.trackName || undefined,
      trackLink: event.trackLink,
    };

    if (this.editingTrackId) {
      this.tracksApi.updateTrack({ trackId: this.editingTrackId, trackRequest: body }).subscribe({
        next: () => { this.cancelEdit(); this.loadTracks(); },
        error: (err: unknown) => { console.error(err); alert('Updating track failed.'); },
        complete: () => { this.createSubmitting = false; },
      });
      return;
    }

    this.tracksApi.createTrack({ trackRequest: body }).subscribe({
      next: () => {
        this.trackForm?.resetForm();
        this.loadTracks();
      },
      error: (err: unknown) => { console.error(err); alert('Creating track failed.'); },
      complete: () => { this.createSubmitting = false; },
    });
  }

  onEdit(track: Track): void {
    if (track.id == null) return;
    this.editingTrackId = track.id;
    this.editTrackName = track.trackName ?? '';
    this.editTrackLink = track.trackLink ?? '';
  }

  cancelEdit(): void {
    this.editingTrackId = null;
    this.editTrackName = '';
    this.editTrackLink = '';
  }

  onRemove(track: Track): void {
    if (!track.id) return;
    if (!confirm(`Delete track "${track.trackName || track.id}"?`)) return;

    this.tracksApi.deleteTrack({ trackId: track.id }).subscribe({
      next: () => {
        this.tracks = this.tracks.filter(t => t.id !== track.id);
        if (this.windowTrack?.id === track.id) this.closeWindows();
      },
      error: (err: unknown) => { console.error(err); alert('Deleting track failed.'); },
    });
  }

  onWindows(track: Track): void {
    this.windowTrack = track;
  }

  closeWindows(): void {
    this.windowTrack = null;
  }

  onSaveWindow(event: WindowSaveEvent): void {
    if (event.windowId != null) {
      this.tracksApi.updateTrackWindow({
        trackId: event.trackId,
        windowId: event.windowId,
        trackWindowRequest: event.body,
      }).subscribe({
        next: (updatedTrack) => this.applyTrackUpdate(event.trackId, updatedTrack),
        error: (err) => { console.error('updateTrackWindow failed', err); alert('Updating window failed.'); },
      });
    } else {
      this.tracksApi.createTrackWindow({
        trackId: event.trackId,
        trackWindowRequest: event.body,
      }).subscribe({
        next: (updatedTrack) => this.applyTrackUpdate(event.trackId, updatedTrack),
        error: (err) => { console.error('createTrackWindow failed', err); alert('Creating window failed.'); },
      });
    }
  }

  onDeleteWindow(event: WindowDeleteEvent): void {
    this.tracksApi.deleteTrackWindow({
      trackId: event.trackId,
      windowId: event.windowId,
    }).subscribe({
      next: (updatedTrack) => this.applyTrackUpdate(event.trackId, updatedTrack),
      error: (err) => { console.error('deleteTrackWindow failed', err); alert('Deleting window failed.'); },
    });
  }

  private applyTrackUpdate(trackId: number, updatedTrack: Track): void {
    this.tracks = this.tracks.map(t => t.id === trackId ? updatedTrack : t);
    if (this.windowTrack?.id === trackId) {
      this.windowTrack = updatedTrack;
    }
  }
}