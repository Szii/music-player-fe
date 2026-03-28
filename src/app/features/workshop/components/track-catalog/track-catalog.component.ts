import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiTableShellComponent } from '../../../../shared/ui/table-shell/ui-table-shell.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';

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
    UiTableShellComponent,
    UiSearchBoxComponent,
  ],
  template: `
    <div class="section">
      <div class="section__header">
        <h2 class="section__title">Browse shared tracks</h2>
        <p class="section__desc">
          Tracks published by other users. Subscribe to use them in your groups and boards (read-only).
        </p>
      </div>

      <div *ngIf="tracks.length > 0" class="catalog-toolbar">
        <ui-search-box
          class="catalog-toolbar__search"
          [value]="search"
          placeholder="Search shared tracks"
          (valueChange)="search = $event"
        />

        <div class="catalog-toolbar__controls">
          <label class="catalog-toolbar__field">
            <span class="catalog-toolbar__label">Filter</span>
            <select
              class="app-input catalog-toolbar__select"
              [(ngModel)]="filterMode"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="all">All tracks</option>
              <option value="available">Available</option>
              <option value="subscribed">Subscribed</option>
            </select>
          </label>

          <label class="catalog-toolbar__field">
            <span class="catalog-toolbar__label">Sort</span>
            <select
              class="app-input catalog-toolbar__select"
              [(ngModel)]="sortMode"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="nameAsc">Name A–Z</option>
              <option value="nameDesc">Name Z–A</option>
              <option value="ownerAsc">Owner A–Z</option>
              <option value="ownerDesc">Owner Z–A</option>
              <option value="durationAsc">Duration shortest</option>
              <option value="durationDesc">Duration longest</option>
            </select>
          </label>
        </div>
      </div>

      <div *ngIf="tracks.length > 0" class="catalog-meta">
        {{ filteredTracks.length }} / {{ tracks.length }} track{{ tracks.length === 1 ? '' : 's' }}
      </div>

      <div *ngIf="filteredTracks.length > 0; else emptyOrNoMatch" class="section__table-wrap">
        <ui-table-shell [maxHeight]="'min(42dvh, 520px)'">
          <table class="app-table app-table--workshop">
            <thead>
              <tr>
                <th class="col-title">Track</th>
                <th class="col-owner">Owner</th>
                <th class="col-duration">Duration</th>
                <th class="col-desc">Description</th>
                <th class="col-status">Status</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              <tr *ngFor="let track of filteredTracks; trackBy: trackById">
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
                  <span *ngIf="isSubscribed(track)" class="badge badge--success">Subscribed</span>
                  <span *ngIf="!isSubscribed(track)" class="badge badge--muted">Available</span>
                </td>

                <td class="col-actions">
                  <div class="app-actions">
                    <normal-button
                      *ngIf="!isSubscribed(track)"
                      size="sm"
                      [disabled]="busyTrackId === track.id"
                      (clicked)="subscribe.emit(track)"
                    >
                      Subscribe
                    </normal-button>

                    <normal-button
                      *ngIf="isSubscribed(track)"
                      size="sm"
                      variant="danger"
                      [disabled]="busyTrackId === track.id"
                      (clicked)="unsubscribe.emit(track)"
                    >
                      Unsubscribe
                    </normal-button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </ui-table-shell>
      </div>

      <ng-template #emptyOrNoMatch>
        <p *ngIf="tracks.length === 0" class="empty">Nothing is published right now.</p>
        <p *ngIf="tracks.length > 0" class="empty">No tracks match the current search or filter.</p>
      </ng-template>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }

    .section__header {
      margin-bottom: 1rem;
    }

    .section__title {
      margin: 0 0 0.25rem;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--app-text);
    }

    .section__desc {
      margin: 0;
      font-size: 0.85rem;
      color: var(--app-text-muted);
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
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .catalog-toolbar__select {
      min-width: 0;
    }

    .catalog-meta {
      margin-bottom: 12px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .section__table-wrap {
      min-width: 0;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge--success {
      background: var(--app-success-soft);
      color: var(--app-success);
    }

    .badge--muted {
      background: var(--app-surface-muted);
      color: var(--app-text-muted);
    }

    .empty {
      color: var(--app-text-muted);
      font-size: 13px;
      font-style: italic;
    }

    .app-table--workshop .col-title {
      width: 24%;
    }

    .app-table--workshop .col-owner {
      width: 16%;
    }

    .app-table--workshop .col-duration {
      width: 90px;
      white-space: nowrap;
    }

    .app-table--workshop .col-desc {
      width: 28%;
    }

    .app-table--workshop .col-status {
      width: 110px;
      white-space: nowrap;
    }

    .app-table--workshop .col-actions {
      width: 150px;
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
  @Input() tracks: Track[] = [];
  @Input() subscribedIds = new Set<number>();
  @Input() busyTrackId: number | null = null;

  @Output() subscribe = new EventEmitter<Track>();
  @Output() unsubscribe = new EventEmitter<Track>();

  search = '';
  filterMode: CatalogFilterMode = 'all';
  sortMode: TrackCatalogSortMode = 'nameAsc';

  get filteredTracks(): Track[] {
    const query = this.search.trim().toLowerCase();

    const filtered = (this.tracks ?? []).filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);
      const subscribed = this.isSubscribed(track);

      const matchesFilter =
        this.filterMode === 'all' ||
        (this.filterMode === 'available' && !subscribed) ||
        (this.filterMode === 'subscribed' && subscribed);

      return matchesSearch && matchesFilter;
    });

    return filtered.sort((a, b) => this.compareTracks(a, b));
  }

  isSubscribed(track: Track): boolean {
    return track.id != null && this.subscribedIds.has(track.id);
  }

  trackById(index: number, track: Track): number {
    return track.id ?? index;
  }

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

  private compareTracks(a: Track, b: Track): number {
    switch (this.sortMode) {
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