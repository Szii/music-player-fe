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
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';

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
    UiChipComponent,
  ],
  template: `
    <ui-dialog-shell
      title="Edit tracks"
      [subtitle]="dialogSubtitle()"
      size="wide"
      [showFooter]="true"
      (closed)="cancel.emit()"
    >
      <div class="editor">
        @if (tracks().length === 0) {
          <div class="editor__no-tracks">
            <p class="editor__no-tracks-title">No tracks available yet</p>
            <p class="editor__no-tracks-msg">
              Add a track of your own, or subscribe to one shared by another user,
              then come back to add it to this group.
            </p>

            <div class="editor__no-tracks-actions">
              <normal-button type="button" (clicked)="addTrack.emit()">
                Add a track
              </normal-button>

              <normal-button type="button" variant="secondary" (clicked)="browseWorkshop.emit()">
                Browse the workshop
              </normal-button>
            </div>
          </div>
        } @else {
          <ui-list-toolbar
            [(search)]="search"
            searchPlaceholder="Search by name, original name, or owner"
            [filterValue]="filterMode()"
            [filterOptions]="filterOptions"
            (filterValueChange)="setFilterMode($event)"
            [filteredCount]="filteredTracks().length"
            [totalCount]="tracks().length"
            itemLabel="track"
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
            <!-- Desktop: scrollable checkbox list (hidden < md) -->
            <div class="editor__list app-table-desktop-only" role="list">
              @for (track of filteredTracks(); track trackById($index, track)) {
                <label
                  class="editor-row"
                  role="listitem"
                  [class.editor-row--checked]="isSelected(track)"
                >
                  <div class="editor-row__check">
                    <input
                      class="editor-row__check-input"
                      type="checkbox"
                      [checked]="isSelected(track)"
                      [disabled]="saving() || track.id == null"
                      (change)="toggleTrack(track, $any($event.target).checked)"
                    />
                  </div>

                  <div class="editor-row__main">
                    <div class="editor-row__title" [title]="displayName(track)">
                      {{ displayName(track) }}
                    </div>

                    <div class="editor-row__sub">
                      @if (track.trackOriginalName && track.trackOriginalName !== displayName(track)) {
                        <span [title]="track.trackOriginalName">
                          Original: {{ track.trackOriginalName }}
                        </span>
                      }

                      @if (track.owner?.name) {
                        <span [title]="track.owner?.name">
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

            <!-- Mobile: shared condensed list (shown < md) -->
            <ul class="app-entity-list" role="list">
              @for (track of filteredTracks(); track trackById($index, track)) {
                <li
                  class="app-entity-list__item editor-mobile-row"
                  [class.editor-mobile-row--checked]="isSelected(track)"
                >
                  <label class="editor-mobile-row__label">
                    <div class="app-entity-list__head editor-mobile-row__head">
                      <span class="editor-mobile-row__title-wrap">
                        <input
                          class="editor-row__check-input"
                          type="checkbox"
                          [checked]="isSelected(track)"
                          [disabled]="saving() || track.id == null"
                          (change)="toggleTrack(track, $any($event.target).checked)"
                        />

                        <span class="app-entity-list__title editor-mobile-row__title" [title]="displayName(track)">
                          {{ displayName(track) }}
                        </span>
                      </span>

                      <ui-chip
                        [variant]="isSelected(track) ? 'success' : 'gold'"
                        size="sm"
                        shape="hex"
                        [dot]="true"
                      >
                        {{ isSelected(track) ? 'Selected' : 'Available' }}
                      </ui-chip>
                    </div>

                    @if (track.trackOriginalName && track.trackOriginalName !== displayName(track)) {
                      <span class="app-entity-list__subtitle editor-mobile-row__subtitle" [title]="track.trackOriginalName">
                        Original: {{ track.trackOriginalName }}
                      </span>
                    }

                    <div class="app-entity-list__meta editor-mobile-row__meta">
                      @if (track.owner?.name) {
                        <span [title]="track.owner?.name">{{ track.owner?.name }}</span>
                        <span class="app-entity-list__sep" aria-hidden="true">·</span>
                      }

                      <span>{{ formatDuration(track.duration) }}</span>
                    </div>
                  </label>
                </li>
              }
            </ul>
          }
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

      @if (tracks().length > 0) {
        <normal-button
          dialog-footer
          type="button"
          [disabled]="saving()"
          (clicked)="onSave()"
        >
          {{ saving() ? 'Saving…' : 'Save tracks' }}
        </normal-button>
      }
    </ui-dialog-shell>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }

    .editor {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    ui-list-toolbar {
      display: block;
      min-width: 0;
      max-width: 100%;
    }

    .editor__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
      max-width: 100%;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .editor__bulk-actions {
      display: inline-flex;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
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

    .editor__no-tracks {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.75rem;
      padding: 2rem 1.5rem;
      border: 1px dashed var(--app-border-color);
      border-radius: var(--app-radius-md);
      background:
        radial-gradient(ellipse at center, rgba(201, 164, 76, 0.06) 0, transparent 60%),
        var(--app-surface);
    }

    .editor__no-tracks-title {
      margin: 0;
      font-family: var(--app-font-heading);
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: 0.04em;
      color: var(--app-heading);
    }

    .editor__no-tracks-msg {
      margin: 0;
      max-width: 42ch;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .editor__no-tracks-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 0.5rem;
    }

    /*
      Desktop behavior restored from the original:
      toolbar/meta stay fixed in the modal body, only this list scrolls.
    */
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
      min-width: 0;
      padding: 0.9rem 1rem;
      border-bottom: 1px solid var(--app-border-color);
      cursor: pointer;
      transition: background 0.15s ease;
      box-sizing: border-box;
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

    .editor-row__check {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .editor-row__check-input {
      accent-color: var(--app-primary);
      width: 16px;
      height: 16px;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .editor-row__check-input:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .editor-row__main {
      min-width: 0;
      overflow: hidden;
    }

    .editor-row__title {
      display: block;
      min-width: 0;
      max-width: 100%;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--app-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-row__sub {
      display: block;
      min-width: 0;
      max-width: 100%;
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

    .editor-mobile-row {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }

    .editor-mobile-row--checked {
      background:
        radial-gradient(ellipse at top right, rgba(75, 124, 49, 0.12) 0, transparent 38%),
        var(--app-surface);
    }

    .editor-mobile-row__label {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      cursor: pointer;
    }

    .editor-mobile-row__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .editor-mobile-row__title-wrap {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .editor-mobile-row__title {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-mobile-row__subtitle {
      display: block;
      min-width: 0;
      max-width: 100%;
      margin-top: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-mobile-row__meta {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
      margin-top: 8px;
      overflow: hidden;
    }

    .editor-mobile-row__meta span {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-mobile-row ui-chip {
      justify-self: end;
      max-width: 100%;
    }

    /* Desktop list ↔ mobile list switch is handled by the shared
       .app-table-desktop-only / .app-entity-list utilities at md (900px),
       matching every other table-like view in the app. */
    @media (max-width: 900px) {
      .editor__meta {
        align-items: flex-start;
        flex-direction: column;
      }
    }

    /* Chip stays top-right at every width — the title (with its checkbox)
       truncates rather than the chip dropping to its own line. */
  `],
})
export class GroupTracksEditorComponent {
  readonly group = input.required<Group>();
  readonly tracks = input<Track[]>([]);
  readonly saving = input(false);

  readonly cancel = output<void>();
  readonly save = output<GroupTracksSaveEvent>();
  readonly addTrack = output<void>();
  readonly browseWorkshop = output<void>();

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
        if (track.id != null) {
          next.add(track.id);
        }
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

  trackById(index: number, track: Track): number {
    return track.id ?? index;
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