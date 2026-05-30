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
  imports: [CommonModule, FormsModule, NormalButtonComponent, UiSearchBoxComponent, UiSelectComponent, UiChipComponent],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-tracks-title"
        (click)="$event.stopPropagation()"
      >
        <div class="modal__header">
          <div>
            <h2 id="my-tracks-title" class="modal__title">My tracks</h2>
            <p class="modal__desc">
              Publish your tracks so other users can find and subscribe to them.
            </p>
          </div>

          <button class="modal__close" type="button" (click)="close.emit()">✕</button>
        </div>

        <div class="modal__toolbar" *ngIf="tracks().length > 0">
          <ui-search-box
            class="modal__search"
            [value]="search()"
            placeholder="Search tracks by name"
            (valueChange)="search.set($event)"
          />

          <div class="modal__field">
            <span class="modal__label">Status</span>
            <ui-select
              [options]="filterOptions"
              [ngModel]="filterMode()"
              [enableSearch]="false"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="filterMode.set($event)"
            />
          </div>
        </div>

        <div class="modal__meta" *ngIf="tracks().length > 0">
          {{ filteredTracks().length }} / {{ tracks().length }}
          track{{ tracks().length === 1 ? '' : 's' }}
        </div>

        <div class="modal__body">
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
        </div>
      </div>
    </div>

    <div class="publish-backdrop" *ngIf="publishTrack()" (click)="closePublish()">
      <div class="publish-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="publish-modal__header">
          <h2 class="publish-modal__title">Publish track</h2>
          <button class="publish-modal__close" type="button" (click)="closePublish()">✕</button>
        </div>

        <div class="publish-modal__body">
          <p class="publish-modal__track-name">
            {{ publishTrack()!.trackName || publishTrack()!.trackOriginalName }}
          </p>

          <div class="publish-modal__field">
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

          <div class="publish-modal__actions">
            <normal-button type="button" variant="secondary" (clicked)="closePublish()">
              Cancel
            </normal-button>
            <normal-button type="button" (clicked)="confirmPublish()">
              Publish
            </normal-button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background:
        radial-gradient(ellipse at center, rgba(88, 24, 13, 0.1), transparent 60%),
        linear-gradient(180deg, rgba(10, 5, 2, 0.6), rgba(10, 5, 2, 0.72));
      backdrop-filter: blur(3px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 72px 24px 24px;
      overflow: auto;
      animation: fade-in 0.15s ease;
      box-sizing: border-box;
    }

    .modal {
      width: min(980px, 100%);
      max-height: calc(100dvh - 96px);
      margin: 0 auto;
      background: var(--app-parchment);
      border: 1px solid var(--app-border-color);
      border-top: 3px solid var(--app-primary);
      border-radius: var(--app-radius-lg);
      box-shadow:
        0 28px 72px rgba(8, 3, 1, 0.48),
        0 10px 30px rgba(8, 3, 1, 0.24),
        inset 0 0 0 3px rgba(201, 164, 76, 0.1);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      animation: slide-in 0.18s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .modal__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 22px 12px;
      border-bottom: 1px solid var(--app-border-color-soft);
      background: var(--app-header-surface);
      flex: 0 0 auto;
      position: relative;
    }

    .modal__header::after {
      content: '';
      position: absolute;
      left: 22px;
      right: 22px;
      bottom: 0;
      height: 2px;
      border-radius: 999px;
      background: var(--app-divider-decor);
    }

    .modal__title {
      margin: 0 0 0.3rem;
      font-family: var(--app-font-heading);
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--app-heading);
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.1);
    }

    .modal__desc {
      margin: 0;
      font-size: 0.9rem;
      color: var(--app-text-muted);
    }

    .modal__close {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: var(--app-text-muted);
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      transition: background 0.15s, color 0.15s;
    }

    .modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .modal__toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px;
      gap: 12px;
      align-items: end;
      padding: 16px 22px 10px;
      flex: 0 0 auto;
    }

    .modal__search {
      min-width: 0;
    }

    .modal__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .modal__label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .modal__select {
      min-width: 0;
    }

    .modal__meta {
      padding: 0 22px 10px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
      flex: 0 0 auto;
    }

    .modal__body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 22px 22px;
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

    .publish-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .publish-modal {
      width: 100%;
      max-width: 420px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      overflow: hidden;
    }

    .publish-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 14px;
      border-bottom: var(--app-border);
    }

    .publish-modal__title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--app-text);
    }

    .publish-modal__close {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }

    .publish-modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .publish-modal__body {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px;
    }

    .publish-modal__track-name {
      margin: 0;
      font-weight: 600;
      color: var(--app-text);
    }

    .publish-modal__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .publish-modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }

    .optional {
      font-weight: 400;
      color: var(--app-text-muted);
      font-size: 12px;
    }

    @media (max-width: 900px) {
      .modal-backdrop {
        padding: 64px 12px 12px;
      }

      .modal {
        width: 100%;
        max-height: calc(100dvh - 76px);
      }

      .modal__toolbar {
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