import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

export interface PublishEvent {
  track: Track;
  description: string;
}

type PublishFilterMode = 'all' | 'published' | 'unpublished';

@Component({
  selector: 'app-my-tracks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule, NormalButtonComponent, UiListToolbarComponent, UiChipComponent, UiDialogShellComponent],
  template: `
    <ui-dialog-shell
      title="My tracks"
      subtitle="Publish your tracks so other users can find and subscribe to them."
      titleId="my-tracks-title"
      [wide]="true"
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
        <div class="track-list">
          @for (track of filteredTracks(); track track.id) {
            <div class="track-row">
              <div class="track-row__name">
                <span class="track-row__title" [title]="displayName(track)">
                  {{ displayName(track) }}
                </span>
                <span class="track-row__duration">{{ formatDuration(track.duration) }}</span>
              </div>

              <div class="track-row__mid">
                <ui-chip
                  [variant]="track.trackShare ? 'success' : 'gold'"
                  size="sm"
                  shape="hex"
                  [dot]="true"
                >
                  {{ track.trackShare ? 'Published' : 'Unpublished' }}
                </ui-chip>

                @if (track.trackShare?.shareCode) {
                  <div class="track-row__code">
                    <code class="code" [title]="track.trackShare!.shareCode">
                      {{ track.trackShare!.shareCode }}
                    </code>

                    <button
                      class="icon-btn"
                      type="button"
                      (click)="copyToClipboard(track.trackShare!.shareCode!)"
                      title="Copy"
                    >
                      ⎘
                    </button>
                  </div>
                }
              </div>

              <div class="track-row__actions">
                @if (!track.trackShare) {
                  <normal-button
                    size="sm"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="openPublish(track)"
                  >
                    Publish
                  </normal-button>
                } @else {
                  <normal-button
                    size="sm"
                    variant="danger"
                    [disabled]="busyTrackId() === track.id"
                    (clicked)="requestUnpublish(track)"
                  >
                    Unpublish
                  </normal-button>
                }
              </div>
            </div>
          }
        </div>
      } @else if (tracks().length === 0) {
        <p class="empty">No tracks yet. Create some on the Home page.</p>
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
          />
        </div>
      </div>

      <ng-container dialog-footer>
        <normal-button type="button" variant="secondary" (clicked)="closePublish()">
          Cancel
        </normal-button>
        <normal-button type="button" (clicked)="confirmPublish()">
          Publish
        </normal-button>
      </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    ui-list-toolbar {
      margin-bottom: 10px;
      display: block;
    }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: min(46vh, 380px);
      overflow-y: auto;
      padding-right: 4px;
    }

    .track-row {
      display: grid;
      grid-template-columns: minmax(0, 240px) minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 10px;
    }

    .track-row__name {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
      min-width: 0;
    }

    .track-row__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--app-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .track-row__duration {
      font-size: 11px;
      color: var(--app-text-muted);
    }

    .track-row__mid {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .track-row__code {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }

    .code {
      font-size: 11px;
      padding: 3px 8px;
      background: var(--app-bg);
      border: var(--app-border);
      border-radius: 5px;
      color: var(--app-text-muted);
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
    }

    .icon-btn {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      border: var(--app-border);
      background: var(--app-surface);
      color: var(--app-text-muted);
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s, color 0.12s;
      flex: 0 0 auto;
    }

    .icon-btn:hover {
      background: var(--app-primary-soft);
      color: var(--app-primary);
    }

    .track-row__actions {
      display: flex;
      gap: 6px;
      flex: 0 0 auto;
    }

    .empty {
      color: var(--app-text-muted);
      font-size: 13px;
      font-style: italic;
      margin: 0;
      padding: 12px 0;
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

    @media (max-width: 900px) {
      .track-row {
        grid-template-columns: 1fr;
        align-items: start;
      }

      .track-row__actions {
        justify-content: flex-start;
      }
    }
  `],
})
export class MyTracksComponent {
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly tracks = input<Track[]>([]);
  readonly busyTrackId = input<number | null>(null);

  readonly publish = output<PublishEvent>();
  readonly unpublish = output<Track>();
  readonly close = output<void>();

  readonly filterOptions = [
    { label: 'All tracks', value: 'all' },
    { label: 'Published', value: 'published' },
    { label: 'Unpublished', value: 'unpublished' },
  ];

  readonly publishTrack = signal<Track | null>(null);
  readonly publishDesc = signal('');
  readonly search = signal('');
  readonly filterMode = signal<PublishFilterMode>('all');

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as PublishFilterMode);
  }

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const mode = this.filterMode();

    return this.tracks().filter(track => {
      const matchesSearch =
        !query || this.displayName(track).toLowerCase().includes(query);

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

  trackById(_index: number, track: Track): number {
    return track.id ?? 0;
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

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Share code copied.');
    } catch (err) {
      console.error(err);
      this.toast.error('Copy failed.');
    }
  }
}