import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { SessionService } from '../../../../core/auth/session.service';
import { TrackTableComponent } from '../../../tracks/components/track-table/track-table.component';
import {
  MusicTracksService,
  Track,
  TrackRequest,
} from '../../../../api/generated';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TrackTableComponent],
  template: `
    <div class="container py-5">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 class="mb-1">Home</h1>
          <p class="mb-0">You are logged in.</p>
        </div>

        <button class="btn btn-outline-danger" type="button" (click)="logout()">
          Log off
        </button>
      </div>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="h4 mb-3">
            {{ editingTrackId ? 'Edit track' : 'Create track' }}
          </h2>

          <form [formGroup]="createForm" (ngSubmit)="saveTrack()">
            <div class="mb-3">
              <label class="form-label">Track name</label>
              <input class="form-control" formControlName="trackName" type="text" />
            </div>

            <div class="mb-3">
              <label class="form-label">Track link</label>
              <input class="form-control" formControlName="trackLink" type="text" />
              <div
                class="text-danger mt-1"
                *ngIf="createForm.controls.trackLink.touched && createForm.controls.trackLink.invalid"
              >
                Track link is required.
              </div>
            </div>

            <div class="d-flex gap-2">
              <button
                class="btn btn-primary"
                type="submit"
                [disabled]="createForm.invalid || createSubmitting"
              >
                {{
                  createSubmitting
                    ? (editingTrackId ? 'Saving...' : 'Creating...')
                    : (editingTrackId ? 'Save changes' : 'Create track')
                }}
              </button>

              <button
                *ngIf="editingTrackId"
                class="btn btn-outline-secondary"
                type="button"
                (click)="cancelEdit()"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

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
    </div>
  `,
})
export class HomePageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private tracksApi = inject(MusicTracksService);
  private session = inject(SessionService);
  private router = inject(Router);

  tracks: Track[] = [];
  loading = false;
  createSubmitting = false;
  errorMessage = '';
  editingTrackId: number | null = null;

  createForm = this.fb.group({
    trackName: [''],
    trackLink: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.loadTracks();
  }

  loadTracks(): void {
    this.loading = true;
    this.errorMessage = '';

    this.tracksApi.getUserTracks().subscribe({
      next: (tracks: Track[]) => {
        this.tracks = tracks ?? [];
      },
      error: (err: unknown) => {
        console.error(err);
        this.errorMessage = 'Loading tracks failed.';
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  saveTrack(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    this.createSubmitting = true;

    const { trackName, trackLink } = this.createForm.getRawValue();

    const body: TrackRequest = {
      trackName: trackName || undefined,
      trackLink: trackLink!,
    };

    if (this.editingTrackId) {
      this.tracksApi.updateTrack({
        trackId: this.editingTrackId,
        trackRequest: body,
      }).subscribe({
        next: () => {
          this.cancelEdit();
          this.loadTracks();
        },
        error: (err: unknown) => {
          console.error(err);
          alert('Updating track failed.');
        },
        complete: () => {
          this.createSubmitting = false;
        },
      });

      return;
    }

    this.tracksApi.createTrack({ trackRequest: body }).subscribe({
      next: () => {
        this.createForm.reset({
          trackName: '',
          trackLink: '',
        });
        this.loadTracks();
      },
      error: (err: unknown) => {
        console.error(err);
        alert('Creating track failed.');
      },
      complete: () => {
        this.createSubmitting = false;
      },
    });
  }

  onEdit(track: Track): void {
    if (track.id == null) return;

    this.editingTrackId = track.id;

    this.createForm.patchValue({
      trackName: track.trackName ?? '',
      trackLink: track.trackLink ?? '',
    });
  }

  cancelEdit(): void {
    this.editingTrackId = null;

    this.createForm.reset({
      trackName: '',
      trackLink: '',
    });
  }

  onRemove(track: Track): void {
    if (!track.id) return;

    const confirmed = confirm(`Delete track "${track.trackName || track.id}"?`);
    if (!confirmed) return;

    this.tracksApi.deleteTrack({ trackId: track.id }).subscribe({
      next: () => {
        this.tracks = this.tracks.filter(t => t.id !== track.id);
      },
      error: (err: unknown) => {
        console.error(err);
        alert('Deleting track failed.');
      },
    });
  }

  onWindows(track: Track): void {
    console.log('Manage windows', track);
  }

  logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}