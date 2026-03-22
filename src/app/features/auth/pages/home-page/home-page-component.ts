import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { SessionService } from '../../../../core/auth/session.service';
import { TrackTableComponent } from '../../../tracks/components/track-table/track-table.component';
import {
  MusicTracksService,
  Track,
  TrackRequest,
  TrackWindowRequest,
} from '../../../../api/generated';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TrackTableComponent, RouterLink],
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

      <div *ngIf="windowTrack" class="card mt-4 border-primary">
        <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <strong>
            Windows for: {{ windowTrack.trackName || windowTrack.trackOriginalName || ('Track #' + windowTrack.id) }}
          </strong>
          <button class="btn btn-sm btn-outline-light" (click)="closeWindows()">Close</button>
        </div>
        <div class="card-body">

          <div *ngIf="getWindows().length > 0" class="table-responsive mb-3">
            <table class="table table-sm table-bordered mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style="width: 110px;">From (s)</th>
                  <th style="width: 110px;">To (s)</th>
                  <th style="width: 80px;">Fade In</th>
                  <th style="width: 80px;">Fade Out</th>
                  <th style="width: 150px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <ng-container *ngFor="let win of getWindows()">
                  <tr *ngIf="editingWindowId !== win.id">
                    <td>{{ win.name || '(unnamed)' }}</td>
                    <td>{{ win.positionFrom ?? 0 }}</td>
                    <td>{{ win.positionTo ?? 0 }}</td>
                    <td class="text-center">{{ win.fadeIn ? '✓' : '' }}</td>
                    <td class="text-center">{{ win.fadeOut ? '✓' : '' }}</td>
                    <td>
                      <div class="d-flex gap-1">
                        <button class="btn btn-outline-secondary btn-sm" (click)="startEditWindow(win)">Edit</button>
                        <button class="btn btn-outline-danger btn-sm" (click)="deleteWindow(win)">Delete</button>
                      </div>
                    </td>
                  </tr>
                  <tr *ngIf="editingWindowId === win.id">
                    <td><input class="form-control form-control-sm" [(ngModel)]="editWin.name" /></td>
                    <td><input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="editWin.positionFrom" /></td>
                    <td><input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="editWin.positionTo" /></td>
                    <td class="text-center"><input class="form-check-input" type="checkbox" [(ngModel)]="editWin.fadeIn" /></td>
                    <td class="text-center"><input class="form-check-input" type="checkbox" [(ngModel)]="editWin.fadeOut" /></td>
                    <td>
                      <div class="d-flex gap-1">
                        <button class="btn btn-outline-success btn-sm" (click)="saveEditWindow()">Save</button>
                        <button class="btn btn-outline-secondary btn-sm" (click)="cancelEditWindow()">Cancel</button>
                      </div>
                    </td>
                  </tr>
                </ng-container>
              </tbody>
            </table>
          </div>

          <div *ngIf="getWindows().length === 0" class="text-muted mb-3">
            No windows yet.
          </div>

          <div class="border rounded p-3 bg-light">
            <strong class="d-block mb-2">Add window</strong>
            <div class="row g-2 align-items-end">
              <div class="col">
                <label class="form-label small mb-0">Name</label>
                <input class="form-control form-control-sm" [(ngModel)]="newWin.name" />
              </div>
              <div class="col" style="max-width: 110px;">
                <label class="form-label small mb-0">From (s)</label>
                <input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="newWin.positionFrom" />
              </div>
              <div class="col" style="max-width: 110px;">
                <label class="form-label small mb-0">To (s)</label>
                <input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="newWin.positionTo" />
              </div>
              <div class="col-auto">
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="checkbox" id="new-win-fi" [(ngModel)]="newWin.fadeIn" />
                  <label class="form-check-label small" for="new-win-fi">Fade In</label>
                </div>
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="checkbox" id="new-win-fo" [(ngModel)]="newWin.fadeOut" />
                  <label class="form-check-label small" for="new-win-fo">Fade Out</label>
                </div>
              </div>
              <div class="col-auto">
                <button class="btn btn-sm btn-primary" (click)="createWindow()" [disabled]="creatingWindow">
                  {{ creatingWindow ? 'Adding...' : 'Add' }}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
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

  windowTrack: Track | null = null;

  newWin: WindowForm = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };
  creatingWindow = false;

  editingWindowId: number | null = null;
  editWin: WindowForm = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };

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
      this.tracksApi.updateTrack({ trackId: this.editingTrackId, trackRequest: body }).subscribe({
        next: () => { this.cancelEdit(); this.loadTracks(); },
        error: (err: unknown) => { console.error(err); alert('Updating track failed.'); },
        complete: () => { this.createSubmitting = false; },
      });
      return;
    }

    this.tracksApi.createTrack({ trackRequest: body }).subscribe({
      next: () => {
        this.createForm.reset({ trackName: '', trackLink: '' });
        this.loadTracks();
      },
      error: (err: unknown) => { console.error(err); alert('Creating track failed.'); },
      complete: () => { this.createSubmitting = false; },
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
    this.createForm.reset({ trackName: '', trackLink: '' });
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
    this.resetNewWin();
    this.cancelEditWindow();
  }

  closeWindows(): void {
    this.windowTrack = null;
    this.resetNewWin();
    this.cancelEditWindow();
  }

  getWindows(): any[] {
    return this.windowTrack?.trackWindows ?? [];
  }

  createWindow(): void {
    if (this.windowTrack?.id == null) return;
    const trackId = this.windowTrack.id;

    const body: TrackWindowRequest = {
      name: this.newWin.name || undefined,
      positionFrom: this.newWin.positionFrom,
      positionTo: this.newWin.positionTo,
      fadeIn: this.newWin.fadeIn,
      fadeOut: this.newWin.fadeOut,
    };

    this.creatingWindow = true;
    console.log('createTrackWindow', { trackId, body });

    this.tracksApi.createTrackWindow({ trackId, trackWindowRequest: body }).subscribe({
      next: (updatedTrack) => {
        console.log('createTrackWindow response', updatedTrack);
        this.applyTrackUpdate(trackId, updatedTrack);
        this.resetNewWin();
      },
      error: (err) => { console.error('createTrackWindow failed', err); alert('Creating window failed.'); },
      complete: () => { this.creatingWindow = false; },
    });
  }

  startEditWindow(win: any): void {
    this.editingWindowId = win.id;
    this.editWin = {
      name: win.name ?? '',
      positionFrom: win.positionFrom ?? 0,
      positionTo: win.positionTo ?? 0,
      fadeIn: win.fadeIn ?? false,
      fadeOut: win.fadeOut ?? false,
    };
  }

  cancelEditWindow(): void {
    this.editingWindowId = null;
    this.editWin = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };
  }

  saveEditWindow(): void {
    if (this.windowTrack?.id == null || this.editingWindowId == null) return;
    const trackId = this.windowTrack.id;
    const windowId = this.editingWindowId;

    const body: TrackWindowRequest = {
      name: this.editWin.name || undefined,
      positionFrom: this.editWin.positionFrom,
      positionTo: this.editWin.positionTo,
      fadeIn: this.editWin.fadeIn,
      fadeOut: this.editWin.fadeOut,
    };

    console.log('updateTrackWindow', { trackId, windowId, body });

    this.tracksApi.updateTrackWindow({ trackId, windowId, trackWindowRequest: body }).subscribe({
      next: (updatedTrack) => {
        console.log('updateTrackWindow response', updatedTrack);
        this.applyTrackUpdate(trackId, updatedTrack);
        this.cancelEditWindow();
      },
      error: (err) => { console.error('updateTrackWindow failed', err); alert('Updating window failed.'); },
    });
  }

  deleteWindow(win: any): void {
    if (this.windowTrack?.id == null || win.id == null) return;
    const trackId = this.windowTrack.id;
    const windowId = win.id;

    this.tracksApi.deleteTrackWindow({ trackId, windowId }).subscribe({
      next: (updatedTrack) => {
        this.applyTrackUpdate(trackId, updatedTrack);
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

  private resetNewWin(): void {
    this.newWin = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };
  }

  logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}

interface WindowForm {
  name: string;
  positionFrom: number;
  positionTo: number;
  fadeIn: boolean;
  fadeOut: boolean;
}