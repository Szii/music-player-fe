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
  template: `
    <div class="section">
      @if (tracks().length > 0) {
        <ui-list-toolbar
          [(search)]="search"
          searchPlaceholder="Search shared tracks"
          [filterValue]="filterMode()"
          [filterOptions]="filterOptions"
          (filterValueChange)="setFilterMode($event)"
          [sortValue]="sortMode()"
          [sortOptions]="sortOptions"
          (sortValueChange)="setSortMode($event)"
          [filteredCount]="filteredTracks().length"
          [totalCount]="tracks().length"
          itemLabel="track"
        />
      }

      @if (filteredTracks().length > 0) {
        <ui-data-table
          class="app-table-desktop-only"
          [rows]="filteredTracks()"
          [columns]="columns"
          [trackBy]="trackById"
          [maxHeight]="'min(52dvh, 620px)'"
          [tableClass]="'app-table--workshop'"
        >
        <ng-template let-track>
          <tr>
            <td class="col-title">
              <span
                class="cell-text cell-text--strong cell-text--truncate"
                [title]="displayName(track)"
              >
                {{ displayName(track) }}
              </span>
            </td>

            <td class="col-owner">
              <span class="cell-text cell-text--muted">
                {{ track.owner?.name ?? '—' }}
              </span>
            </td>

            <td class="col-duration col-num">
              {{ formatDuration(track.duration) }}
            </td>

            <td class="col-subscribers">
              <span
                class="app-subscriber-stat"
                [title]="subscriberTitle(track)"
                [attr.aria-label]="subscriberTitle(track)"
              >
                <span class="app-subscriber-stat__star" aria-hidden="true">★</span>
                <span class="app-subscriber-stat__count">{{
                  subscriberCount(track)
                }}</span>
              </span>
            </td>

            <td class="col-desc">
              @if (track.trackShare?.description; as description) {
                <button
                  type="button"
                  class="cell-text cell-text--muted cell-text--truncate app-text-button"
                  [title]="description"
                  (click)="openDescription(track)"
                >
                  {{ description }}
                </button>
              } @else {
                <span class="cell-text cell-text--muted">—</span>
              }
            </td>

            <td class="col-status">
              @if (isSubscribed(track)) {
                <ui-chip variant="success" size="sm" shape="hex" [dot]="true">Inscribed</ui-chip>
              } @else {
                <ui-chip variant="gold" size="sm" shape="hex" [dot]="true">Available</ui-chip>
              }
            </td>

            <td class="col-actions">
              <ui-action-menu
                [items]="menuItems(track)"
                [triggerLabel]="'Actions for ' + displayName(track)"
                (select)="onMenuSelect(track, $event)"
              />
            </td>
          </tr>
        </ng-template>
        </ui-data-table>

        <!-- Mobile (< md): condensed list mirroring the table columns. -->
        <ul class="track-catalog-mobile-list app-entity-list" role="list">
          @for (track of filteredTracks(); track trackById($index, track)) {
            <li class="app-entity-list__item">
              <div class="app-entity-list__head">
                <span class="app-entity-list__title" [title]="displayName(track)">
                  {{ displayName(track) }}
                </span>
                @if (isSubscribed(track)) {
                  <ui-chip variant="success" size="sm" shape="hex" [dot]="true">Inscribed</ui-chip>
                } @else {
                  <ui-chip variant="gold" size="sm" shape="hex" [dot]="true">Available</ui-chip>
                }
              </div>

              @if (track.trackShare?.description; as description) {
                <button
                  type="button"
                  class="app-entity-list__subtitle app-text-button"
                  [title]="description"
                  (click)="openDescription(track)"
                >
                  {{ description }}
                </button>
              }

              <div class="app-entity-list__meta track-catalog__mobile-meta">
                <span class="track-catalog__owner">{{ track.owner?.name ?? '—' }}</span>

                <div class="track-catalog__stats-row">
                  <span>{{ formatDuration(track.duration) }}</span>
                  <span
                    class="app-subscriber-stat"
                    [title]="subscriberTitle(track)"
                    [attr.aria-label]="subscriberTitle(track)"
                  >
                    <span class="app-subscriber-stat__star" aria-hidden="true">★</span>
                    <span class="app-subscriber-stat__count">{{
                      subscriberCount(track)
                    }}</span>
                  </span>

                  <ui-action-menu
                    class="track-catalog__menu"
                    [items]="menuItems(track)"
                    [triggerLabel]="'Actions for ' + displayName(track)"
                    (select)="onMenuSelect(track, $event)"
                  />
                </div>
              </div>
            </li>
          }
        </ul>
      } @else if (tracks().length === 0) {
        <p class="app-empty-note">Nothing is published right now.</p>
      } @else {
        <p class="app-empty-note">No tracks match the current search or filter.</p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }

    ui-list-toolbar {
      margin-bottom: 12px;
    }

    .col-subscribers {
      width: 110px;
      max-width: 110px;
      white-space: nowrap;
      text-align: center;
    }

    /* Trim the default 24px header padding so narrow labels (e.g. "Duration")
       don't clip into the neighbouring column. */
    :host ::ng-deep .app-table--workshop th {
      padding-left: 14px;
      padding-right: 14px;
    }

    :host ::ng-deep .app-table--workshop td.col-actions {
      text-align: right;
      /* Breathing room between the kebab and the table's right edge. */
      padding-right: 18px;
    }

    .track-catalog-mobile-list .app-entity-list__item {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }

    .track-catalog-mobile-list .app-entity-list__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px;
      min-width: 0;
      max-width: 100%;
    }

    .track-catalog-mobile-list .app-entity-list__title,
    .track-catalog-mobile-list .app-entity-list__subtitle,
    .track-catalog__owner {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .track-catalog__mobile-meta {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .track-catalog__stats-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .track-catalog__stats-row > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .track-catalog-mobile-list ui-chip {
      justify-self: end;
      max-width: 100%;
    }

    /* Mobile card: duration and subscriber count stay with the kebab menu. */
    .track-catalog__menu {
      margin-left: auto;
      align-self: center;
      flex: 0 0 auto;
    }
  `],
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