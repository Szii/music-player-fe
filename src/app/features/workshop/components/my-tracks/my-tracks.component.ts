import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { InfoDialogService } from '../../../../shared/features/info-dialog/info-dialog.service';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';

export interface PublishEvent {
  track: Track;
  description: string;
}

type PublishFilterMode = 'all' | 'published' | 'unpublished';

@Component({
  selector: 'app-my-tracks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NormalButtonComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiDialogShellComponent,
    UiDataTableComponent,
    UiCharCounterComponent,
    UiActionMenuComponent,
  ],
  template: `
    <ui-dialog-shell
      title="My tracks"
      subtitle="Publish your tracks so other users can find and subscribe to them."
      titleId="my-tracks-title"
      size="wide"
      (closed)="close.emit()"
    >
      @if (tracks().length > 0) {
        <ui-list-toolbar
          [(search)]="search"
          searchPlaceholder="Search tracks by name"
          [filterValue]="filterMode()"
          [filterOptions]="filterOptions"
          filterLabel="Status"
          (filterValueChange)="setFilterMode($event)"
          [filteredCount]="filteredTracks().length"
          [totalCount]="tracks().length"
          itemLabel="track"
        />
      }

      @if (filteredTracks().length > 0) {
        <ui-data-table
          class="my-tracks-table"
          [rows]="filteredTracks()"
          [columns]="columns"
          [trackBy]="trackById"
          [maxHeight]="'min(58dvh, 680px)'"
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

                @if (track.trackShare?.description; as description) {
                  <button
                    type="button"
                    class="cell-text cell-text--muted cell-text--truncate my-tracks__desktop-desc desc-button"
                    [title]="description"
                    (click)="openDescription(track)"
                  >
                    {{ description }}
                  </button>
                }
              </td>

              <td class="col-duration col-num">
                {{ formatDuration(track.duration) }}
              </td>

              <td class="col-subscribers">
                @if (track.trackShare) {
                  <span
                    class="subscriber-stat"
                    [title]="subscriberTitle(track)"
                    [attr.aria-label]="subscriberTitle(track)"
                  >
                    <span class="subscriber-stat__star" aria-hidden="true">★</span>
                    <span class="subscriber-stat__count">{{
                      subscriberCount(track)
                    }}</span>
                  </span>
                } @else {
                  <span class="cell-text cell-text--muted" aria-hidden="true">—</span>
                }
              </td>

              <td class="col-status">
                <ui-chip
                  [variant]="track.trackShare ? 'success' : 'gold'"
                  size="sm"
                  shape="hex"
                  [dot]="true"
                >
                  {{ track.trackShare ? 'Published' : 'Unpublished' }}
                </ui-chip>
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

        <ul class="my-tracks-mobile-list app-entity-list" role="list">
          @for (track of filteredTracks(); track trackById($index, track)) {
            <li class="app-entity-list__item">
              <div class="app-entity-list__head">
                <span class="app-entity-list__title" [title]="displayName(track)">
                  {{ displayName(track) }}
                </span>

                <ui-chip
                  [variant]="track.trackShare ? 'success' : 'gold'"
                  size="sm"
                  shape="hex"
                  [dot]="true"
                >
                  {{ track.trackShare ? 'Published' : 'Unpublished' }}
                </ui-chip>
              </div>

              @if (track.trackShare?.description; as description) {
                <button
                  type="button"
                  class="app-entity-list__subtitle desc-button"
                  [title]="description"
                  (click)="openDescription(track)"
                >
                  {{ description }}
                </button>
              }

              <div class="app-entity-list__meta">
                <span>{{ formatDuration(track.duration) }}</span>

                @if (track.trackShare) {
                  <span
                    class="subscriber-stat"
                    [title]="subscriberTitle(track)"
                    [attr.aria-label]="subscriberTitle(track)"
                  >
                    <span class="subscriber-stat__star" aria-hidden="true">★</span>
                    <span class="subscriber-stat__count">{{
                      subscriberCount(track)
                    }}</span>
                  </span>
                }

                <ui-action-menu
                  class="my-tracks__menu"
                  [items]="menuItems(track)"
                  [triggerLabel]="'Actions for ' + displayName(track)"
                  (select)="onMenuSelect(track, $event)"
                />
              </div>
            </li>
          }
        </ul>
      } @else if (tracks().length === 0) {
        <div class="my-tracks__empty">
          <p class="my-tracks__empty-title">No tracks yet</p>
          <p class="my-tracks__empty-msg">
            Add a track first, then you can publish it here for other users to
            find and subscribe to.
          </p>

          <div class="my-tracks__empty-actions">
            <normal-button type="button" (clicked)="addTrack.emit()">
              Add a track
            </normal-button>
          </div>
        </div>
      } @else {
        <p class="empty">No tracks match the current search or filter.</p>
      }
    </ui-dialog-shell>

    @if (publishTrack()) {
      <ui-dialog-shell
        title="Publish track"
        titleId="publish-track-title"
        [showFooter]="true"
        (closed)="closePublish()"
      >
        <div class="publish-form">
          <p class="publish-form__track-name">
            {{ publishTrack()!.trackName || publishTrack()!.trackOriginalName }}
          </p>

          <div class="publish-form__field">
            <label class="app-form-label">
              Description <span class="optional">(optional)</span>
            </label>

            <input
              class="app-input"
              type="text"
              [ngModel]="publishDesc()"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="publishDesc.set($event)"
              placeholder="What is this track for?"
              [maxlength]="descriptionMaxLength"
            />
            <ui-char-counter
              [current]="publishDesc().length"
              [max]="descriptionMaxLength"
            />
          </div>
        </div>

        <ng-container dialog-footer>
          <normal-button
            type="button"
            variant="secondary"
            (clicked)="closePublish()"
          >
            Cancel
          </normal-button>

          <normal-button
            type="button"
            (clicked)="confirmPublish()"
          >
            Publish
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      container-type: inline-size;
      container-name: my-tracks;
    }

    ui-list-toolbar {
      display: block;
      margin-bottom: 12px;
    }

    .my-tracks-table {
      display: block !important;
      min-width: 0;
      max-width: 100%;
    }

    .my-tracks-mobile-list {
      display: none !important;
    }

    .my-tracks-table ::ng-deep table {
      width: 100%;
      table-layout: fixed;
    }

    .my-tracks-table ::ng-deep th,
    .my-tracks-table ::ng-deep td {
      min-width: 0;
      overflow: hidden;
    }

    /* Trim the default 24px header padding so narrow labels (e.g. "Duration")
       don't clip into the neighbouring column. */
    .my-tracks-table ::ng-deep th,
    .my-tracks-table ::ng-deep td.col-duration,
    .my-tracks-table ::ng-deep td.col-subscribers {
      padding-left: 14px;
      padding-right: 14px;
    }

    .my-tracks__desktop-desc {
      display: block;
      margin-top: 3px;
      font-size: 0.82rem;
    }

    /* Description rendered as a button so the full text can be opened in a
       dialog when it is truncated. Looks like inline text, behaves like a link. */
    .desc-button {
      appearance: none;
      border: 0;
      background: none;
      padding: 0;
      margin: 0;
      font: inherit;
      text-align: left;
      width: 100%;
      max-width: 100%;
      cursor: pointer;
      color: inherit;
    }

    .desc-button:hover {
      text-decoration: underline;
    }

    .desc-button:focus-visible {
      outline: 2px solid var(--app-secondary);
      outline-offset: 2px;
      border-radius: var(--app-radius-sm, 4px);
    }

    .col-title {
      width: auto;
      min-width: 0;
      max-width: none;
    }

    .col-duration {
      width: 100px;
      max-width: 100px;
      white-space: nowrap;
    }

    .col-subscribers {
      width: 120px;
      max-width: 120px;
      white-space: nowrap;
      text-align: center;
    }

    .subscriber-stat {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .subscriber-stat__star {
      color: var(--app-secondary);
      font-size: 1rem;
    }

    .subscriber-stat__count {
      font-weight: 600;
      color: var(--app-text);
    }

    .col-status {
      width: 150px;
      max-width: 150px;
      white-space: nowrap;
    }

    .col-actions {
      width: 72px;
      max-width: 72px;
      white-space: nowrap;
      text-align: right;
      /* Breathing room between the kebab and the table's right edge. */
      padding-right: 18px;
    }

    /* Mobile card: kebab menu sits at the right end of the meta row. */
    .my-tracks__menu {
      margin-left: auto;
      align-self: center;
    }

    .my-tracks-mobile-list .app-entity-list__item {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }

    .my-tracks-mobile-list .app-entity-list__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px;
      min-width: 0;
      max-width: 100%;
    }

    .my-tracks-mobile-list .app-entity-list__title,
    .my-tracks-mobile-list .app-entity-list__subtitle {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .my-tracks-mobile-list .app-entity-list__meta {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .my-tracks-mobile-list .app-entity-list__meta span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .my-tracks-mobile-list ui-chip {
      justify-self: end;
      max-width: 100%;
    }

    .app-entity-list__actions {
      margin-top: 14px;
    }

    .empty {
      color: var(--app-text-muted);
      font-size: 13px;
      font-style: italic;
      margin: 0;
      padding: 12px 0;
    }

    .my-tracks__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.75rem;
      padding: 2rem 1.5rem;
      border: 1px dashed var(--app-border-color);
      border-radius: var(--app-radius-md);
      background:
        radial-gradient(ellipse at center, rgba(201, 164, 76, 0.06) 0, transparent 60%),
        var(--app-surface);
    }

    .my-tracks__empty-title {
      margin: 0;
      font-family: var(--app-font-heading);
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: 0.04em;
      color: var(--app-heading);
    }

    .my-tracks__empty-msg {
      margin: 0;
      max-width: 42ch;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .my-tracks__empty-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 0.5rem;
    }

    .publish-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .publish-form__track-name {
      margin: 0;
      font-weight: 600;
      color: var(--app-text);
    }

    .publish-form__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .optional {
      font-weight: 400;
      color: var(--app-text-muted);
      font-size: 12px;
    }

    @container my-tracks (max-width: 820px) {
      .my-tracks-table {
        display: none !important;
      }

      .my-tracks-mobile-list {
        display: flex !important;
        flex-direction: column;
        gap: 14px;
        margin: 0;
        padding: 0;
      }
    }

    @media (max-width: 900px) {
      .my-tracks-table {
        display: none !important;
      }

      .my-tracks-mobile-list {
        display: flex !important;
        flex-direction: column;
        gap: 14px;
        margin: 0;
        padding: 0;
      }
    }

    /* Chip stays top-right at every width — the title truncates instead of
       the chip dropping to its own line (consistent with the other lists). */
  `],
})
export class MyTracksComponent {
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly infoDialog = inject(InfoDialogService);

  readonly tracks = input<Track[]>([]);
  readonly busyTrackId = input<number | null>(null);

  readonly publish = output<PublishEvent>();
  readonly unpublish = output<Track>();
  readonly close = output<void>();
  readonly addTrack = output<void>();

  readonly filterOptions = [
    { label: 'All tracks', value: 'all' },
    { label: 'Published', value: 'published' },
    { label: 'Unpublished', value: 'unpublished' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: 'Track', className: 'col-title' },
    { label: 'Duration', className: 'col-duration', width: '100px' },
    { label: 'Subscribers', className: 'col-subscribers', width: '120px' },
    { label: 'Status', className: 'col-status', width: '150px' },
    { label: '', className: 'col-actions', width: '72px' },
  ];

  readonly descriptionMaxLength = FIELD_LIMITS.trackShare.description;

  readonly publishTrack = signal<Track | null>(null);
  readonly publishDesc = signal('');
  readonly search = signal('');
  readonly filterMode = persistentSignal<PublishFilterMode>('mpf:workshop:mytracks:filter', 'all');

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as PublishFilterMode);
  }

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const mode = this.filterMode();

    return this.tracks().filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);

      const matchesFilter =
        mode === 'all' ||
        (mode === 'published' && !!track.trackShare) ||
        (mode === 'unpublished' && !track.trackShare);

      return matchesSearch && matchesFilter;
    });
  });

  openPublish(track: Track): void {
    this.publishTrack.set(track);
    this.publishDesc.set('');
  }

  closePublish(): void {
    this.publishTrack.set(null);
    this.publishDesc.set('');
  }

  async confirmPublish(): Promise<void> {
    const track = this.publishTrack();
    if (!track) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Publish track',
      message: `Publish "${this.displayName(track)}"?`,
      confirmText: 'Publish',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    this.publish.emit({
      track,
      description: this.publishDesc(),
    });

    this.closePublish();
  }

  async requestUnpublish(track: Track): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Unpublish track',
      message: `Unpublish "${this.displayName(track)}"?`,
      confirmText: 'Unpublish',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.unpublish.emit(track);
  }

  trackById(index: number, track: Track): number {
    return track.id ?? index;
  }

  menuItems(track: Track): ActionMenuItem[] {
    const busy = this.busyTrackId() === track.id;

    if (track.trackShare) {
      return [{ id: 'unpublish', label: 'Unpublish', variant: 'danger', disabled: busy }];
    }

    return [{ id: 'publish', label: 'Publish', disabled: busy }];
  }

  onMenuSelect(track: Track, id: string): void {
    if (id === 'publish') {
      this.openPublish(track);
    } else if (id === 'unpublish') {
      void this.requestUnpublish(track);
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

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || ('Track #' + track.id);
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) return '—';

    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private matchesSearch(track: Track, query: string): boolean {
    const haystack = [
      this.displayName(track),
      track.trackShare?.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }
}