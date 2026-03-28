import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Board, Group } from '../../../../api/generated';
import { BoardPlayerComponent } from '../board-player/board-player.component';

@Component({
  selector: 'app-board-card',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardPlayerComponent],
template: `
  <div class="board-card" [class.board-card--playing]="status === 'PLAYING'">
    <div class="board-card__header">
      <div class="board-card__identity">
        <span class="board-card__title">{{ board.name || ('Board #' + board.id) }}</span>
      </div>

      <button
        class="board-card__delete"
        (click)="delete.emit()"
        title="Delete board"
        type="button"
      >
        ✕
      </button>
    </div>

    <div class="board-card__settings">
      <div class="board-field">
        <span class="board-field__label">Group</span>
        <select
          class="board-sel app-input"
          [ngModel]="board.selectedGroup?.id ?? null"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="groupChange.emit($event)"
        >
          <option [ngValue]="null">All tracks</option>
          <option *ngFor="let g of availableGroups" [ngValue]="g.id">
            {{ g.listName || ('Group #' + g.id) }}
          </option>
        </select>
      </div>

      <div class="board-field">
        <span class="board-field__label">Track</span>
        <select
          class="board-sel app-input"
          [ngModel]="board.selectedTrack?.id ?? null"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="trackChange.emit($event)"
        >
          <option [ngValue]="null">No track</option>
          <option *ngFor="let t of board.availableTracks ?? []" [ngValue]="t.id">
            {{ t.trackName || t.trackOriginalName || ('Track #' + t.id) }}
          </option>
        </select>
      </div>

      <div class="board-field" *ngIf="windows.length > 0">
        <span class="board-field__label">Window</span>
        <select
          class="board-sel app-input"
          [ngModel]="selectedWindowId"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="windowChange.emit($event)"
        >
          <option [ngValue]="null">Whole track</option>
          <option *ngFor="let w of windows" [ngValue]="w.id">
            {{ w.name || ('Window #' + w.id) }}
            ({{ formatTime(w.positionFrom ?? 0) }}–{{ formatTime(w.positionTo ?? 0) }})
          </option>
        </select>
      </div>

      <div class="board-card__toggles">
        <label class="board-tog">
          <input
            type="checkbox"
            [checked]="board.repeat ?? false"
            (change)="toggleRepeat.emit()"
          />
          <span>Loop</span>
        </label>

        <label class="board-tog">
          <input
            type="checkbox"
            [checked]="board.overplay ?? false"
            (change)="toggleOverplay.emit()"
          />
          <span>Overplay</span>
        </label>
      </div>
    </div>

    <div class="board-card__player">
      <app-board-player
        [title]="board.name || ('Board #' + board.id)"
        [hasTrack]="!!board.selectedTrack"
        [trackId]="board.selectedTrack?.id ?? null"
        [status]="status"
        [streamUrl]="streamUrl"
        [durationS]="board.selectedTrack?.duration ?? null"
        [windowStartS]="selectedWindow?.positionFrom ?? null"
        [windowEndS]="selectedWindow?.positionTo ?? null"
        [hasSelectedWindow]="selectedWindow != null"
        [repeat]="board.repeat ?? false"
        (playRequested)="play.emit()"
        (stopRequested)="stop.emit()"
        (ended)="ended.emit()"
        (audioError)="audioError.emit()"
      />
    </div>
  </div>
`,
styles: [`
  :host {
    display: block;
  }

  .board-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 18px 20px;
    background: var(--app-surface);
    border: var(--app-border);
    border-radius: 16px;
    box-shadow: var(--app-shadow);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .board-card--playing {
    border-color: var(--app-primary);
    box-shadow: 0 0 0 3px var(--app-primary-soft), var(--app-shadow);
  }

  .board-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .board-card__identity {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .board-card__title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--app-text);
    line-height: 1.2;
  }

  .board-card__delete {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--app-danger-soft);
    background: var(--app-surface);
    color: var(--app-danger);
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .board-card__delete:hover {
    background: var(--app-danger-soft);
    border-color: var(--app-danger);
  }

  .board-card__settings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px 16px;
    align-items: end;
  }

  .board-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .board-field__label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--app-text-muted);
  }

  .board-sel.app-input {
    width: 100%;
    min-width: 0;
    max-width: none;
    padding: 0.65rem 0.85rem;
    font-size: 14px;
  }

  .board-card__toggles {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    min-height: 42px;
  }

  .board-tog {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--app-text-muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  .board-tog input {
    accent-color: var(--app-primary);
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .board-card__player {
    border-top: var(--app-border);
    padding-top: 14px;
  }

  @media (max-width: 700px) {
    .board-card {
      padding: 16px;
      gap: 12px;
    }

    .board-card__settings {
      grid-template-columns: 1fr;
    }

    .board-card__toggles {
      min-height: auto;
    }
  }
`],
})
export class BoardCardComponent {
  @Input() board!: Board;
  @Input() availableGroups: Group[] = [];
  @Input() status: 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR' = 'STOPPED';
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

  get windows(): any[] { return this.board.selectedTrack?.trackWindows ?? []; }

  get selectedWindow(): any | null {
    if (this.selectedWindowId == null) return null;
    return this.windows.find((w: any) => w.id === this.selectedWindowId) ?? null;
  }

  formatTime(s: number): string {
    const safe = Math.max(0, Math.floor(s));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const sec = safe % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }
}