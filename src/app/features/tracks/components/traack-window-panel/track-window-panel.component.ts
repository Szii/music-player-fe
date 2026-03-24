import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Track, TrackWindowRequest } from '../../../../api/generated';

export interface WindowSaveEvent {
  trackId: number;
  windowId?: number;
  body: TrackWindowRequest;
}

export interface WindowDeleteEvent {
  trackId: number;
  windowId: number;
}

interface WindowForm {
  name: string;
  positionFrom: number;
  positionTo: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

@Component({
  selector: 'app-track-windows-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card mt-4 border-primary" *ngIf="track">
      <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
        <strong>
          Windows for: {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
        </strong>
        <button class="btn btn-sm btn-outline-light" (click)="close.emit()">Close</button>
      </div>
      <div class="card-body">

        <div *ngIf="windows.length > 0" class="table-responsive mb-3">
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
              <ng-container *ngFor="let win of windows">
                <tr *ngIf="editingWindowId !== win.id">
                  <td>{{ win.name || '(unnamed)' }}</td>
                  <td>{{ win.positionFrom ?? 0 }}</td>
                  <td>{{ win.positionTo ?? 0 }}</td>
                  <td class="text-center">{{ win.fadeIn ? '✓' : '' }}</td>
                  <td class="text-center">{{ win.fadeOut ? '✓' : '' }}</td>
                  <td>
                    <div class="d-flex gap-1">
                      <button class="btn btn-outline-secondary btn-sm" (click)="startEditWindow(win)">Edit</button>
                      <button class="btn btn-outline-danger btn-sm" (click)="onDeleteWindow(win)">Delete</button>
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

        <div *ngIf="windows.length === 0" class="text-muted mb-3">
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
              <button class="btn btn-sm btn-primary" (click)="onCreateWindow()" [disabled]="creating">
                {{ creating ? 'Adding...' : 'Add' }}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `,
})
export class TrackWindowsPanelComponent {
  @Input() track: Track | null = null;
  @Input() creating = false;

  @Output() close = new EventEmitter<void>();
  @Output() saveWindow = new EventEmitter<WindowSaveEvent>();
  @Output() deleteWindow = new EventEmitter<WindowDeleteEvent>();

  newWin: WindowForm = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };
  editingWindowId: number | null = null;
  editWin: WindowForm = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };

  get windows(): any[] {
    return this.track?.trackWindows ?? [];
  }

  onCreateWindow(): void {
    if (this.track?.id == null) return;

    this.saveWindow.emit({
      trackId: this.track.id,
      body: {
        name: this.newWin.name || undefined,
        positionFrom: this.newWin.positionFrom,
        positionTo: this.newWin.positionTo,
        fadeIn: this.newWin.fadeIn,
        fadeOut: this.newWin.fadeOut,
      },
    });
  }

  resetNewWin(): void {
    this.newWin = { name: '', positionFrom: 0, positionTo: 0, fadeIn: false, fadeOut: false };
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
    if (this.track?.id == null || this.editingWindowId == null) return;

    this.saveWindow.emit({
      trackId: this.track.id,
      windowId: this.editingWindowId,
      body: {
        name: this.editWin.name || undefined,
        positionFrom: this.editWin.positionFrom,
        positionTo: this.editWin.positionTo,
        fadeIn: this.editWin.fadeIn,
        fadeOut: this.editWin.fadeOut,
      },
    });
  }

  onDeleteWindow(win: any): void {
    if (this.track?.id == null || win.id == null) return;
    this.deleteWindow.emit({ trackId: this.track.id, windowId: win.id });
  }
}