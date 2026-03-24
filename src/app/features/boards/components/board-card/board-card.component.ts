import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Board, Group } from '../../../../api/generated';
import { BoardPlayerComponent } from '../board-player/board-player.component';

@Component({
  selector: 'app-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, BoardPlayerComponent],
  template: `
    <div class="card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h2 class="h5 mb-1">{{ board.name || ('Board #' + board.id) }}</h2>
            <div class="text-muted">Owner: {{ board.owner?.name || '-' }}</div>
          </div>

          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            (click)="delete.emit()"
          >
            Delete
          </button>
        </div>

        <div class="mb-3">
          <label class="form-label">Group</label>
          <select
            class="form-select"
            [ngModel]="board.selectedGroup?.id ?? null"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="groupChange.emit($event)"
          >
            <option [ngValue]="null">-- all tracks --</option>
            <option *ngFor="let group of availableGroups" [ngValue]="group.id">
              {{ group.listName || ('Group #' + group.id) }}
            </option>
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label">Current track</label>
          <select
            class="form-select"
            [ngModel]="board.selectedTrack?.id ?? null"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="trackChange.emit($event)"
          >
            <option [ngValue]="null">-- no track selected --</option>
            <option *ngFor="let track of board.availableTracks ?? []" [ngValue]="track.id">
              {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
            </option>
          </select>
        </div>

        <div *ngIf="board.selectedTrack as selectedTrack" class="mb-3">
          <strong>Current track:</strong>
          {{ selectedTrack.trackName || selectedTrack.trackOriginalName || ('Track #' + selectedTrack.id) }}
        </div>

        <div *ngIf="windows.length > 0" class="mb-3">
          <label class="form-label">Track window</label>
          <select
            class="form-select"
            [ngModel]="selectedWindowId"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="windowChange.emit($event)"
          >
            <option [ngValue]="null">-- whole track --</option>
            <option *ngFor="let win of windows" [ngValue]="win.id">
              {{ win.name || ('Window #' + win.id) }}
              ({{ formatTime(win.positionFrom ?? 0) }} – {{ formatTime(win.positionTo ?? 0) }})
            </option>
          </select>
        </div>

        <div class="d-flex gap-3 mb-3">
          <div class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              [id]="'repeat-' + board.id"
              [checked]="board.repeat ?? false"
              (change)="toggleRepeat.emit()"
            />
            <label class="form-check-label" [for]="'repeat-' + board.id">
              Loop
            </label>
          </div>
          <div class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              [id]="'overplay-' + board.id"
              [checked]="board.overplay ?? false"
              (change)="toggleOverplay.emit()"
            />
            <label class="form-check-label" [for]="'overplay-' + board.id">
              Overplay
            </label>
          </div>
        </div>

        <app-board-player
          [title]="board.name || ('Board #' + board.id)"
          [hasTrack]="!!board.selectedTrack"
          [status]="status"
          [streamUrl]="streamUrl"
          [durationS]="board.selectedTrack?.duration ?? null"
          [windowStartS]="selectedWindow?.positionFrom ?? null"
          [windowEndS]="selectedWindow?.positionTo ?? null"
          [repeat]="board.repeat ?? false"
          (playRequested)="play.emit()"
          (stopRequested)="stop.emit()"
          (ended)="ended.emit()"
          (audioError)="audioError.emit()"
        ></app-board-player>
      </div>
    </div>
  `,
})
export class BoardCardComponent {
  @Input() board!: Board;
  @Input() availableGroups: Group[] = [];
  @Input() status = 'STOPPED';
  @Input() streamUrl: string | null = null;
  @Input() selectedWindowId: number | null = null;

  @Output() delete = new EventEmitter<void>();
  @Output() groupChange = new EventEmitter<number | null>();
  @Output() trackChange = new EventEmitter<number | null>();
  @Output() windowChange = new EventEmitter<number | null>();
  @Output() toggleRepeat = new EventEmitter<void>();
  @Output() toggleOverplay = new EventEmitter<void>();
  @Output() play = new EventEmitter<void>();
  @Output() stop = new EventEmitter<void>();
  @Output() ended = new EventEmitter<void>();
  @Output() audioError = new EventEmitter<void>();

  get windows(): any[] {
    return this.board.selectedTrack?.trackWindows ?? [];
  }

  get selectedWindow(): any | null {
    if (this.selectedWindowId == null) return null;
    return this.windows.find((w: any) => w.id === this.selectedWindowId) ?? null;
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}