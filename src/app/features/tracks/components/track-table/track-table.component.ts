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
    CommonModule,
    FormsModule,
    IconButtonComponent,
    UiSearchBoxComponent,
    UiDataTableComponent,
    UiSelectComponent,
    UiChipComponent,
  ],
  template: `
    <div class="track-table">
      <div *ngIf="loading()" class="app-muted">Loading tracks…</div>

      <ng-container *ngIf="!loading()">
        <div class="track-table-toolbar" *ngIf="tracks().length > 0">
          <ui-search-box
            class="track-table-toolbar__search"
            [value]="search()"
            placeholder="Search tracks"
            (valueChange)="search.set($event)"
          />

          <div class="track-table-toolbar__controls">
            <div class="track-table-toolbar__field">
              <span class="track-table-toolbar__label">Filter</span>
              <ui-select
                [options]="filterOptions"
                [ngModel]="filterMode()"
                [enableSearch]="false"
                [ngModelOptions]="{ standalone: true }"
                (ngModelChange)="filterMode.set($event)"
              />
            </div>

            <div class="track-table-toolbar__field">
              <span class="track-table-toolbar__label">Sort</span>
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

        <div *ngIf="tracks().length > 0" class="track-table-meta">
          {{ filteredTracks().length }} / {{ tracks().length }}
          track{{ tracks().length === 1 ? '' : 's' }}
        </div>

        <p *ngIf="tracks().length === 0" class="app-muted">
          No tracks yet.
        </p>

        <p *ngIf="tracks().length > 0 && filteredTracks().length === 0" class="app-muted">
          No tracks match the current search or filter.
        </p>

        <ui-data-table
          *ngIf="filteredTracks().length > 0"
          [rows]="filteredTracks()"
          [columns]="columns"
          [trackBy]="trackByTrackId"
          [maxHeight]="'var(--track-table-max-height)'"
          [tableClass]="'app-table--tracks'"
        >
          <ng-template let-track>
            <tr [class.track-row--subscribed]="isSubscribed(track)">
              <td class="col-name">
                <span
                  class="cell-text cell-text--strong cell-text--wrap"
                  [title]="displayName(track)"
                >
                  {{ displayName(track) }}
                </span>
              </td>

              <td class="col-original">
                <span
                  class="cell-text cell-text--muted cell-text--truncate"
                  [title]="track.trackOriginalName || ''"
                >
                  {{ track.trackOriginalName || '—' }}
                </span>
              </td>

              <td class="col-owner">
                <span class="cell-text cell-text--muted cell-text--truncate">
                  {{ track.owner?.name || '—' }}
                </span>
              </td>

              <td class="col-duration col-num">
                {{ formatDuration(track.duration) }}
              </td>

              <td class="col-link">
                <a
                  *ngIf="track.trackLink"
                  [href]="track.trackLink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open ↗
                </a>
                <span *ngIf="!track.trackLink" class="app-muted">—</span>
              </td>

              <td class="col-status">
                <ui-chip *ngIf="isSubscribed(track)" variant="success" size="sm" shape="hex" [dot]="true">Subscribed</ui-chip>
                <ui-chip *ngIf="!isSubscribed(track)" variant="gold" size="sm" shape="hex" [dot]="true">Own</ui-chip>
              </td>

              <td class="col-actions">
                <div class="app-actions">
                  <app-icon-button
                    icon="edit"
                    label="Edit track"
                    variant="secondary"
                    size="md"
                    [disabled]="isSubscribed(track)"
                    (clicked)="edit.emit(track)"
                  />

                  <app-icon-button
                    icon="windows"
                    label="Edit track windows"
                    variant="primary"
                    size="md"
                    [disabled]="isSubscribed(track)"
                    (clicked)="windows.emit(track)"
                  />

                  <app-icon-button
                    icon="delete"
                    label="Delete track"
                    variant="danger"
                    size="md"
                    [disabled]="isSubscribed(track)"
                    (clicked)="remove.emit(track)"
                  />
                </div>
              </td>
            </tr>
          </ng-template>
        </ui-data-table>
      </ng-container>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --track-table-max-height: min(52dvh, 680px);
    }

    .track-table {
      display: block;
      min-width: 0;
    }

    .track-table-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin-bottom: 12px;
    }

    .track-table-toolbar__search {
      min-width: 0;
    }

    .track-table-toolbar__controls {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .track-table-toolbar__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 160px;
    }

    .track-table-toolbar__label {
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-heading);
    }

    .track-table-toolbar__select {
      min-width: 0;
    }

    .track-table-meta {
      margin-bottom: 12px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .col-duration,
    .col-link,
    .col-status {
      white-space: nowrap;
    }

    .track-row--subscribed td {
      background: rgba(238, 198, 145, 0.12);
    }

    .track-row--subscribed .cell-text--strong {
      color: var(--app-text-muted);
    }

    @media (max-width: 860px) {
      :host {
        --track-table-max-height: min(55dvh, 640px);
      }

      .track-table-toolbar {
        grid-template-columns: 1fr;
      }

      .track-table-toolbar__controls {
        justify-content: flex-start;
      }

      .app-table--tracks {
        min-width: 1120px;
      }
    }
  `],
})
export class TrackTableComponent {
  readonly tracks = input<Track[]>([]);
  readonly loading = input(false);

  readonly edit = output<Track>();
  readonly remove = output<Track>();
  readonly windows = output<Track>();

  readonly search = signal('');
  readonly filterMode = signal<TrackFilterMode>('own');
  readonly sortMode = signal<TrackSortMode>('nameAsc');

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
    { label: 'Link', className: 'col-link', width: '110px' },
    { label: 'Status', className: 'col-status', width: '170px' },
    { label: 'Actions', className: 'col-actions', width: '200px' },
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

  trackByTrackId = (index: number, track: Track): number | string => track.id ?? index;

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