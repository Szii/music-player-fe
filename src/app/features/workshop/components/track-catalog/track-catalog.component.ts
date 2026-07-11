import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Track } from '../../../../api/generated';
import { InfoDialogService } from '../../../../shared/features/info-dialog/info-dialog.service';
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

type CatalogFilterMode = 'all' | 'available' | 'subscribed';

type TrackCatalogSortMode =
  | 'nameAsc'
  | 'nameDesc'
  | 'ownerAsc'
  | 'ownerDesc'
  | 'durationAsc'
  | 'durationDesc'
  | 'subscribersAsc'
  | 'subscribersDesc';

@Component({
  selector: 'app-track-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UiDataTableComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiActionMenuComponent,
  ],
  templateUrl: './track-catalog.component.html',
  styleUrl: './track-catalog.component.scss',
})
export class TrackCatalogComponent {
  readonly tracks = input<Track[]>([]);
  readonly subscribedIds = input<ReadonlySet<number>>(new Set<number>());
  readonly busyTrackId = input<number | null>(null);

  readonly subscribe = output<Track>();
  readonly unsubscribe = output<Track>();

  readonly search = signal('');
  readonly filterMode = persistentSignal<CatalogFilterMode>('mpf:workshop:catalog:filter', 'all');
  readonly sortMode = persistentSignal<TrackCatalogSortMode>('mpf:workshop:catalog:sort', 'nameAsc');

  readonly filterOptions = [
    { label: 'All tracks', value: 'all' },
    { label: 'Available', value: 'available' },
    { label: 'Subscribed', value: 'subscribed' },
  ];

  readonly sortOptions = [
    { label: 'Name A–Z', value: 'nameAsc' },
    { label: 'Name Z–A', value: 'nameDesc' },
    { label: 'Owner A–Z', value: 'ownerAsc' },
    { label: 'Owner Z–A', value: 'ownerDesc' },
    { label: 'Duration shortest', value: 'durationAsc' },
    { label: 'Duration longest', value: 'durationDesc' },
    { label: 'Most subscribed', value: 'subscribersDesc' },
    { label: 'Least subscribed', value: 'subscribersAsc' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: 'Track', className: 'col-title' },
    { label: 'Owner', className: 'col-owner', width: '16%' },
    { label: 'Duration', className: 'col-duration', width: '100px' },
    { label: 'Subscribers', className: 'col-subscribers', width: '110px' },
    { label: 'Description', className: 'col-desc' },
    { label: 'Status', className: 'col-status', width: '140px' },
    { label: '', className: 'col-actions', width: '72px' },
  ];

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as CatalogFilterMode);
  }

  setSortMode(value: unknown): void {
    this.sortMode.set(value as TrackCatalogSortMode);
  }

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filterMode();
    const sort = this.sortMode();

    const filtered = this.tracks().filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);
      const subscribed = this.isSubscribed(track);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'available' && !subscribed) ||
        (filter === 'subscribed' && subscribed);

      return matchesSearch && matchesFilter;
    });

    return [...filtered].sort((a, b) => this.compareTracks(a, b, sort));
  });

  private readonly infoDialog = inject(InfoDialogService);

  isSubscribed(track: Track): boolean {
    return track.id != null && this.subscribedIds().has(track.id);
  }

  menuItems(track: Track): ActionMenuItem[] {
    const busy = this.busyTrackId() === track.id;

    if (this.isSubscribed(track)) {
      return [{ id: 'unsubscribe', label: 'Unsubscribe', variant: 'danger', disabled: busy }];
    }

    return [{ id: 'subscribe', label: 'Subscribe', disabled: busy }];
  }

  onMenuSelect(track: Track, id: string): void {
    if (id === 'subscribe') {
      this.subscribe.emit(track);
    } else if (id === 'unsubscribe') {
      this.unsubscribe.emit(track);
    }
  }

  openDescription(track: Track): void {
    const description = track.trackShare?.description;
    if (!description) return;

    this.infoDialog.open({
      title: this.displayName(track),
      message: description,
    });
  }

  subscriberCount(track: Track): number {
    return track.trackShare?.subscriberCount ?? 0;
  }

  subscriberTitle(track: Track): string {
    const count = this.subscriberCount(track);
    return `${count} ${count === 1 ? 'subscriber' : 'subscribers'}`;
  }

  trackById = (index: number, track: Track): number => track.id ?? index;

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || ('Track #' + track.id);
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
      track.trackShare?.description,
      track.owner?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  private compareTracks(a: Track, b: Track, sortMode: TrackCatalogSortMode): number {
    switch (sortMode) {
      case 'nameDesc':
        return this.compareStrings(this.displayName(b), this.displayName(a));
      case 'ownerAsc':
        return this.compareStrings(this.ownerName(a), this.ownerName(b));
      case 'ownerDesc':
        return this.compareStrings(this.ownerName(b), this.ownerName(a));
      case 'durationAsc':
        return (a.duration ?? Number.MAX_SAFE_INTEGER) - (b.duration ?? Number.MAX_SAFE_INTEGER);
      case 'durationDesc':
        return (b.duration ?? -1) - (a.duration ?? -1);
      case 'subscribersAsc':
        return this.subscriberCount(a) - this.subscriberCount(b);
      case 'subscribersDesc':
        return this.subscriberCount(b) - this.subscriberCount(a);
      case 'nameAsc':
      default:
        return this.compareStrings(this.displayName(a), this.displayName(b));
    }
  }

  private ownerName(track: Track): string {
    return track.owner?.name || '';
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }
}