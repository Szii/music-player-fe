import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { SessionService } from '../../../../core/auth/session.service';
import { TrackTableComponent } from '../../../tracks/components/track-table/track-table.component';
import { TrackFormComponent, TrackFormEvent } from '../../../tracks/components/track-form/track-form-component';
import { TrackWindowsPanelComponent, WindowSaveEvent, WindowDeleteEvent } from '../../../tracks/components/traack-window-panel/track-window-panel.component';
import {
  MusicTracksService,
  Track,
  TrackRequest,
} from '../../../../api/generated';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TrackTableComponent, TrackFormComponent, TrackWindowsPanelComponent],
  template: `
    <div class="container py-5">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <div class="d-flex gap-2 mb-2">
            <a routerLink="/boards" class="btn btn-outline-primary">Boards</a>
          </div>
          <div class="d-flex gap-2 mb-2">
            <a routerLink="/groups" class="btn btn-outline-primary">Groups</a>
          </div>
          <div class="d-flex gap-2 mb-2">
            <a routerLink="/workshop" class="btn btn-outline-primary">Workshop</a>
          </div>
          <h1 class="mb-1">Home</h1>
          <p class="mb-0">You are logged in.</p>
        </div>
        <button class="btn btn-outline-danger" type="button" (click)="logout()">
          Log off
        </button>
      </div>

      <app-track-form
        [editingTrackId]="editingTrackId"
        [editTrackName]="editTrackName"
        [editTrackLink]="editTrackLink"
        [submitting]="createSubmitting"
        (save)="saveTrack($event)"
        (cancel)="cancelEdit()"
      ></app-track-form>

      <div *ngIf="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <h2 class="h4 mb-3">My tracks</h2>

      <app-track-table
        [tracks]="tracks"
        [loading]="loading"
        (edit)="onEdit($event)"
        (remove)="onRemove($event)"
        (windows)="onWindows($event)"
      ></app-track-table>

      <app-track-windows-panel
        [track]="windowTrack"
        [creating]="creatingWindow"
        (close)="closeWindows()"
        (saveWindow)="onSaveWindow($event)"
        (deleteWindow)="onDeleteWindow($event)"
      ></app-track-windows-panel>
    </div>
  `,
})
export class HomePageComponent implements OnInit {
  @ViewChild(TrackFormComponent) private trackForm?: TrackFormComponent;

  private tracksApi = inject(MusicTracksService);
  private session = inject(SessionService);
  private router = inject(Router);

  tracks: Track[] = [];
  loading = false;
  createSubmitting = false;
  errorMessage = '';

  editingTrackId: number | null = null;
  editTrackName = '';
  editTrackLink = '';

  windowTrack: Track | null = null;
  creatingWindow = false;

  ngOnInit(): void {
    this.loadTracks();
  }

  loadTracks(): void {
    this.loading = true;
    this.errorMessage = '';

    this.tracksApi.getUserTracks().subscribe({
      next: (tracks: Track[]) => {
        this.tracks = tracks ?? [];
        if (this.windowTrack?.id != null) {
          const fresh = this.tracks.find(t => t.id === this.windowTrack!.id);
          this.windowTrack = fresh ?? null;
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.errorMessage = 'Loading tracks failed.';
      },
      complete: () => { this.loading = false; },
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
        next: (updatedTrack) => {
          this.applyTrackUpdate(event.trackId, updatedTrack);
        },
        error: (err) => { console.error('updateTrackWindow failed', err); alert('Updating window failed.'); },
      });
    } else {
      this.creatingWindow = true;
      this.tracksApi.createTrackWindow({
        trackId: event.trackId,
        trackWindowRequest: event.body,
      }).subscribe({
        next: (updatedTrack) => {
          this.applyTrackUpdate(event.trackId, updatedTrack);
        },
        error: (err) => { console.error('createTrackWindow failed', err); alert('Creating window failed.'); },
        complete: () => { this.creatingWindow = false; },
      });
    }
  }

  onDeleteWindow(event: WindowDeleteEvent): void {
    this.tracksApi.deleteTrackWindow({
      trackId: event.trackId,
      windowId: event.windowId,
    }).subscribe({
      next: (updatedTrack) => {
        this.applyTrackUpdate(event.trackId, updatedTrack);
      },
      error: (err) => { console.error('deleteTrackWindow failed', err); alert('Deleting window failed.'); },
    });
  }

  private applyTrackUpdate(trackId: number, updatedTrack: Track): void {
    this.tracks = this.tracks.map(t => t.id === trackId ? updatedTrack : t);
    if (this.windowTrack?.id === trackId) {
      this.windowTrack = updatedTrack;
    }
  }

  logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}