import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Group, Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';

export interface GroupTracksSaveEvent {
  group: Group;
  trackIds: number[];
}

type TrackFilterMode = 'all' | 'selected';

@Component({
  selector: 'app-group-tracks-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NormalButtonComponent,
    UiDialogShellComponent,
    UiListToolbarComponent,
  ],
  template: `
    <ui-dialog-shell
      title="Edit tracks"
      [subtitle]="dialogSubtitle()"
      [wide]="true"
      [showFooter]="true"
      (closed)="cancel.emit()"
    >
      <div class="editor">
        <ui-list-toolbar
          [(search)]="search"
          searchPlaceholder="Search by name, original name, or owner"
          [filterValue]="filterMode()"
          [filterOptions]="filterOptions"
          (filterValueChange)="setFilterMode($event)"
        />

        <div class="editor__meta">
          <span>{{ selectedCount() }} selected</span>

          <div class="editor__bulk-actions">
            <button type="button" class="editor__link-btn" (click)="selectAllFiltered()">
              Select filtered
            </button>
            <button type="button" class="editor__link-btn" (click)="clearAll()">
              Clear all
            </button>
          </div>
        </div>

        @if (filteredTracks().length === 0) {
          <div class="editor__empty">No matching tracks.</div>
        } @else {
          <div class="editor__list">
            @for (track of filteredTracks(); track track.id) {
              <label
                class="editor-row"
                [class.editor-row--checked]="isSelected(track)"
              >
                <div class="editor-row__check">
                  <input
                    type="checkbox"
                    [checked]="isSelected(track)"
                    [disabled]="saving() || track.id == null"
                    (change)="toggleTrack(track, $any($event.target).checked)"
                  />
                </div>

                <div class="editor-row__main">
                  <div class="editor-row__title">
                    {{ displayName(track) }}
                  </div>

                  <div class="editor-row__sub">
                    @if (track.trackOriginalName && track.trackOriginalName !== displayName(track)) {
                      <span>Original: {{ track.trackOriginalName }}</span>
                    }
                    @if (track.owner?.name) {
                      <span>
                        {{ track.trackOriginalName && track.trackOriginalName !== displayName(track) ? ' · ' : '' }}
                        Owner: {{ track.owner?.name }}
                      </span>
                    }
                  </div>
                </div>

                <div class="editor-row__meta">
                  {{ formatDuration(track.duration) }}
                </div>
              </label>
            }
          </div>
        }
      </div>

      <normal-button
        dialog-footer
        type="button"
        variant="secondary"
        (clicked)="cancel.emit()"
      >
        Cancel
      </normal-button>

      <normal-button
        dialog-footer
        type="button"
        [disabled]="saving()"
        (clicked)="onSave()"
      >
        {{ saving() ? 'Saving…' : 'Save tracks' }}
      </normal-button>
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
      border-radius: var(--app-radius-md);
      color: var(--app-text-muted);
      background: var(--app-bg);
      font-style: italic;
    }

    .editor__list {
      border: var(--app-border);
      border-radius: var(--app-radius-md);
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
export class GroupTracksEditorComponent {
  readonly group = input.required<Group>();
  readonly tracks = input<Track[]>([]);
  readonly saving = input(false);

  readonly cancel = output<void>();
  readonly save = output<GroupTracksSaveEvent>();

  readonly search = signal('');
  readonly filterMode = signal<TrackFilterMode>('all');
  readonly selectedIds = signal<ReadonlySet<number>>(new Set<number>());

  readonly filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Selected only', value: 'selected' },
  ];

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly dialogSubtitle = computed(() => {
    const g = this.group();
    const name = g.listName || `Group #${g.id}`;
    return `${name} · ${this.selectedCount()} selected`;
  });

  readonly filteredTracks = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mode = this.filterMode();
    const selected = this.selectedIds();

    return this.tracks().filter(track => {
      const matchesFilter =
        mode === 'all' || (track.id != null && selected.has(track.id));

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
  });

  constructor() {
    effect(() => {
      const g = this.group();
      this.tracks();
      this.resetSelectionFromGroup(g);
    });
  }

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as TrackFilterMode);
  }

  isSelected(track: Track): boolean {
    return track.id != null && this.selectedIds().has(track.id);
  }

  toggleTrack(track: Track, checked: boolean): void {
    if (track.id == null) return;
    const id = track.id;
    this.selectedIds.update(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  selectAllFiltered(): void {
    this.selectedIds.update(prev => {
      const next = new Set(prev);
      for (const track of this.filteredTracks()) {
        if (track.id != null) next.add(track.id);
      }
      return next;
    });
  }

  clearAll(): void {
    this.selectedIds.set(new Set<number>());
  }

  onSave(): void {
    this.save.emit({
      group: this.group(),
      trackIds: Array.from(this.selectedIds().values()),
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

  private resetSelectionFromGroup(group: Group | undefined): void {
    const ids = (group?.tracks ?? [])
      .map(track => track.id)
      .filter((id): id is number => id != null);

    this.selectedIds.set(new Set(ids));
    this.search.set('');
    this.filterMode.set('all');
  }
}
