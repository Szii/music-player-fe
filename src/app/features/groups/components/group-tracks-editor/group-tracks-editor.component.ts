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
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
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
  templateUrl: './group-tracks-editor.component.html',
  styleUrl: './group-tracks-editor.component.scss',
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
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:groups:editor:filter', 'all');
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