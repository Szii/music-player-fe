import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';

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
    FormsModule,
    IconButtonComponent,
    UiDataTableComponent,
    UiSearchBoxComponent,
    UiSelectComponent,
    UiChipComponent,
  ],
  template: `
    <div class="section">
      <div *ngIf="tracks().length > 0" class="catalog-toolbar">
        <ui-search-box
          class="catalog-toolbar__search"
          [value]="search()"
          placeholder="Search shared tracks"
          (valueChange)="search.set($event)"
        />

        <div class="catalog-toolbar__controls">
          <div class="catalog-toolbar__field">
            <span class="catalog-toolbar__label">Filter</span>
            <ui-select
              [options]="filterOptions"
              [ngModel]="filterMode()"
              [enableSearch]="false"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="filterMode.set($event)"
            />
          </div>

          <div class="catalog-toolbar__field">
            <span class="catalog-toolbar__label">Sort</span>
            <ui-select
              [options]="sortOptions"
              [ngModel]="sortMode()"
              [enableSearch]="false"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="sortMode.set($event)"
            />
          </div>
        </div>
      </div>

      <div *ngIf="tracks().length > 0" class="catalog-meta">
        {{ filteredTracks().length }} / {{ tracks().length }}
        track{{ tracks().length === 1 ? '' : 's' }}
      </div>

      <ui-data-table
        *ngIf="filteredTracks().length > 0; else emptyOrNoMatch"
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
              <ui-chip *ngIf="isSubscribed(track)" variant="success" size="sm" shape="hex" [dot]="true">Inscribed</ui-chip>
              <ui-chip *ngIf="!isSubscribed(track)" variant="gold" size="sm" shape="hex" [dot]="true">Available</ui-chip>
            </td>

            <td class="col-actions">
              <div class="app-actions">
                <app-icon-button
                  *ngIf="!isSubscribed(track)"
                  icon="bookmark"
                  variant="secondary"
                  size="md"
                  label="Subscribe"
                  [disabled]="busyTrackId() === track.id"
                  (clicked)="subscribe.emit(track)"
                />

                <app-icon-button
                  *ngIf="isSubscribed(track)"
                  icon="bookmark-remove"
                  variant="danger"
                  size="md"
                  label="Unsubscribe"
                  [disabled]="busyTrackId() === track.id"
                  (clicked)="unsubscribe.emit(track)"
                />
              </div>
            </td>
          </tr>
        </ng-template>
      </ui-data-table>

      <ng-template #emptyOrNoMatch>
        <p *ngIf="tracks().length === 0" class="empty">Nothing is published right now.</p>
        <p *ngIf="tracks().length > 0" class="empty">No tracks match the current search or filter.</p>
      </ng-template>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }

    .catalog-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin-bottom: 12px;
    }

    .catalog-toolbar__search {
      min-width: 0;
    }

    .catalog-toolbar__controls {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .catalog-toolbar__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 160px;
    }

    .catalog-toolbar__label {
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-heading);
    }

    .catalog-toolbar__select {
      min-width: 0;
    }

    .catalog-meta {
      margin-bottom: 12px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .empty {
      color: var(--app-text-muted);
      font-size: 13px;
      font-style: italic;
    }

    @media (max-width: 900px) {
      .catalog-toolbar {
        grid-template-columns: 1fr;
      }

      .catalog-toolbar__controls {
        justify-content: flex-start;
      }

      .app-table--workshop {
        min-width: 880px;
      }
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
  readonly filterMode = signal<CatalogFilterMode>('all');
  readonly sortMode = signal<TrackCatalogSortMode>('nameAsc');

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
    { label: 'Status', className: 'col-status', width: '170px' },
    { label: 'Actions', className: 'col-actions', width: '110px' },
  ];

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