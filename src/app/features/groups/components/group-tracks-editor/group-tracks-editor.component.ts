import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Group, Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';

export interface GroupTracksSaveEvent {
  group: Group;
  trackIds: number[];
}

type TrackFilterMode = 'all' | 'selected';

@Component({
  selector: 'app-group-tracks-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NormalButtonComponent,
    UiDialogShellComponent,
    UiSearchBoxComponent,
  ],
  template: `
    <ui-dialog-shell
      [title]="'Edit tracks'"
      [subtitle]="dialogSubtitle"
      [wide]="true"
      [showFooter]="true"
      (closed)="cancel.emit()"
    >
      <div class="editor">
        <div class="editor__toolbar">
          <ui-search-box
            class="editor__search"
            [value]="search"
            placeholder="Search by name, original name, or owner"
            (valueChange)="search = $event"
          />

          <div class="editor__filters">
            <button
              type="button"
              class="editor__filter"
              [class.editor__filter--active]="filterMode === 'all'"
              (click)="filterMode = 'all'"
            >
              All
            </button>

            <button
              type="button"
              class="editor__filter"
              [class.editor__filter--active]="filterMode === 'selected'"
              (click)="filterMode = 'selected'"
            >
              Selected only
            </button>
          </div>
        </div>

        <div class="editor__meta">
          <span>{{ selectedCount }} selected</span>

          <div class="editor__bulk-actions">
            <button type="button" class="editor__link-btn" (click)="selectAllFiltered()">
              Select filtered
            </button>
            <button type="button" class="editor__link-btn" (click)="clearAll()">
              Clear all
            </button>
          </div>
        </div>

        <div *ngIf="filteredTracks.length === 0" class="editor__empty">
          No matching tracks.
        </div>

        <div *ngIf="filteredTracks.length > 0" class="editor__list">
          <label
            *ngFor="let track of filteredTracks; trackBy: trackByTrackId"
            class="editor-row"
            [class.editor-row--checked]="isSelected(track)"
          >
            <div class="editor-row__check">
              <input
                type="checkbox"
                [checked]="isSelected(track)"
                [disabled]="saving || track.id == null"
                (change)="toggleTrack(track, $any($event.target).checked)"
              />
            </div>

            <div class="editor-row__main">
              <div class="editor-row__title">
                {{ displayName(track) }}
              </div>

              <div class="editor-row__sub">
                <span *ngIf="track.trackOriginalName && track.trackOriginalName !== displayName(track)">
                  Original: {{ track.trackOriginalName }}
                </span>
                <span *ngIf="track.owner?.name">
                  {{ track.trackOriginalName && track.trackOriginalName !== displayName(track) ? ' · ' : '' }}
                  Owner: {{ track.owner?.name }}
                </span>
              </div>
            </div>

            <div class="editor-row__meta">
              {{ formatDuration(track.duration) }}
            </div>
          </label>
        </div>
      </div>

      <div dialog-footer>
        <normal-button
          type="button"
          variant="secondary"
          (clicked)="cancel.emit()"
        >
          Cancel
        </normal-button>

        <normal-button
          type="button"
          [disabled]="saving"
          (clicked)="onSave()"
        >
          {{ saving ? 'Saving…' : 'Save tracks' }}
        </normal-button>
      </div>
    </ui-dialog-shell>
  `,
  styles: [`
    :host {
      display: block;
    }

    .editor {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
    }

    .editor__toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }

    .editor__search {
      min-width: 0;
    }

    .editor__filters {
      display: inline-flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .editor__filter {
      border: 1px solid var(--app-border-color);
      background: var(--app-surface);
      color: var(--app-text-muted);
      border-radius: 999px;
      padding: 0.5rem 0.85rem;
      font-size: 0.92rem;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .editor__filter:hover {
      background: var(--app-surface-muted);
      color: var(--app-text);
    }

    .editor__filter--active {
      background: var(--app-primary-soft);
      color: var(--app-primary);
      border-color: var(--app-primary);
      font-weight: 600;
    }

    .editor__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .editor__bulk-actions {
      display: inline-flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .editor__link-btn {
      border: none;
      background: transparent;
      color: var(--app-primary);
      cursor: pointer;
      padding: 0;
      font: inherit;
    }

    .editor__link-btn:hover {
      color: var(--app-primary-hover);
      text-decoration: underline;
    }

    .editor__empty {
      padding: 1rem;
      border: var(--app-border);
      border-radius: 12px;
      color: var(--app-text-muted);
      background: var(--app-bg);
      font-style: italic;
    }

    .editor__list {
      border: var(--app-border);
      border-radius: 14px;
      overflow: auto;
      max-height: min(46vh, 380px);
      background: var(--app-surface);
    }

    .editor-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 0.9rem 1rem;
      border-bottom: 1px solid var(--app-border-color);
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .editor-row:last-child {
      border-bottom: none;
    }

    .editor-row:hover {
      background: var(--app-bg-soft);
    }

    .editor-row--checked {
      background: rgba(241, 230, 210, 0.55);
    }

    .editor-row__check input {
      accent-color: var(--app-primary);
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .editor-row__main {
      min-width: 0;
    }

    .editor-row__title {
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--app-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-row__sub {
      margin-top: 3px;
      font-size: 0.86rem;
      color: var(--app-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-row__meta {
      white-space: nowrap;
      font-size: 0.9rem;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 720px) {
      .editor__toolbar {
        grid-template-columns: 1fr;
      }

      .editor__meta {
        align-items: flex-start;
        flex-direction: column;
      }

      .editor-row {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .editor-row__meta {
        grid-column: 2;
      }
    }
  `],
})
export class GroupTracksEditorComponent implements OnChanges {
  @Input({ required: true }) group!: Group;
  @Input() tracks: Track[] = [];
  @Input() saving = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<GroupTracksSaveEvent>();

  search = '';
  filterMode: TrackFilterMode = 'all';
  private selectedIds = new Set<number>();

  ngOnChanges(changes: SimpleChanges): void {
    if ('group' in changes || 'tracks' in changes) {
      this.resetSelectionFromGroup();
    }
  }

  get dialogSubtitle(): string {
    const name = this.group?.listName || `Group #${this.group?.id}`;
    return `${name} · ${this.selectedCount} selected`;
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get filteredTracks(): Track[] {
    const q = this.search.trim().toLowerCase();

    return (this.tracks ?? []).filter(track => {
      const matchesFilter =
        this.filterMode === 'all' || (track.id != null && this.selectedIds.has(track.id));

      if (!matchesFilter) return false;
      if (!q) return true;

      const haystack = [
        track.trackName,
        track.trackOriginalName,
        track.owner?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }

  trackByTrackId(index: number, track: Track): number | string {
    return track.id ?? index;
  }

  isSelected(track: Track): boolean {
    return track.id != null && this.selectedIds.has(track.id);
  }

  toggleTrack(track: Track, checked: boolean): void {
    if (track.id == null) return;
    if (checked) {
      this.selectedIds.add(track.id);
    } else {
      this.selectedIds.delete(track.id);
    }
  }

  selectAllFiltered(): void {
    for (const track of this.filteredTracks) {
      if (track.id != null) {
        this.selectedIds.add(track.id);
      }
    }
  }

  clearAll(): void {
    this.selectedIds.clear();
  }

  onSave(): void {
    this.save.emit({
      group: this.group,
      trackIds: Array.from(this.selectedIds.values()),
    });
  }

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || `Track #${track.id}`;
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) return '—';
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private resetSelectionFromGroup(): void {
    const ids = (this.group?.tracks ?? [])
      .map(track => track.id)
      .filter((id): id is number => id != null);

    this.selectedIds = new Set(ids);
    this.search = '';
    this.filterMode = 'all';
  }
}