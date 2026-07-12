import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
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
    TranslocoPipe,
  ],
  templateUrl: './track-table.component.html',
  styleUrl: './track-table.component.scss',
})
export class TrackTableComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly tracks = input<Track[]>([]);
  readonly loading = input(false);

  readonly edit = output<Track>();
  readonly remove = output<Track>();
  readonly windows = output<Track>();

  readonly search = signal('');
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:tracks:filter', 'all');
  readonly sortMode = persistentSignal<TrackSortMode>('mpf:tracks:sort', 'nameAsc');

  readonly filterOptions = [
    { label: this.t('tracks.filter.all'), value: 'all' },
    { label: this.t('tracks.filter.own'), value: 'own' },
    { label: this.t('tracks.subscribed'), value: 'subscribed' },
    { label: this.t('tracks.filter.withWindows'), value: 'withWindows' },
    { label: this.t('tracks.filter.withoutWindows'), value: 'withoutWindows' },
    { label: this.t('tracks.filter.published'), value: 'published' },
  ];

  readonly sortOptions = [
    { label: this.t('sort.nameAsc'), value: 'nameAsc' },
    { label: this.t('sort.nameDesc'), value: 'nameDesc' },
    { label: this.t('sort.durationAsc'), value: 'durationAsc' },
    { label: this.t('sort.durationDesc'), value: 'durationDesc' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('tracks.col.name'), className: 'col-name', width: '180px' },
    { label: this.t('tracks.original'), className: 'col-original' },
    { label: this.t('tracks.owner'), className: 'col-owner', width: '120px' },
    { label: this.t('tracks.col.duration'), className: 'col-duration', width: '110px' },
    { label: this.t('tracks.col.status'), className: 'col-status', width: '150px' },
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
      { id: 'edit', label: this.t('tracks.edit'), disabled: subscribed },
      { id: 'windows', label: this.t('tracks.editWindows'), disabled: subscribed },
    ];

    if (track.trackLink) {
      items.push({ id: 'open', label: this.t('tracks.openSource'), href: track.trackLink });
    }

    items.push({ id: 'delete', label: this.t('tracks.delete'), variant: 'danger', disabled: subscribed });

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