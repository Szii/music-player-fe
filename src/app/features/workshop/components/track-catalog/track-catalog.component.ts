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
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';

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
    NormalButtonComponent,
    UiDataTableComponent,
    UiSearchBoxComponent,
    UiSelectComponent,
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
              <span *ngIf="isSubscribed(track)" class="badge badge--success">
                <span class="badge__dot" aria-hidden="true"></span>Inscribed
              </span>
              <span *ngIf="!isSubscribed(track)" class="badge badge--muted">
                <span class="badge__dot" aria-hidden="true"></span>Available
              </span>
            </td>

            <td class="col-actions">
              <div class="app-actions">
                <normal-button
                  *ngIf="!isSubscribed(track)"
                  size="sm"
                  [disabled]="busyTrackId() === track.id"
                  (clicked)="subscribe.emit(track)"
                >
                  Subscribe
                </normal-button>

                <normal-button
                  *ngIf="isSubscribed(track)"
                  size="sm"
                  variant="danger"
                  [disabled]="busyTrackId() === track.id"
                  (clicked)="unsubscribe.emit(track)"
                >
                  Unsubscribe
                </normal-button>
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

    .badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px 10px;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      border-radius: var(--app-radius-xs);
      clip-path: polygon(8px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0% 50%);
      margin: 0 auto;
    }

    .badge__dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .badge--success {
      background: linear-gradient(135deg, #2e5e24 0%, #3a7a2e 100%);
      color: #d8f0c8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.15),
        0 2px 6px rgba(46, 94, 36, 0.4);
    }

    .badge--success .badge__dot {
      background: #8fdd6a;
      box-shadow: 0 0 4px rgba(143, 221, 106, 0.8);
    }

    .badge--muted {
      background: linear-gradient(135deg, #5a3e20 0%, #7a5228 100%);
      color: #e8d8b8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 2px 6px rgba(60, 30, 10, 0.35);
    }

    .badge--muted .badge__dot {
      background: #c9a44c;
      box-shadow: 0 0 4px rgba(201, 164, 76, 0.6);
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
    { label: 'Status', className: 'col-status', width: '110px' },
    { label: 'Actions', className: 'col-actions', width: '150px' },
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