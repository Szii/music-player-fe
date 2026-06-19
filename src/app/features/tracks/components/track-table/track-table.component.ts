import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Track } from '../../../../api/generated';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';

type TrackFilterMode =
  | 'all'
  | 'own'
  | 'subscribed'
  | 'withWindows'
  | 'withoutWindows'
  | 'published';

type TrackSortMode = 'nameAsc' | 'nameDesc' | 'durationAsc' | 'durationDesc';

@Component({
  selector: 'app-track-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UiDataTableComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiActionMenuComponent,
  ],
  templateUrl: './track-table.component.html',
  styleUrl: './track-table.component.scss',
})
export class TrackTableComponent {
  readonly tracks = input<Track[]>([]);
  readonly loading = input(false);

  readonly edit = output<Track>();
  readonly remove = output<Track>();
  readonly windows = output<Track>();

  readonly search = signal('');
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:tracks:filter', 'own');
  readonly sortMode = persistentSignal<TrackSortMode>('mpf:tracks:sort', 'nameAsc');

  readonly filterOptions = [
    { label: 'All tracks', value: 'all' },
    { label: 'My tracks', value: 'own' },
    { label: 'Subscribed', value: 'subscribed' },
    { label: 'With windows', value: 'withWindows' },
    { label: 'Without windows', value: 'withoutWindows' },
    { label: 'Published', value: 'published' },
  ];

  readonly sortOptions = [
    { label: 'Name A–Z', value: 'nameAsc' },
    { label: 'Name Z–A', value: 'nameDesc' },
    { label: 'Duration shortest', value: 'durationAsc' },
    { label: 'Duration longest', value: 'durationDesc' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: 'Name', className: 'col-name', width: '180px' },
    { label: 'Original name', className: 'col-original' },
    { label: 'Owner', className: 'col-owner', width: '120px' },
    { label: 'Duration', className: 'col-duration', width: '110px' },
    { label: 'Status', className: 'col-status', width: '150px' },
    { label: '', className: 'col-actions', width: '64px' },
  ];

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filterMode();
    const sort = this.sortMode();

    const filtered = this.tracks().filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);
      const matchesFilter = this.matchesFilter(track, filter);
      return matchesSearch && matchesFilter;
    });

    return [...filtered].sort((a, b) => this.compareTracks(a, b, sort));
  });

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as TrackFilterMode);
  }

  setSortMode(value: unknown): void {
    this.sortMode.set(value as TrackSortMode);
  }

  trackByTrackId = (index: number, track: Track): number | string => track.id ?? index;

  menuItems(track: Track): ActionMenuItem[] {
    const subscribed = this.isSubscribed(track);
    const items: ActionMenuItem[] = [
      { id: 'edit', label: 'Edit track', disabled: subscribed },
      { id: 'windows', label: 'Edit windows', disabled: subscribed },
    ];

    if (track.trackLink) {
      items.push({ id: 'open', label: 'Open source ↗', href: track.trackLink });
    }

    items.push({ id: 'delete', label: 'Delete track', variant: 'danger', disabled: subscribed });

    return items;
  }

  onMenuSelect(track: Track, id: string): void {
    switch (id) {
      case 'edit':
        this.edit.emit(track);
        break;
      case 'windows':
        this.windows.emit(track);
        break;
      case 'delete':
        this.remove.emit(track);
        break;
    }
  }

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || '—';
  }

  isSubscribed(track: Track): boolean {
    return track.owned === false;
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private matchesSearch(track: Track, query: string): boolean {
    const haystack = [
      track.trackName,
      track.trackOriginalName,
      track.trackLink,
      track.owner?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  private matchesFilter(track: Track, filterMode: TrackFilterMode): boolean {
    const subscribed = this.isSubscribed(track);

    switch (filterMode) {
      case 'own':
        return !subscribed;
      case 'subscribed':
        return subscribed;
      case 'withWindows':
        return (track.trackWindows?.length ?? 0) > 0;
      case 'withoutWindows':
        return (track.trackWindows?.length ?? 0) === 0;
      case 'published':
        return track.trackShare != null && !subscribed;
      case 'all':
      default:
        return true;
    }
  }

  private compareTracks(a: Track, b: Track, sortMode: TrackSortMode): number {
    switch (sortMode) {
      case 'nameDesc':
        return this.compareStrings(this.displayName(b), this.displayName(a));
      case 'durationAsc':
        return (a.duration ?? Number.MAX_SAFE_INTEGER) - (b.duration ?? Number.MAX_SAFE_INTEGER);
      case 'durationDesc':
        return (b.duration ?? -1) - (a.duration ?? -1);
      case 'nameAsc':
      default:
        return this.compareStrings(this.displayName(a), this.displayName(b));
    }
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }
}