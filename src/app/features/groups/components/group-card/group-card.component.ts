import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Group, Track } from '../../../../api/generated';

export interface TrackToggleEvent {
  group: Group;
  track: Track;
  checked: boolean;
}

export interface RenameEvent {
  group: Group;
  newName: string;
}

@Component({
  selector: 'app-group-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-body">

        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <div *ngIf="editingName === null">
              <h2 class="h5 mb-0">{{ group.listName || ('Group #' + group.id) }}</h2>
            </div>
            <div *ngIf="editingName !== null" class="d-flex gap-2 align-items-center">
              <input
                class="form-control form-control-sm"
                style="width: 200px;"
                [value]="editingName"
                (input)="editingName = $any($event.target).value"
                (keydown.enter)="confirmRename()"
                (keydown.escape)="cancelRename()"
              />
              <button class="btn btn-sm btn-outline-success" (click)="confirmRename()">Save</button>
              <button class="btn btn-sm btn-outline-secondary" (click)="cancelRename()">Cancel</button>
            </div>
          </div>

          <div class="d-flex gap-2">
            <button
              *ngIf="editingName === null"
              class="btn btn-outline-secondary btn-sm"
              (click)="startRename()"
            >Rename</button>
            <button
              class="btn btn-outline-danger btn-sm"
              (click)="deleteRequested.emit(group)"
            >Delete</button>
          </div>
        </div>

        <div *ngIf="tracks.length > 0">
          <strong class="d-block mb-2">Tracks:</strong>
          <div *ngFor="let track of tracks" class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              [id]="'g' + group.id + '-t' + track.id"
              [checked]="isTrackInGroup(track)"
              (change)="trackToggled.emit({ group, track, checked: $any($event.target).checked })"
              [disabled]="updating"
            />
            <label class="form-check-label" [for]="'g' + group.id + '-t' + track.id">
              {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
            </label>
          </div>
        </div>

        <div *ngIf="tracks.length === 0" class="text-muted small">
          No tracks available. Create some tracks first.
        </div>

      </div>
    </div>
  `,
})
export class GroupCardComponent {
  @Input({ required: true }) group!: Group;
  @Input() tracks: Track[] = [];
  @Input() updating = false;

  @Output() deleteRequested = new EventEmitter<Group>();
  @Output() renameRequested = new EventEmitter<RenameEvent>();
  @Output() trackToggled = new EventEmitter<TrackToggleEvent>();

  editingName: string | null = null;

  startRename(): void {
    this.editingName = this.group.listName ?? '';
  }

  cancelRename(): void {
    this.editingName = null;
  }

  confirmRename(): void {
    const name = this.editingName?.trim();
    if (!name) return;
    this.renameRequested.emit({ group: this.group, newName: name });
    this.editingName = null;
  }

  isTrackInGroup(track: Track): boolean {
    if (!this.group.tracks || track.id == null) return false;
    return this.group.tracks.some(t => t.id === track.id);
  }
}