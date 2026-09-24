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
import {
  UiSegmentedComponent,
  UiSegmentedOption,
} from '../../../../shared/ui/segmented/ui-segmented.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';
import { PreviewButtonComponent } from '../../../../shared/ui/preview-button/preview-button.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { previewMidpointS } from '../../../../shared/utils/preview';
import { formatDuration } from '../../../../shared/utils/duration';

type TrackFilterMode = 'all' | 'withWindows' | 'withoutWindows';

type TrackSortMode = 'nameAsc' | 'nameDesc' | 'durationAsc' | 'durationDesc';

type TrackScope = 'session' | 'library';

type SessionMembership = 'direct' | 'viaGroup' | null;

@Component({
  selector: 'app-track-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UiDataTableComponent,
    UiListToolbarComponent,
    UiSegmentedComponent,
    UiChipComponent,
    UiActionMenuComponent,
    PreviewButtonComponent,
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
  readonly sessionName = input<string | null>(null);
  readonly sessionTrackIds = input<ReadonlySet<string>>(new Set());
  readonly scopedTrackIds = input<ReadonlySet<string>>(new Set());

  readonly edit = output<Track>();
  readonly remove = output<Track>();
  readonly windows = output<Track>();
  readonly addToSession = output<Track>();
  readonly removeFromSession = output<Track>();

  readonly search = signal('');
  readonly scope = persistentSignal<TrackScope>('mpf:tracks:scope', 'session');

  readonly effectiveScope = computed<TrackScope>(() =>
    this.sessionName() == null ? 'library' : this.scope(),
  );

  readonly scopeOptions = computed<UiSegmentedOption<TrackScope>[] | null>(() => {
    const name = this.sessionName();
    if (name == null) return null;
    return [
      { label: name, value: 'session', title: this.t('scope.sessionTip') },
      { label: this.t('scope.library'), value: 'library', title: this.t('scope.libraryTip') },
    ];
  });
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:tracks:filter', 'all');
  readonly sortMode = persistentSignal<TrackSortMode>('mpf:tracks:sort', 'nameAsc');

  readonly filterOptions = [
    { label: this.t('tracks.filter.all'), value: 'all' },
    { label: this.t('tracks.filter.withWindows'), value: 'withWindows' },
    { label: this.t('tracks.filter.withoutWindows'), value: 'withoutWindows' },
  ];

  readonly sortOptions = [
    { label: this.t('sort.nameAsc'), value: 'nameAsc' },
    { label: this.t('sort.nameDesc'), value: 'nameDesc' },
    { label: this.t('sort.durationAsc'), value: 'durationAsc' },
    { label: this.t('sort.durationDesc'), value: 'durationDesc' },
  ];

  readonly showStatus = computed(() =>
    this.filteredTracks().some(track => this.showSessionBadge(track)),
  );

  readonly columns = computed<UiDataTableColumn[]>(() => [
    { label: this.t('tracks.col.name'), className: 'col-name' },
    { label: this.t('tracks.original'), className: 'col-original', width: '30%' },
    { label: this.t('tracks.col.duration'), className: 'col-duration', width: '110px' },
    ...(this.showStatus()
      ? [{ label: this.t('tracks.col.status'), className: 'col-status', width: '150px' }]
      : []),
    { label: '', className: 'col-actions', width: '96px' },
  ]);

  readonly scopeTotal = computed(() => {
    if (this.effectiveScope() === 'library') return this.tracks().length;
    const scoped = this.scopedTrackIds();
    return this.tracks().filter(track => track.id != null && scoped.has(track.id)).length;
  });

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filterMode();
    const sort = this.sortMode();
    const sessionOnly = this.effectiveScope() === 'session';
    const scoped = this.scopedTrackIds();

    const filtered = this.tracks().filter(track => {
      const matchesScope = !sessionOnly || (track.id != null && scoped.has(track.id));
      const matchesSearch = !query || this.matchesSearch(track, query);
      const matchesFilter = this.matchesFilter(track, filter);
      return matchesScope && matchesSearch && matchesFilter;
    });

    return [...filtered].sort((a, b) => this.compareTracks(a, b, sort));
  });

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as TrackFilterMode);
  }

  setSortMode(value: unknown): void {
    this.sortMode.set(value as TrackSortMode);
  }

  setScope(value: TrackScope): void {
    this.scope.set(value);
  }

  showSessionBadge(track: Track): boolean {
    return this.effectiveScope() === 'library' && this.membership(track) != null;
  }

  membership(track: Track): SessionMembership {
    if (this.sessionName() == null || track.id == null) return null;
    if (this.sessionTrackIds().has(track.id)) return 'direct';
    return this.scopedTrackIds().has(track.id) ? 'viaGroup' : null;
  }

  trackByTrackId = (index: number, track: Track): number | string => track.id ?? index;

  menuItems(track: Track): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      { id: 'edit', label: this.t('tracks.edit') },
      { id: 'windows', label: this.t('tracks.editWindows') },
    ];

    if (track.trackLink) {
      items.push({ id: 'open', label: this.t('tracks.openSource'), href: track.trackLink });
    }

    if (this.sessionName() != null) {
      items.push(
        this.membership(track) != null
          ? { id: 'removeFromSession', label: this.t('scope.removeFromSession') }
          : { id: 'addToSession', label: this.t('scope.addToSession') },
      );
    }

    items.push({ id: 'delete', label: this.t('tracks.delete'), variant: 'danger' });

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
      case 'addToSession':
        this.addToSession.emit(track);
        break;
      case 'removeFromSession':
        this.removeFromSession.emit(track);
        break;
    }
  }

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || '—';
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
      track.trackLink,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  private matchesFilter(track: Track, filterMode: TrackFilterMode): boolean {
    switch (filterMode) {
      case 'withWindows':
        return (track.trackWindows?.length ?? 0) > 0;
      case 'withoutWindows':
        return (track.trackWindows?.length ?? 0) === 0;
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