import {
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../../../environments/environment';
import {
  MusicTracksService,
  PlaybackService,
  Track,
  TrackWindowRequest,
  WaveformResponse,
} from '../../../../api/generated';
import {
  WindowEditorComponent,
  WindowEditorResult,
} from '../window-editor/window-editor.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';

export interface WindowSaveEvent {
  trackId: number;
  windowId?: number;
  body: TrackWindowRequest;
}

export interface WindowDeleteEvent {
  trackId: number;
  windowId: number;
}

@Component({
  selector: 'app-track-windows-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WindowEditorComponent,
    NormalButtonComponent,
    UiEmptyStateComponent,
  ],
  template: `
    <div class="panel-backdrop" *ngIf="track" (click)="onBackdropClick($event)">
      <div class="panel-modal">
        <div class="panel-modal__header">
          <div class="panel-modal__heading">
            <h2 class="panel-modal__title">Windows</h2>
            <p class="panel-modal__sub">
              {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
            </p>
          </div>

          <button class="panel-modal__close" type="button" (click)="onClose()">✕</button>
        </div>

        <div *ngIf="streamLoading || waveformLoading" class="panel-status">
          <span class="panel-status__spinner"></span>
          {{ streamLoading ? 'Starting stream…' : 'Loading waveform…' }}
        </div>

        <div *ngIf="streamError || waveformError" class="panel-error">
          <span>{{ streamError || waveformError }}</span>
          <normal-button size="sm" variant="danger" (clicked)="retryStream()">Retry</normal-button>
        </div>

        <div class="panel-modal__body panel-modal__body--split">
          <aside class="panel-side">
            <div class="panel-side__inner">
              <div class="panel-block__head">
                <span class="panel-block__title">Existing windows</span>

                <div class="panel-block__head-actions">
                  <span class="panel-block__meta">{{ windows.length }}</span>

                  <normal-button
                    size="sm"
                    variant="secondary"
                    [disabled]="!editorReady"
                    (clicked)="startCreateWindow()"
                  >
                    New window
                  </normal-button>
                </div>
              </div>

              <div class="panel-side__content">
                <div *ngIf="!editorReady && windows.length > 0" class="panel-side__notice">
                  Track is still buffering. Existing windows can be viewed, but selection and creation are disabled until buffering finishes.
                </div>

                <ui-empty-state
                  *ngIf="!editorReady && windows.length === 0"
                  title="Track is still buffering"
                  message="Wait until the preview is fully ready before selecting or creating windows."
                ></ui-empty-state>

                <ui-empty-state
                  *ngIf="editorReady && windows.length === 0"
                  title="No windows yet"
                  message="Create your first one on the right."
                ></ui-empty-state>

                <div *ngIf="windows.length > 0" class="panel-side__table-wrap">
                  <div class="panel-window-list">
                    <button
                      *ngFor="let win of windows"
                      type="button"
                      class="panel-window-item"
                      [class.panel-window-item--selected]="selectedWindowId === win.id"
                      [class.panel-window-item--disabled]="!editorReady"
                      [disabled]="!editorReady"
                      (click)="editorReady && selectWindow(win)"
                    >
                      <div class="panel-window-item__top">
                        <span
                          class="panel-window-item__name"
                          [title]="win.name || 'Untitled window'"
                        >
                          {{ win.name || 'Untitled window' }}
                        </span>

                        <div class="panel-window-item__actions" (click)="$event.stopPropagation()">
                          <normal-button
                            size="sm"
                            variant="danger"
                            (clicked)="onDeleteWindow(win)"
                          >
                            Delete
                          </normal-button>
                        </div>
                      </div>

                      <div class="panel-window-item__bottom">
                        <div class="panel-window-item__meta">
                          <span class="panel-window-item__chip">
                            <span class="panel-window-item__chip-label">From</span>
                            <span class="panel-window-item__chip-value">
                              {{ formatTime(win.positionFrom ?? 0) }}
                            </span>
                          </span>

                          <span class="panel-window-item__chip">
                            <span class="panel-window-item__chip-label">To</span>
                            <span class="panel-window-item__chip-value">
                              {{ formatTime(win.positionTo ?? 0) }}
                            </span>
                          </span>

                          <span
                            class="panel-window-item__chip"
                            [class.panel-window-item__chip--active]="win.fadeIn"
                          >
                            <span class="panel-window-item__chip-label">Fade in</span>
                            <span class="panel-window-item__chip-value">
                              {{ win.fadeIn ? 'Yes' : 'No' }}
                            </span>
                          </span>

                          <span
                            class="panel-window-item__chip"
                            [class.panel-window-item__chip--active]="win.fadeOut"
                          >
                            <span class="panel-window-item__chip-label">Fade out</span>
                            <span class="panel-window-item__chip-value">
                              {{ win.fadeOut ? 'Yes' : 'No' }}
                            </span>
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section class="panel-main">
            <div class="panel-editor" *ngIf="resolvedStreamUrl; else editorPending">
              <div class="panel-editor__head">
                <span class="panel-block__title panel-block__title--primary">
                  {{ selectedWindowId != null ? 'Edit window' : 'Create new window' }}
                </span>

                <normal-button
                  *ngIf="selectedWindowId != null"
                  size="sm"
                  variant="secondary"
                  [disabled]="!editorReady"
                  (clicked)="startCreateWindow()"
                >
                  Clear selection
                </normal-button>
              </div>

              <div class="panel-editor__body">
                <app-window-editor
                  [streamUrl]="resolvedStreamUrl"
                  [durationS]="resolvedDurationS || (track.duration ?? 0)"
                  [waveformPeaks]="waveformPeaks"
                  [waveformLoading]="waveformLoading"
                  [waveformError]="waveformError"
                  [initialFromS]="editorFromS"
                  [initialToS]="editorToS"
                  [initialName]="editorName"
                  [initialFadeIn]="editorFadeIn"
                  [initialFadeOut]="editorFadeOut"
                  [applyLabel]="selectedWindowId != null ? 'Save changes' : 'Create window'"
                  (apply)="onEditorApply($event)"
                  (streamCompleted)="onEditorStreamComplete()"
                />
              </div>
            </div>

            <ng-template #editorPending>
              <div class="panel-editor panel-editor--placeholder">
                <div class="panel-editor__head">
                  <span class="panel-block__title panel-block__title--primary">
                    Preparing editor
                  </span>
                </div>

                <div class="panel-editor__placeholder">
                  <ui-empty-state
                    title="Track preview is still buffering"
                    message="You can delete existing windows, but selecting or creating windows will be enabled only after buffering is complete."
                  ></ui-empty-state>
                </div>
              </div>
            </ng-template>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .panel-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      z-index: 900;
      padding: 135px 24px 24px;
      overflow: auto;
      animation: fade-in 0.5s ease;
      box-sizing: border-box;
    }

    .panel-modal {
      width: min(96vw, 1360px);
      max-height: calc(100dvh - 228px);
      display: flex;
      flex-direction: column;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 20px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
      overflow: hidden;
      animation: slide-in 0.18s ease;
      min-height: 0;
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-14px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .panel-modal__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 24px 28px 18px;
      border-bottom: var(--app-border);
      flex-shrink: 0;
    }

    .panel-modal__heading {
      min-width: 0;
    }

    .panel-modal__title {
      margin: 0 0 6px;
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.1;
      color: var(--app-text);
    }

    .panel-modal__sub {
      margin: 0;
      font-size: 1rem;
      color: var(--app-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-modal__close {
      flex-shrink: 0;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 20px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .panel-modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .panel-status,
    .panel-error {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 28px;
      border-bottom: var(--app-border);
      flex-shrink: 0;
      font-size: 0.95rem;
    }

    .panel-status {
      color: var(--app-text-muted);
      background: rgba(239, 231, 216, 0.28);
    }

    .panel-error {
      color: var(--app-danger);
      background: rgba(247, 222, 222, 0.22);
    }

    .panel-status__spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--app-border-color);
      border-top-color: var(--app-primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .panel-modal__body {
      flex: 1 1 auto;
      min-height: 0;
    }

    .panel-modal__body--split {
      display: grid;
      grid-template-columns: minmax(420px, 520px) minmax(0, 1fr);
      min-height: 0;
      overflow: hidden;
    }

    .panel-side {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-right: var(--app-border);
      background: rgba(239, 231, 216, 0.16);
      display: flex;
      flex-direction: column;
    }

    .panel-side__inner {
      padding: 22px 20px;
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
    }

    .panel-side__content {
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .panel-side__notice {
      flex: 0 0 auto;
      padding: 10px 12px;
      border: var(--app-border);
      border-radius: 12px;
      background: var(--app-surface);
      color: var(--app-text-muted);
      font-size: 0.9rem;
      line-height: 1.4;
    }

    .panel-side__content > ui-empty-state,
    .panel-side__content > .panel-side__notice {
      flex: 0 0 auto;
    }

    .panel-side__table-wrap {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-window-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }

    .panel-window-item {
      width: 100%;
      border: var(--app-border);
      border-radius: 14px;
      background: var(--app-surface);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
      cursor: pointer;
      transition:
        border-color 0.12s ease,
        background 0.12s ease,
        box-shadow 0.12s ease,
        transform 0.12s ease;
    }

    .panel-window-item:hover:not(:disabled) {
      border-color: var(--app-primary);
      background: rgba(239, 231, 216, 0.22);
      transform: translateY(-1px);
    }

    .panel-window-item--selected {
      border-color: var(--app-primary);
      background: var(--app-primary-soft);
      box-shadow: 0 0 0 1px rgba(122, 92, 46, 0.08);
    }

    .panel-window-item--disabled,
    .panel-window-item:disabled {
      cursor: default;
      opacity: 0.72;
    }

    .panel-window-item--disabled:hover,
    .panel-window-item:disabled:hover {
      transform: none;
      border-color: var(--app-border-color);
      background: var(--app-surface);
    }

    .panel-window-item__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .panel-window-item__name {
      display: block;
      min-width: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--app-text);
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-window-item__bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .panel-window-item__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }

    .panel-window-item__chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      padding: 4px 9px;
      border-radius: 999px;
      background: transparent;
      border: 1px solid var(--app-border-color);
      color: var(--app-text-muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .panel-window-item__chip-label {
      font-weight: 700;
      color: var(--app-text-muted);
    }

    .panel-window-item__chip-value {
      font-weight: 600;
      color: var(--app-text);
    }

    .panel-window-item__chip--active {
      background: rgba(122, 92, 46, 0.06);
      border-color: rgba(122, 92, 46, 0.25);
    }

    .panel-window-item__chip--active .panel-window-item__chip-label,
    .panel-window-item__chip--active .panel-window-item__chip-value {
      color: var(--app-primary);
    }

    .panel-window-item__actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
    }

    .panel-main {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--app-surface);
      display: flex;
      flex-direction: column;
      padding: 20px;
    }

    .panel-editor {
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 16px;
      overflow: hidden;
    }

    .panel-editor--placeholder {
      min-height: 100%;
    }

    .panel-editor__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 16px 18px;
      border-bottom: var(--app-border);
      background: var(--app-bg-soft);
      flex-shrink: 0;
    }

    .panel-editor__body {
      min-height: 0;
      flex: 1 1 auto;
      overflow: auto;
      background: var(--app-surface);
    }

    .panel-editor__placeholder {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .panel-block__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-shrink: 0;
    }

    .panel-block__head-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .panel-block__title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .panel-block__title--primary {
      font-size: 13px;
      color: var(--app-text);
      text-transform: none;
      letter-spacing: 0;
    }

    .panel-block__meta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2rem;
      height: 2rem;
      padding: 0 0.6rem;
      border-radius: 999px;
      background: var(--app-surface-muted);
      color: var(--app-text-muted);
      font-size: 0.88rem;
      font-weight: 700;
    }

    @media (max-width: 1100px) {
      .panel-modal__body--split {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(240px, 320px) minmax(0, 1fr);
      }

      .panel-side {
        border-right: none;
        border-bottom: var(--app-border);
      }
    }

    @media (max-width: 700px) {
      .panel-backdrop {
        padding: 64px 12px 12px;
      }

      .panel-modal {
        width: 100%;
        max-height: calc(100dvh - 76px);
      }

      .panel-modal__header {
        padding: 18px 18px 14px;
      }

      .panel-modal__title {
        font-size: 1.65rem;
      }

      .panel-status,
      .panel-error {
        padding-left: 18px;
        padding-right: 18px;
      }

      .panel-side__inner {
        padding: 16px;
      }

      .panel-main {
        padding: 16px;
      }

      .panel-editor__head {
        padding: 16px;
      }

      .panel-window-item__top,
      .panel-window-item__bottom {
        align-items: flex-start;
      }
    }
  `]
})
export class TrackWindowsPanelComponent implements OnChanges, OnDestroy {
  private zone = inject(NgZone);
  private playbackApi = inject(PlaybackService);
  private trackApi = inject(MusicTracksService);

  @Input() track: Track | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() saveWindow = new EventEmitter<WindowSaveEvent>();
  @Output() deleteWindow = new EventEmitter<WindowDeleteEvent>();

  resolvedStreamUrl: string | null = null;
  resolvedDurationS = 0;

  streamLoading = false;
  streamError: string | null = null;
  waveformLoading = false;
  waveformError: string | null = null;
  waveformPeaks: number[] = [];

  editorStreamComplete = false;

  selectedWindowId: number | null = null;
  editorFromS: number | null = null;
  editorToS: number | null = null;
  editorName = '';
  editorFadeIn = false;
  editorFadeOut = false;

  private waveformPollTimer: ReturnType<typeof setInterval> | null = null;
  private currentTrackId: number | null = null;

  get windows(): any[] {
    return this.track?.trackWindows ?? [];
  }

  get editorReady(): boolean {
    return !!this.resolvedStreamUrl
      && !this.streamLoading
      && !this.streamError
      && this.editorStreamComplete;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('track' in changes) {
      const newId = this.track?.id ?? null;
      if (newId !== this.currentTrackId) {
        this.resetState();
        this.currentTrackId = newId;

        if (this.track?.id != null) {
          this.startEditorSessionForTrack(this.track.id, this.track.duration ?? 0);
          this.syncSelectionWithWindows();
        }
      } else {
        this.syncSelectionWithWindows();
      }
    }
  }

  ngOnDestroy(): void {
    this.resetState();
  }

  onClose(): void {
    this.resetState();
    this.close.emit();
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('panel-backdrop')) {
      this.onClose();
    }
  }

  retryStream(): void {
    if (this.track?.id != null) {
      this.startEditorSessionForTrack(this.track.id, this.track.duration ?? 0);
    }
  }

  selectWindow(win: any): void {
    if (!this.editorReady) return;

    this.selectedWindowId = win?.id ?? null;
    this.loadEditorFromWindow(win);
  }

  startCreateWindow(): void {
    if (!this.editorReady) return;

    this.selectedWindowId = null;
    this.editorFromS = null;
    this.editorToS = null;
    this.editorName = '';
    this.editorFadeIn = false;
    this.editorFadeOut = false;
  }

  onEditorApply(result: WindowEditorResult): void {
    if (this.track?.id == null || !this.editorReady) return;

    const body: TrackWindowRequest = {
      name: result.name || undefined,
      positionFrom: result.positionFrom,
      positionTo: result.positionTo,
      fadeIn: result.fadeIn,
      fadeOut: result.fadeOut,
    };

    this.saveWindow.emit({
      trackId: this.track.id,
      windowId: this.selectedWindowId ?? undefined,
      body,
    });
  }

  onDeleteWindow(win: any): void {
    if (this.track?.id == null || win.id == null) return;

    const wasSelected = this.selectedWindowId === win.id;
    this.deleteWindow.emit({ trackId: this.track.id, windowId: win.id });

    if (wasSelected) {
      this.selectedWindowId = null;
      this.editorFromS = null;
      this.editorToS = null;
      this.editorName = '';
      this.editorFadeIn = false;
      this.editorFadeOut = false;
    }
  }

  onEditorStreamComplete(): void {
    this.editorStreamComplete = true;
  }

  private loadEditorFromWindow(win: any): void {
    this.editorFromS = win?.positionFrom ?? 0;
    this.editorToS = win?.positionTo ?? 0;
    this.editorName = win?.name ?? '';
    this.editorFadeIn = win?.fadeIn ?? false;
    this.editorFadeOut = win?.fadeOut ?? false;
  }

  private syncSelectionWithWindows(): void {
    const windows = this.windows;

    if (windows.length === 0) {
      if (this.selectedWindowId != null) {
        this.selectedWindowId = null;
        this.editorFromS = null;
        this.editorToS = null;
        this.editorName = '';
        this.editorFadeIn = false;
        this.editorFadeOut = false;
      }
      return;
    }

    if (this.selectedWindowId == null) {
      return;
    }

    const selected = windows.find((w) => w.id === this.selectedWindowId);

    if (!selected) {
      this.selectedWindowId = null;
      this.editorFromS = null;
      this.editorToS = null;
      this.editorName = '';
      this.editorFadeIn = false;
      this.editorFadeOut = false;
      return;
    }

    this.loadEditorFromWindow(selected);
  }

  private startEditorSessionForTrack(trackId: number, durationS: number): void {
    this.streamLoading = true;
    this.streamError = null;
    this.waveformPeaks = [];
    this.resolvedStreamUrl = null;
    this.resolvedDurationS = durationS || 0;
    this.editorStreamComplete = false;

    this.playbackApi.playTrack({ trackId }).subscribe({
      next: (state: any) => {
        const url = this.resolveStreamUrl(state.streamUrl);
        if (!url) {
          this.streamError = 'No stream URL returned.';
          this.streamLoading = false;
          return;
        }

        this.resolvedStreamUrl = url;
        this.streamLoading = false;
        this.startWaveformPolling(trackId);
        this.loadStreamInfo(trackId);
      },
      error: (err: any) => {
        console.error('playTrack failed', err);
        this.streamError = 'Failed to start track playback.';
        this.streamLoading = false;
      },
    });
  }

  private loadWaveform(trackId: number, silent = false): void {
    if (!silent) {
      this.waveformLoading = true;
      this.waveformError = null;
    }

    this.trackApi.getTrackWaveform({ trackId }).subscribe({
      next: (resp: WaveformResponse) => {
        this.zone.run(() => {
          this.waveformPeaks = (resp?.peaks ?? []).map((v: any) => Number(v));
          if (!this.resolvedDurationS && resp?.durationS != null) {
            this.resolvedDurationS = Number(resp.durationS);
          }
          this.waveformLoading = false;
          if (resp?.complete) {
            this.stopWaveformPolling();
          }
        });
      },
      error: (err: any) => {
        console.error('getTrackWaveform failed', err);
        this.zone.run(() => {
          this.waveformError = 'Failed to load waveform.';
          this.waveformLoading = false;
        });
      },
    });
  }

  private loadStreamInfo(trackId: number): void {
    this.playbackApi.getTrackStreamInfo({ trackId }).subscribe({
      next: (resp: any) => {
        this.zone.run(() => {
          if (!this.resolvedDurationS && resp?.durationS != null) {
            this.resolvedDurationS = Number(resp.durationS);
          }
        });
      },
      error: (err: any) => {
        console.error('getTrackStreamInfo failed', err);
      },
    });
  }

  private startWaveformPolling(trackId: number): void {
    this.stopWaveformPolling();
    this.loadWaveform(trackId);
    this.waveformPollTimer = setInterval(() => this.loadWaveform(trackId, true), 700);
  }

  private stopWaveformPolling(): void {
    if (this.waveformPollTimer) {
      clearInterval(this.waveformPollTimer);
      this.waveformPollTimer = null;
    }
  }

  private resolveStreamUrl(streamUrl?: string | null): string | null {
    if (!streamUrl) return null;
    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) return streamUrl;
    const base = environment.apiUrl.replace(/\/$/, '');
    const path = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
    return `${base}${path}`;
  }

  private resetState(): void {
    this.stopWaveformPolling();
    this.streamLoading = false;
    this.streamError = null;
    this.waveformLoading = false;
    this.waveformError = null;
    this.waveformPeaks = [];
    this.resolvedStreamUrl = null;
    this.resolvedDurationS = 0;
    this.currentTrackId = null;
    this.editorStreamComplete = false;
    this.selectedWindowId = null;
    this.editorFromS = null;
    this.editorToS = null;
    this.editorName = '';
    this.editorFadeIn = false;
    this.editorFadeOut = false;
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}