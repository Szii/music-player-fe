import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Track } from '../../../../api/generated';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';

type CatalogFilterMode = 'all' | 'available' | 'subscribed';

type TrackCatalogSortMode =
  | 'nameAsc'
  | 'nameDesc'
  | 'ownerAsc'
  | 'ownerDesc'
  | 'durationAsc'
  | 'durationDesc';

@Component({
  selector: 'app-track-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IconButtonComponent,
    UiDataTableComponent,
    UiListToolbarComponent,
    UiChipComponent,
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

            <td class="col-desc">
              <span
                class="cell-text cell-text--muted cell-text--truncate"
                [title]="track.trackShare?.description || ''"
              >
                {{ track.trackShare?.description || '—' }}
              </span>
            </td>

            <td class="col-status">
              @if (isSubscribed(track)) {
                <ui-chip variant="success" size="sm" shape="hex" [dot]="true">Inscribed</ui-chip>
              } @else {
                <ui-chip variant="gold" size="sm" shape="hex" [dot]="true">Available</ui-chip>
              }
            </td>

            <td class="col-actions">
              <div class="app-actions">
                @if (!isSubscribed(track)) {
                  <app-icon-button
                    icon="bookmark"
                    variant="secondary"
                    size="md"
                    label="Subscribe"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="subscribe.emit(track)"
                  />
                } @else {
                  <app-icon-button
                    icon="bookmark-remove"
                    variant="danger"
                    size="md"
                    label="Unsubscribe"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="unsubscribe.emit(track)"
                  />
                }
              </div>
            </td>
          </tr>
        </ng-template>
        </ui-data-table>

        <!-- Mobile (< md): condensed list mirroring the table columns. -->
        <ul class="app-entity-list" role="list">
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
                <span class="app-entity-list__subtitle" [title]="description">
                  {{ description }}
                </span>
              }

              <div class="app-entity-list__meta">
                <span>{{ track.owner?.name ?? '—' }}</span>
                <span class="app-entity-list__sep" aria-hidden="true">·</span>
                <span>{{ formatDuration(track.duration) }}</span>
              </div>

              <div class="app-actions app-entity-list__actions">
                @if (!isSubscribed(track)) {
                  <app-icon-button
                    icon="bookmark"
                    variant="secondary"
                    size="md"
                    label="Subscribe"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="subscribe.emit(track)"
                  />
                } @else {
                  <app-icon-button
                    icon="bookmark-remove"
                    variant="danger"
                    size="md"
                    label="Unsubscribe"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="unsubscribe.emit(track)"
                  />
                }
              </div>
            </li>
          }
        </ul>
      } @else if (tracks().length === 0) {
        <p class="empty">Nothing is published right now.</p>
      } @else {
        <p class="empty">No tracks match the current search or filter.</p>
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

    .empty {
      color: var(--app-text-muted);
      font-size: 13px;
      font-style: italic;
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
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: 'Track', className: 'col-title' },
    { label: 'Owner', className: 'col-owner', width: '16%' },
    { label: 'Duration', className: 'col-duration', width: '90px' },
    { label: 'Description', className: 'col-desc' },
    { label: 'Status', className: 'col-status', width: '140px' },
    { label: 'Actions', className: 'col-actions', width: '120px' },
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

  isSubscribed(track: Track): boolean {
    return track.id != null && this.subscribedIds().has(track.id);
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