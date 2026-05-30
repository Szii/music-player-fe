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
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
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
  imports: [CommonModule, FormsModule, NormalButtonComponent, UiSearchBoxComponent, UiSelectComponent, UiChipComponent, UiDialogShellComponent],
  template: `
    <ui-dialog-shell
      title="My tracks"
      subtitle="Publish your tracks so other users can find and subscribe to them."
      titleId="my-tracks-title"
      [wide]="true"
      (closed)="close.emit()"
    >
      <div class="my-tracks__toolbar" *ngIf="tracks().length > 0">
        <ui-search-box
          class="my-tracks__search"
          [value]="search()"
          placeholder="Search tracks by name"
          (valueChange)="search.set($event)"
        />

        <div class="my-tracks__field">
          <span class="my-tracks__label">Status</span>
          <ui-select
            [options]="filterOptions"
            [ngModel]="filterMode()"
            [enableSearch]="false"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="filterMode.set($event)"
          />
        </div>
      </div>

      <div class="my-tracks__meta" *ngIf="tracks().length > 0">
        {{ filteredTracks().length }} / {{ tracks().length }}
        track{{ tracks().length === 1 ? '' : 's' }}
      </div>

      <ng-container *ngIf="filteredTracks().length > 0; else emptyState">
        <div class="track-list">
          <div *ngFor="let track of filteredTracks(); trackBy: trackById" class="track-row">
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

              <div *ngIf="track.trackShare?.shareCode" class="track-row__code">
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
            </div>

            <div class="track-row__actions">
              <normal-button
                *ngIf="!track.trackShare"
                size="sm"
                [disabled]="busyTrackId() === track.id"
                (clicked)="openPublish(track)"
              >
                Publish
              </normal-button>

              <normal-button
                *ngIf="track.trackShare"
                size="sm"
                variant="danger"
                [disabled]="busyTrackId() === track.id"
                (clicked)="requestUnpublish(track)"
              >
                Unpublish
              </normal-button>
            </div>
          </div>
        </div>
      </ng-container>

      <ng-template #emptyState>
        <p *ngIf="tracks().length === 0" class="empty">
          No tracks yet. Create some on the Home page.
        </p>

        <p *ngIf="tracks().length > 0 && filteredTracks().length === 0" class="empty">
          No tracks match the current search or filter.
        </p>
      </ng-template>
    </ui-dialog-shell>

    <ui-dialog-shell
      *ngIf="publishTrack()"
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
  `,
  styles: [`
    :host {
      display: block;
    }

    .my-tracks__toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px;
      gap: 12px;
      align-items: end;
      margin-bottom: 10px;
    }

    .my-tracks__search {
      min-width: 0;
    }

    .my-tracks__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .my-tracks__label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .my-tracks__meta {
      margin-bottom: 10px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
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
      .my-tracks__toolbar {
        grid-template-columns: 1fr;
      }

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