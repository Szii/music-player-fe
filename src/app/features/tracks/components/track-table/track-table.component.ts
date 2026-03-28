import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';
import { UiTableShellComponent } from '../../../../shared/ui/table-shell/ui-table-shell.component';

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
  imports: [
    CommonModule,
    FormsModule,
    NormalButtonComponent,
    UiSearchBoxComponent,
    UiTableShellComponent,
  ],
  template: `
    <div class="track-table">
      <div *ngIf="loading" class="app-muted">Loading tracks…</div>

      <ng-container *ngIf="!loading">
        <div class="track-table-toolbar" *ngIf="tracks.length > 0">
          <ui-search-box
            class="track-table-toolbar__search"
            [value]="search"
            placeholder="Search tracks"
            (valueChange)="search = $event"
          />

          <div class="track-table-toolbar__controls">
            <label class="track-table-toolbar__field">
              <span class="track-table-toolbar__label">Filter</span>
              <select
                class="app-input track-table-toolbar__select"
                [(ngModel)]="filterMode"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="all">All tracks</option>
                <option value="own">My tracks</option>
                <option value="subscribed">Subscribed</option>
                <option value="withWindows">With windows</option>
                <option value="withoutWindows">Without windows</option>
                <option value="published">Published</option>
              </select>
            </label>

            <label class="track-table-toolbar__field">
              <span class="track-table-toolbar__label">Sort</span>
              <select
                class="app-input track-table-toolbar__select"
                [(ngModel)]="sortMode"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="nameAsc">Name A–Z</option>
                <option value="nameDesc">Name Z–A</option>
                <option value="durationAsc">Duration shortest</option>
                <option value="durationDesc">Duration longest</option>
              </select>
            </label>
          </div>
        </div>

        <div *ngIf="tracks.length > 0" class="track-table-meta">
          {{ filteredTracks.length }} / {{ tracks.length }} track{{ tracks.length === 1 ? '' : 's' }}
        </div>

        <p *ngIf="tracks.length === 0" class="app-muted">
          No tracks yet.
        </p>

        <p *ngIf="tracks.length > 0 && filteredTracks.length === 0" class="app-muted">
          No tracks match the current search or filter.
        </p>

        <ui-table-shell *ngIf="filteredTracks.length > 0" class="track-table-shell">
          <div class="track-table-scroll">
            <table class="app-table app-table--tracks">
              <thead>
                <tr>
                  <th class="col-name">Name</th>
                  <th class="col-original">Original name</th>
                  <th class="col-owner">Owner</th>
                  <th class="col-duration">Duration</th>
                  <th class="col-link">Link</th>
                  <th class="col-status">Status</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  *ngFor="let track of filteredTracks; trackBy: trackByTrackId"
                  [class.track-row--subscribed]="isSubscribed(track)"
                >
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
                    <span *ngIf="isSubscribed(track)" class="track-badge track-badge--subscribed">
                      Subscribed
                    </span>
                    <span *ngIf="!isSubscribed(track)" class="track-badge track-badge--own">
                      Own
                    </span>
                  </td>

                  <td class="col-actions">
                    <div class="app-actions">
                      <normal-button
                        size="sm"
                        variant="secondary"
                        [disabled]="isSubscribed(track)"
                        (clicked)="edit.emit(track)"
                      >
                        Edit
                      </normal-button>

                      <normal-button
                        size="sm"
                        [disabled]="isSubscribed(track)"
                        (clicked)="windows.emit(track)"
                      >
                        Windows
                      </normal-button>

                      <normal-button
                        size="sm"
                        variant="danger"
                        [disabled]="isSubscribed(track)"
                        (clicked)="remove.emit(track)"
                      >
                        Delete
                      </normal-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ui-table-shell>
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
    }

    .track-table-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin-bottom: 5px;
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
      gap: 1px;
      min-width: 160px;
    }

    .track-table-toolbar__label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .track-table-toolbar__select {
      min-width: 0;
    }

    .track-table-meta {
      margin-bottom: 5px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .track-table-shell {
      display: block;
    }

    .track-table-scroll {
      max-height: var(--track-table-max-height);
      overflow-y: auto;
      overflow-x: auto;
      padding-bottom: 2px;
      border-radius: 10px;
    }

    .app-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }

    .app-table thead th {
      position: sticky;
      top: 0;
      z-index: 3;
      background: var(--app-surface-soft, #e7dfd2);
    }

    .col-name { width: 20%; }
    .col-original { width: 24%; }
    .col-owner { width: 14%; }
    .col-duration { width: 10%; white-space: nowrap; }
    .col-link { width: 10%; white-space: nowrap; }
    .col-status { width: 10%; white-space: nowrap; }
    .col-actions { width: 12%; }

    .cell-text {
      display: block;
      min-width: 0;
    }

    .cell-text--wrap {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .cell-text--truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .app-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .col-num {
      white-space: nowrap;
    }

    .track-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .track-badge--subscribed {
      background: var(--app-success-soft);
      color: var(--app-success);
    }

    .track-badge--own {
      background: var(--app-surface-muted);
      color: var(--app-text-muted);
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

      .app-table {
        min-width: 1120px;
      }
    }
  `],
})
export class TrackTableComponent {
  @Input() tracks: Track[] = [];
  @Input() loading = false;

  @Output() edit = new EventEmitter<Track>();
  @Output() remove = new EventEmitter<Track>();
  @Output() windows = new EventEmitter<Track>();

  search = '';
  filterMode: TrackFilterMode = 'own';
  sortMode: TrackSortMode = 'nameAsc';

  get filteredTracks(): Track[] {
    const query = this.search.trim().toLowerCase();

    const filtered = (this.tracks ?? []).filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);
      const matchesFilter = this.matchesFilter(track);
      return matchesSearch && matchesFilter;
    });

    return filtered.sort((a, b) => this.compareTracks(a, b));
  }

  trackByTrackId(index: number, track: Track): number | string {
    return track.id ?? index;
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

  private matchesFilter(track: Track): boolean {
    const subscribed = this.isSubscribed(track);

    switch (this.filterMode) {
      case 'own':
        return !subscribed;
      case 'subscribed':
        return subscribed;
      case 'withWindows':
        return (track.trackWindows?.length ?? 0) > 0;
      case 'withoutWindows':
        return (track.trackWindows?.length ?? 0) === 0;
      case 'published':
        return track.trackShare != null;
      case 'all':
      default:
        return true;
    }
  }

  private compareTracks(a: Track, b: Track): number {
    switch (this.sortMode) {
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