import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { UiIconComponent } from '../../../../shared/ui/icon/ui-icon.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { PreviewButtonComponent } from '../../../../shared/ui/preview-button/preview-button.component';
import { previewMidpointS } from '../../../../shared/utils/preview';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { formatDuration } from '../../../../shared/utils/duration';

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
    UiIconComponent,
    UiDataTableComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiActionMenuComponent,
    PreviewButtonComponent,
    TranslocoPipe,
  ],
  templateUrl: './track-catalog.component.html',
  styleUrl: './track-catalog.component.scss',
})
export class TrackCatalogComponent {
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
  readonly subscribedIds = input<ReadonlySet<string>>(new Set<string>());
  readonly busyTrackId = input<string | null>(null);

  readonly subscribe = output<Track>();
  readonly unsubscribe = output<Track>();

  readonly search = signal('');
  readonly filterMode = persistentSignal<CatalogFilterMode>('mpf:workshop:catalog:filter', 'all');
  readonly sortMode = persistentSignal<TrackCatalogSortMode>('mpf:workshop:catalog:sort', 'nameAsc');

  readonly filterOptions = [
    { label: this.t('tracks.filter.all'), value: 'all' },
    { label: this.t('groups.available'), value: 'available' },
    { label: this.t('tracks.subscribed'), value: 'subscribed' },
  ];

  readonly sortOptions = [
    { label: this.t('sort.nameAsc'), value: 'nameAsc' },
    { label: this.t('sort.nameDesc'), value: 'nameDesc' },
    { label: this.t('sort.ownerAsc'), value: 'ownerAsc' },
    { label: this.t('sort.ownerDesc'), value: 'ownerDesc' },
    { label: this.t('sort.durationAsc'), value: 'durationAsc' },
    { label: this.t('sort.durationDesc'), value: 'durationDesc' },
    { label: this.t('sort.subscribersDesc'), value: 'subscribersDesc' },
    { label: this.t('sort.subscribersAsc'), value: 'subscribersAsc' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('tracks.col.track'), className: 'col-title' },
    { label: this.t('tracks.owner'), className: 'col-owner', width: '16%' },
    { label: this.t('tracks.col.duration'), className: 'col-duration', width: '100px' },
    { label: this.t('workshop.subscribers'), className: 'col-subscribers', width: '110px' },
    { label: this.t('workshop.description'), className: 'col-desc' },
    { label: this.t('tracks.col.status'), className: 'col-status', width: '140px' },
    { label: '', className: 'col-actions', width: '104px' },
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
      return [{ id: 'unsubscribe', label: this.t('workshop.unsubscribe'), variant: 'danger', disabled: busy }];
    }

    return [{ id: 'subscribe', label: this.t('workshop.subscribe'), disabled: busy }];
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
    return this.t('workshop.subscriberCount', { count });
  }

  trackById = (index: number, track: Track): string | number => track.id ?? index;

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || this.t('common.trackNum', { id: track.id });
  }

  /** Preview from the middle of the track. */
  previewStartS(track: Track): number {
    return previewMidpointS(track.duration);
  }

  formatDuration(seconds?: number): string {
    return formatDuration(seconds);
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