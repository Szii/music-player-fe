import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import {
  Track,
  TrackWindowRequest,
} from '../../../../api/generated';
import {
  WindowEditorComponent,
  WindowEditorResult,
} from '../window-editor/window-editor.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import {
  TrackPreviewSessionService,
  TrackPreviewState,
} from './track-preview-session.service';

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
    UiChipComponent,
    UiDialogShellComponent,
  ],
  template: `
    <ui-dialog-shell
      *ngIf="track"
      title="Windows"
      [subtitle]="track.trackName || track.trackOriginalName || ('Track #' + track.id)"
      titleId="track-windows-title"
      size="extra-wide"
      (closed)="onClose()"
    >
      <div *ngIf="streamError || waveformError" class="panel-error">
        <span>{{ streamError || waveformError }}</span>
        <normal-button size="sm" variant="danger" (clicked)="retryStream()">
          Retry
        </normal-button>
      </div>

      <div class="panel-body panel-body--split">
          <aside class="panel-side">
            <div *ngIf="!editorStreamComplete" class="panel-side__loading">
              <span class="panel-side__loading-spinner"></span>
              <span>Wait for track to be loaded to manage windows…</span>
            </div>

            <div *ngIf="editorStreamComplete" class="panel-side__inner">
              <div class="panel-block__head">
                <span class="panel-block__title">Existing windows</span>
                <span class="panel-block__meta">{{ windows.length }}</span>
              </div>

              <div class="panel-side__content">
                <ui-empty-state
                  *ngIf="windows.length === 0"
                  title="No windows yet"
                  message="Create your first one in the editor."
                />

                <div *ngIf="windows.length > 0" class="panel-side__table-wrap">
                  <div class="panel-window-list">
                    <button
                      *ngFor="let win of windows"
                      type="button"
                      class="panel-window-item"
                      [class.panel-window-item--selected]="selectedWindowId === win.id"
                      (click)="selectWindow(win)"
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
                          <ui-chip variant="neutral" size="sm" keyLabel="From">
                            {{ formatTime(win.positionFrom ?? 0) }}
                          </ui-chip>

                          <ui-chip variant="neutral" size="sm" keyLabel="To">
                            {{ formatTime(win.positionTo ?? 0) }}
                          </ui-chip>
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
                    title="Preparing preview"
                    message="The track preview will appear here shortly."
                  />
                </div>
              </div>
            </ng-template>
          </section>
        </div>
      </ui-dialog-shell>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .panel-side__loading {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 48px 24px;
      color: var(--app-text-muted);
      font-size: 0.95rem;
    }

    .panel-side__loading-spinner {
      display: block;
      width: 48px;
      height: 48px;
      border: 4px solid rgba(0, 0, 0, 0.08);
      border-top-color: var(--app-primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .panel-error {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 28px;
      border-bottom: var(--app-border);
      flex-shrink: 0;
      font-size: 0.95rem;
      color: var(--app-danger);
      background: rgba(247, 222, 222, 0.22);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .panel-body {
      flex: 1 1 auto;
      min-height: 0;
    }

    .panel-body--split {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
      gap: 14px;
      min-height: 0;
      overflow: hidden;
      padding: 14px 4px 4px;
      background: transparent;
    }

    .panel-side {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: transparent;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .panel-side::after {
      content: '';
      position: absolute;
      top: 14px;
      right: -7px;
      bottom: 14px;
      width: 1px;
      background: linear-gradient(
        180deg,
        transparent,
        var(--app-border-color-soft) 18%,
        var(--app-border-color-soft) 82%,
        transparent
      );
      pointer-events: none;
    }

    .panel-side__inner {
      padding: 14px 0 4px;
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
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
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background: var(--app-parchment-soft);
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
      gap: 12px;
      padding: 4px 4px 6px 0;
    }

    .panel-window-item {
      width: 100%;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background: var(--app-parchment-soft);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
      cursor: pointer;
      box-shadow:
        var(--app-shadow-soft),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transition:
        border-color 0.12s ease,
        background 0.12s ease,
        box-shadow 0.12s ease,
        transform 0.12s ease;
    }

    .panel-window-item:hover:not(:disabled) {
      border-color: var(--app-border-color);
      background: var(--app-parchment);
      transform: translateY(-1px);
    }

    .panel-window-item--selected,
    .panel-window-item--selected:hover:not(:disabled) {
      border-color: var(--app-primary);
      background: var(--app-parchment);
      box-shadow:
        var(--app-shadow-soft),
        inset 0 0 0 1px var(--app-primary),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
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

    .panel-window-item__actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
    }

    .panel-main {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: transparent;
      display: flex;
      flex-direction: column;
      padding: 0;
    }

    .panel-editor {
      min-width: 0;
      min-height: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--app-parchment-soft);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      box-shadow:
        var(--app-shadow-soft),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
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
      padding: 12px 16px;
      border-bottom: 1px solid var(--app-border-color-soft);
      background: var(--app-header-surface);
      flex-shrink: 0;
    }

    .panel-editor__body {
      min-height: 0;
      flex: 1 1 auto;
      overflow: auto;
      background: transparent;
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
      padding: 0 4px 0 0;
    }

    .panel-block__title {
      font-family: var(--app-font-heading);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-heading);
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.08);
    }

    .panel-block__title--primary {
      font-size: 0.92rem;
      text-transform: none;
      letter-spacing: 0.02em;
    }

    .panel-block__meta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.75rem;
      height: 1.75rem;
      padding: 0 0.55rem;
      border-radius: 999px;
      background: var(--app-surface-muted);
      color: var(--app-heading);
      font-family: var(--app-font-heading);
      font-size: 0.82rem;
      font-weight: 700;
      border: 1px solid var(--app-border-color-soft);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }

    @media (max-width: 1100px) {
      .panel-body--split {
        grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
        gap: 12px;
        padding: 12px;
      }

      .panel-side::after {
        right: -6px;
      }

      .panel-side__inner {
        padding: 12px 0 4px;
      }

      .panel-window-item {
        padding: 12px 14px;
      }
    }

    @media (max-width: 700px) {
      .panel-error {
        padding-left: 18px;
        padding-right: 18px;
      }

      .panel-body--split {
        grid-template-columns: minmax(170px, 40vw) minmax(0, 1fr);
        gap: 8px;
        padding: 8px;
      }

      .panel-side::after {
        display: none;
      }

      .panel-side__inner {
        padding: 10px 0;
        gap: 10px;
      }

      .panel-window-list {
        gap: 10px;
        padding: 2px 2px 4px 0;
      }

      .panel-window-item {
        padding: 10px 11px;
      }

      .panel-window-item__top {
        align-items: flex-start;
        flex-direction: column;
        gap: 8px;
      }

      .panel-window-item__bottom {
        align-items: flex-start;
      }

      .panel-window-item__actions {
        align-self: flex-start;
      }

      .panel-editor__head {
        padding: 12px;
      }
    }
  `],
})
export class TrackWindowsPanelComponent implements OnChanges, OnDestroy {
  private readonly previewSession: TrackPreviewSessionService = inject(TrackPreviewSessionService);
  private readonly destroyRef = inject(DestroyRef);

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

  private currentTrackId: number | null = null;
  private previewSessionSub: Subscription | null = null;

  get windows(): any[] {
    return this.track?.trackWindows ?? [];
  }

  get editorReady(): boolean {
    return !!this.resolvedStreamUrl &&
      !this.streamLoading &&
      !this.streamError &&
      this.editorStreamComplete;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('track' in changes) {
      const newTrackId = this.track?.id ?? null;

      if (newTrackId !== this.currentTrackId) {
        this.resetState();
        this.currentTrackId = newTrackId;

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
    this.deleteWindow.emit({
      trackId: this.track.id,
      windowId: win.id,
    });

    if (wasSelected) {
      this.startCreateWindow();
    }
  }

  onEditorStreamComplete(): void {
    this.editorStreamComplete = true;
  }

  private startEditorSessionForTrack(trackId: number, durationS: number): void {
    this.stopPreviewSession();

    this.previewSessionSub = this.previewSession.createSession(trackId, durationS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state: TrackPreviewState) => {
        this.streamLoading = state.streamLoading;
        this.streamError = state.streamError;
        this.waveformLoading = state.waveformLoading;
        this.waveformError = state.waveformError;
        this.resolvedStreamUrl = state.resolvedStreamUrl;
        this.resolvedDurationS = state.resolvedDurationS;
        this.waveformPeaks = state.waveformPeaks;
      });
  }

  private stopPreviewSession(): void {
    this.previewSessionSub?.unsubscribe();
    this.previewSessionSub = null;
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

    const selected = windows.find(w => w.id === this.selectedWindowId);

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

  private resetState(): void {
    this.stopPreviewSession();
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
