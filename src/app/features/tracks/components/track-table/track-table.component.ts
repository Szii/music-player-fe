import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
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
  ],
  template: `
    <div class="track-table">
      @if (loading()) {
        <div class="app-muted">Loading tracks…</div>
      } @else {
        @if (tracks().length > 0) {
          <ui-list-toolbar
            [(search)]="search"
            searchPlaceholder="Search tracks"
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

        @if (tracks().length === 0) {
          <p class="app-muted">No tracks yet.</p>
        }

        @if (tracks().length > 0 && filteredTracks().length === 0) {
          <p class="app-muted">No tracks match the current search or filter.</p>
        }

        @if (filteredTracks().length > 0) {
          <!-- Desktop / tablet (≥ md): full data table -->
          <ui-data-table
            class="app-table-desktop-only"
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

                <td class="col-status">
                  @if (isSubscribed(track)) {
                    <ui-chip variant="success" size="sm" shape="hex" [dot]="true">Subscribed</ui-chip>
                  } @else {
                    <ui-chip variant="gold" size="sm" shape="hex" [dot]="true">Own</ui-chip>
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

          <!-- Mobile (< md): condensed list. Per NN/g / UXmatters: a bold
               primary value, secondary data stacked beneath, long text
               truncated with an ellipsis to signal it continues. -->
          <ul class="app-entity-list" role="list">
            @for (track of filteredTracks(); track trackByTrackId($index, track)) {
              <li
                class="app-entity-list__item"
                [class.is-subscribed]="isSubscribed(track)"
              >
                <div class="app-entity-list__head">
                  <span class="app-entity-list__title" [title]="displayName(track)">
                    {{ displayName(track) }}
                  </span>
                  @if (isSubscribed(track)) {
                    <ui-chip variant="success" size="sm" shape="hex" [dot]="true">Subscribed</ui-chip>
                  } @else {
                    <ui-chip variant="gold" size="sm" shape="hex" [dot]="true">Own</ui-chip>
                  }
                </div>

                @if (track.trackOriginalName) {
                  <span class="app-entity-list__subtitle" [title]="track.trackOriginalName">
                    {{ track.trackOriginalName }}
                  </span>
                }

                <div class="app-entity-list__meta">
                  <span>{{ track.owner?.name || '—' }}</span>
                  <span class="app-entity-list__sep" aria-hidden="true">·</span>
                  <span>{{ formatDuration(track.duration) }}</span>
                  <!-- "Open" is intentionally omitted here: it's already in the
                       kebab menu (menuItems adds "Open source ↗"). -->

                  <ui-action-menu
                    class="track-item__menu"
                    [items]="menuItems(track)"
                    [triggerLabel]="'Actions for ' + displayName(track)"
                    (select)="onMenuSelect(track, $event)"
                  />
                </div>
              </li>
            }
          </ul>
        }
      }
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

    ui-list-toolbar {
      margin-bottom: 12px;
    }

    .col-duration,
    .col-status {
      white-space: nowrap;
    }

    /* Desktop data-table alignment, scoped to this table so other tables keep
       their own conventions. Best practice for tabular data: text columns are
       left-aligned, numeric columns right-aligned (digits line up and are
       easy to compare); the header label matches its column's alignment.
       Trimmed horizontal padding also stops narrow headers from clipping. */
    :host ::ng-deep .app-table--tracks th,
    :host ::ng-deep .app-table--tracks td {
      padding-left: 16px;
      padding-right: 16px;
    }

    :host ::ng-deep .app-table--tracks th.col-name,
    :host ::ng-deep .app-table--tracks th.col-original,
    :host ::ng-deep .app-table--tracks th.col-owner,
    :host ::ng-deep .app-table--tracks td.col-owner {
      text-align: left;
    }

    :host ::ng-deep .app-table--tracks th.col-duration,
    :host ::ng-deep .app-table--tracks td.col-duration {
      text-align: right;
    }

    :host ::ng-deep .app-table--tracks th.col-actions,
    :host ::ng-deep .app-table--tracks td.col-actions {
      text-align: center;
    }

    /* Mobile card: kebab menu sits in the top-right of the meta row. */
    .track-item__menu {
      margin-left: auto;
      align-self: center;
    }

    .track-row--subscribed td {
      background: rgba(238, 198, 145, 0.12);
    }

    .track-row--subscribed .cell-text--strong {
      color: var(--app-text-muted);
    }

    /* Mobile list shape lives in the shared .app-entity-list primitive;
       only the subscribed-state tint is track-specific. */
    .app-entity-list__item.is-subscribed {
      background: rgba(238, 198, 145, 0.12);
    }

    .app-entity-list__item.is-subscribed .app-entity-list__title {
      color: var(--app-text-muted);
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
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:tracks:filter', 'own');
  readonly sortMode = persistentSignal<TrackSortMode>('mpf:tracks:sort', 'nameAsc');

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
    { label: 'Status', className: 'col-status', width: '150px' },
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
      { id: 'edit', label: 'Edit track', disabled: subscribed },
      { id: 'windows', label: 'Edit windows', disabled: subscribed },
    ];

    if (track.trackLink) {
      items.push({ id: 'open', label: 'Open source ↗', href: track.trackLink });
    }

    items.push({ id: 'delete', label: 'Delete track', variant: 'danger', disabled: subscribed });

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