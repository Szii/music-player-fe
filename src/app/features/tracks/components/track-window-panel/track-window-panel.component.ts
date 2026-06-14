import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import {
  Track,
  TrackWindow,
  TrackWindowRequest,
} from '../../../../api/generated';
import {
  WindowEditorYtComponent,
  WindowEditorResult,
} from '../window-editor/window-editor-yt.component';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { formatFadeMs } from '../../utils/fade';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

export interface WindowSaveEvent {
  trackId: number;
  windowId?: number;
  body: TrackWindowRequest;
}

export interface WindowDeleteEvent {
  trackId: number;
  windowId: number;
}

/** Saving the fades of the synthetic "Whole track" window updates the track. */
export interface TrackFadesSaveEvent {
  trackId: number;
  fadeInMs: number;
  fadeOutMs: number;
}

/**
 * Which entry the editor is bound to:
 * - `create`: a brand-new window.
 * - `whole-track`: the synthetic, always-present window mapped to the track's
 *   own fades (bounds + name locked).
 * - `window`: an existing persisted window.
 */
type PanelSelection =
  | { kind: 'create' }
  | { kind: 'whole-track' }
  | { kind: 'window'; id: number };

@Component({
  selector: 'app-track-windows-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WindowEditorYtComponent,
    NormalButtonComponent,
    UiEmptyStateComponent,
    UiChipComponent,
    UiDialogShellComponent,
  ],
  template: `
    @if (track(); as currentTrack) {
      <ui-dialog-shell
        title="Windows"
        [subtitle]="currentTrack.trackName || currentTrack.trackOriginalName || ('Track #' + currentTrack.id)"
        titleId="track-windows-title"
        size="extra-wide"
        (closed)="onClose()"
      >
        @if (streamError) {
          <div class="panel-error">
            <span>{{ streamError }}</span>
            <normal-button size="sm" variant="danger" (clicked)="retryStream()">
              Retry
            </normal-button>
          </div>
        }

        <div class="panel-body panel-body--split">
          <aside class="panel-side">
            @if (!editorStreamComplete) {
              <div class="panel-side__loading">
                <span class="panel-side__loading-spinner"></span>
                <span>Wait for track to be loaded to manage windows…</span>
              </div>
            } @else {
              <div class="panel-side__inner">
                <div class="panel-block__head">
                  <span class="panel-block__title">Windows</span>
                  <span class="panel-block__meta">{{ windows.length }}</span>
                </div>

                <div class="panel-side__content">
                  <div class="panel-side__table-wrap">
                    <div class="panel-window-scroller">
                      <button
                        type="button"
                        class="panel-window-arrow panel-window-arrow--left"
                        [class.panel-window-arrow--visible]="canScrollWindowsLeft()"
                        (click)="scrollWindows(-1)"
                        aria-label="Scroll to previous windows"
                        tabindex="-1"
                      ></button>

                      <div
                        class="panel-window-list"
                        #windowList
                        (scroll)="onWindowListScroll()"
                      >
                      <button
                        type="button"
                        class="panel-window-item"
                        [class.panel-window-item--selected]="selection.kind === 'whole-track'"
                        (click)="selectWholeTrack()"
                      >
                        <div class="panel-window-item__top">
                          <span class="panel-window-item__name" title="Whole track">
                            Whole track
                          </span>
                          <ui-chip variant="primary" size="sm">Default</ui-chip>
                        </div>

                        <div class="panel-window-item__bottom">
                          <div class="panel-window-item__meta">
                            <ui-chip variant="neutral" size="sm" keyLabel="Fade in">
                              {{ formatFade(currentTrack.fadeInDurationMs ?? 0) }}
                            </ui-chip>
                            <ui-chip variant="neutral" size="sm" keyLabel="Fade out">
                              {{ formatFade(currentTrack.fadeOutDurationMs ?? 0) }}
                            </ui-chip>
                          </div>
                        </div>
                      </button>

                      @for (win of windows; track win.id) {
                        <button
                          type="button"
                          class="panel-window-item"
                          [class.panel-window-item--selected]="selection.kind === 'window' && selection.id === win.id"
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
                      }
                      </div>

                      <button
                        type="button"
                        class="panel-window-arrow panel-window-arrow--right"
                        [class.panel-window-arrow--visible]="canScrollWindowsRight()"
                        (click)="scrollWindows(1)"
                        aria-label="Scroll to more windows"
                        tabindex="-1"
                      ></button>
                    </div>
                  </div>
                </div>
              </div>
            }
          </aside>

          <section class="panel-main">
            @if (editorAvailable) {
              <div class="panel-editor">
                <div class="panel-editor__head">
                  <span class="panel-block__title panel-block__title--primary">
                    {{ editorHeading }}
                  </span>

                  @if (selection.kind !== 'create') {
                    <normal-button
                      size="sm"
                      variant="secondary"
                      [disabled]="!editorReady"
                      (clicked)="startCreateWindow()"
                    >
                      New window
                    </normal-button>
                  }
                </div>

                <div class="panel-editor__body">
                  <app-window-editor-yt
                    [videoId]="ytVideoId"
                    [durationS]="resolvedDurationS || (currentTrack.duration ?? 0)"
                    [initialFromS]="editorFromS"
                    [initialToS]="editorToS"
                    [initialName]="editorName"
                    [initialFadeInMs]="editorFadeInMs"
                    [initialFadeOutMs]="editorFadeOutMs"
                    [lockRegion]="editorLockRegion"
                    [lockName]="editorLockName"
                    [applyLabel]="editorApplyLabel"
                    (apply)="onEditorApply($event)"
                    (ready)="onEditorStreamComplete()"
                  />
                </div>
              </div>
            } @else {
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
            }
          </section>
        </div>
      </ui-dialog-shell>
    }
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

    .panel-window-scroller {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    /* Swipe arrows are mobile-only (see the max-width: 900px block). */
    .panel-window-arrow {
      display: none;
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

    /* Mobile: the side-by-side master/detail layout doesn't fit a phone, so
       stack the windows list above the editor. Everything flows naturally and
       the dialog scrolls as one (no nested scroll panes). */
    @media (max-width: 900px) {
      .panel-error {
        padding-left: 18px;
        padding-right: 18px;
      }

      .panel-body--split {
        grid-template-columns: 1fr;
        gap: 14px;
        padding: 10px;
        overflow: visible;
      }

      .panel-side,
      .panel-main {
        grid-column: 1;
        overflow: visible;
      }

      .panel-side {
        grid-row: 1;
      }

      .panel-main {
        grid-row: 2;
      }

      .panel-side::after {
        display: none;
      }

      .panel-side__inner,
      .panel-side__content,
      .panel-side__table-wrap {
        overflow: visible;
        min-height: 0;
      }

      .panel-side__inner {
        padding: 4px 0 0;
        gap: 12px;
      }

      .panel-window-scroller {
        flex: none;
        display: block;
      }

      /* Windows become a horizontal, swipeable row above the editor. */
      .panel-window-list {
        flex-direction: row;
        overflow-x: auto;
        overflow-y: hidden;
        gap: 10px;
        padding: 2px 2px 8px;
        scroll-snap-type: x proximity;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }

      .panel-window-item {
        flex: 0 0 auto;
        width: min(80%, 280px);
        scroll-snap-align: start;
      }

      .panel-window-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
        border: 1px solid var(--app-border-color-soft);
        background: var(--app-surface-elevated);
        color: var(--app-heading);
        font-size: 0;
        cursor: pointer;
        box-shadow: var(--app-shadow-soft);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
        z-index: 2;
      }

      .panel-window-arrow::before {
        content: '';
        width: 9px;
        height: 9px;
        border-top: 2px solid currentColor;
        border-right: 2px solid currentColor;
      }

      .panel-window-arrow--left {
        left: 6px;
      }

      .panel-window-arrow--left::before {
        transform: rotate(-135deg);
      }

      .panel-window-arrow--right {
        right: 6px;
      }

      .panel-window-arrow--right::before {
        transform: rotate(45deg);
      }

      .panel-window-arrow--visible {
        opacity: 0.96;
        pointer-events: auto;
      }

      .panel-editor {
        height: auto;
      }

      .panel-editor__body {
        overflow: visible;
      }

      .panel-editor__head {
        padding: 12px;
      }
    }
  `],
})
export class TrackWindowsPanelComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly track = input<Track | null>(null);

  readonly close = output<void>();
  readonly saveWindow = output<WindowSaveEvent>();
  readonly deleteWindow = output<WindowDeleteEvent>();
  readonly saveTrackFades = output<TrackFadesSaveEvent>();

  resolvedDurationS = 0;
  ytVideoId: string | null = null;

  /** Set when the track link isn't a usable YouTube URL. */
  streamError: string | null = null;

  editorStreamComplete = false;

  selection: PanelSelection = { kind: 'create' };
  editorFromS: number | null = null;
  editorToS: number | null = null;
  editorName = '';
  editorFadeInMs = 0;
  editorFadeOutMs = 0;
  editorLockRegion = false;
  editorLockName = false;

  // ── Mobile windows carousel ──────────────────────────────────────────
  /** Whether the horizontal windows row can scroll further left / right.
      Drives the swipe arrow indicators shown on mobile. */
  readonly canScrollWindowsLeft = signal(false);
  readonly canScrollWindowsRight = signal(false);

  private windowListEl: HTMLElement | null = null;
  private windowListResizeObserver: ResizeObserver | null = null;

  @ViewChild('windowList')
  set windowListRef(ref: ElementRef<HTMLElement> | undefined) {
    this.windowListResizeObserver?.disconnect();
    this.windowListResizeObserver = null;
    this.windowListEl = ref?.nativeElement ?? null;

    if (this.windowListEl && typeof ResizeObserver !== 'undefined') {
      this.windowListResizeObserver = new ResizeObserver(() =>
        this.zone.run(() => this.updateWindowScrollState()),
      );
      this.windowListResizeObserver.observe(this.windowListEl);
    }

    this.updateWindowScrollState();
  }

  private currentTrackId: number | null = null;
  /** Whether the default (whole-track) entry has been auto-selected for the
      current track once the editor became ready. */
  private hasAutoSelected = false;
  /** Window ids present just before a create-save, used to auto-select the
      newly created window once the refreshed track arrives. */
  private windowIdsBeforeCreate: Set<number> | null = null;

  constructor() {
    // React to the track input the way the old ngOnChanges did: a different
    // track id restarts the preview session; the same id (e.g. a refreshed
    // track after a save) just re-syncs the current selection.
    effect(() => {
      const track = this.track();
      const newTrackId = track?.id ?? null;

      untracked(() => {
        if (newTrackId !== this.currentTrackId) {
          this.resetState();
          this.currentTrackId = newTrackId;

          if (track?.id != null) {
            this.startEditorSessionForTrack(track.id, track.duration ?? 0);
            this.syncSelectionWithTrack();
          }
        } else {
          this.syncSelectionWithTrack();
        }
      });
    });

    // Recompute the mobile carousel arrows after the windows list re-renders
    // (windows added/removed). setTimeout lets layout settle first.
    effect(() => {
      this.track();
      setTimeout(() => this.updateWindowScrollState(), 0);
    });
  }

  get windows(): TrackWindow[] {
    return this.track()?.trackWindows ?? [];
  }

  get editorAvailable(): boolean {
    return !!this.ytVideoId;
  }

  get editorReady(): boolean {
    return !!this.ytVideoId && this.editorStreamComplete;
  }

  get editorHeading(): string {
    switch (this.selection.kind) {
      case 'whole-track':
        return 'Whole track fades';
      case 'window':
        return 'Edit window';
      default:
        return 'Create new window';
    }
  }

  get editorApplyLabel(): string {
    switch (this.selection.kind) {
      case 'whole-track':
        return 'Save track fades';
      case 'window':
        return 'Save changes';
      default:
        return 'Create window';
    }
  }

  ngOnDestroy(): void {
    this.windowListResizeObserver?.disconnect();
    this.resetState();
  }

  onWindowListScroll(): void {
    this.updateWindowScrollState();
  }

  scrollWindows(direction: 1 | -1): void {
    const el = this.windowListEl;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  private updateWindowScrollState(): void {
    const el = this.windowListEl;
    if (!el) {
      this.canScrollWindowsLeft.set(false);
      this.canScrollWindowsRight.set(false);
      return;
    }

    const tolerancePx = 4;
    const maxScroll = el.scrollWidth - el.clientWidth;

    if (maxScroll <= tolerancePx) {
      this.canScrollWindowsLeft.set(false);
      this.canScrollWindowsRight.set(false);
      return;
    }

    const items = el.querySelectorAll<HTMLElement>('.panel-window-item');
    if (!items.length) {
      this.canScrollWindowsLeft.set(false);
      this.canScrollWindowsRight.set(false);
      return;
    }

    const firstItem = items.item(0);
    const lastItem = items.item(items.length - 1);
    if (!firstItem || !lastItem) {
      this.canScrollWindowsLeft.set(false);
      this.canScrollWindowsRight.set(false);
      return;
    }

    const scrollerRect = el.getBoundingClientRect();
    const firstItemRect = firstItem.getBoundingClientRect();
    const lastItemRect = lastItem.getBoundingClientRect();

    this.canScrollWindowsLeft.set(firstItemRect.left < scrollerRect.left - tolerancePx);
    this.canScrollWindowsRight.set(lastItemRect.right > scrollerRect.right + tolerancePx);
  }

  onClose(): void {
    this.resetState();
    this.close.emit();
  }

  retryStream(): void {
    const track = this.track();
    if (track?.id != null) {
      this.startEditorSessionForTrack(track.id, track.duration ?? 0);
    }
  }

  selectWholeTrack(): void {
    if (!this.editorReady) return;

    const track = this.track();
    this.selection = { kind: 'whole-track' };
    this.editorFromS = 0;
    this.editorToS = this.wholeTrackDurationS();
    this.editorName = 'Whole track';
    this.editorFadeInMs = track?.fadeInDurationMs ?? 0;
    this.editorFadeOutMs = track?.fadeOutDurationMs ?? 0;
    this.editorLockRegion = true;
    this.editorLockName = true;
  }

  selectWindow(win: TrackWindow): void {
    if (!this.editorReady || win.id == null) return;

    this.selection = { kind: 'window', id: win.id };
    this.loadEditorFromWindow(win);
  }

  startCreateWindow(): void {
    if (!this.editorReady) return;

    this.selection = { kind: 'create' };
    this.editorFromS = null;
    this.editorToS = null;
    this.editorName = '';
    this.editorFadeInMs = 0;
    this.editorFadeOutMs = 0;
    this.editorLockRegion = false;
    this.editorLockName = false;
  }

  onEditorApply(result: WindowEditorResult): void {
    const trackId = this.track()?.id;
    if (trackId == null || !this.editorReady) return;

    // The synthetic whole-track window persists to the track's own fades.
    if (this.selection.kind === 'whole-track') {
      this.saveTrackFades.emit({
        trackId,
        fadeInMs: result.fadeInMs,
        fadeOutMs: result.fadeOutMs,
      });
      return;
    }

    const body: TrackWindowRequest = {
      name: result.name || undefined,
      positionFrom: result.positionFrom,
      positionTo: result.positionTo,
      fadeInDurationMs: result.fadeInMs,
      fadeOutDurationMs: result.fadeOutMs,
    };

    const windowId = this.selection.kind === 'window' ? this.selection.id : undefined;

    // Creating a window: remember the current ids so the refreshed track can
    // auto-select the newly created one.
    if (windowId == null) {
      this.windowIdsBeforeCreate = new Set(
        this.windows.map(w => w.id).filter((id): id is number => id != null),
      );
    }

    this.saveWindow.emit({ trackId, windowId, body });
  }

  async onDeleteWindow(win: TrackWindow): Promise<void> {
    const trackId = this.track()?.id;
    if (trackId == null || win.id == null) return;

    const name = win.name?.trim();
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete window',
      message: name ? `Delete window "${name}"?` : 'Delete this window?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    const wasSelected = this.selection.kind === 'window' && this.selection.id === win.id;
    this.deleteWindow.emit({ trackId, windowId: win.id });

    if (wasSelected) {
      this.startCreateWindow();
    }
  }

  onEditorStreamComplete(): void {
    this.editorStreamComplete = true;

    // Default to the always-present whole-track entry as soon as the editor is
    // ready, unless the user already picked something.
    if (!this.hasAutoSelected && this.selection.kind === 'create') {
      this.hasAutoSelected = true;
      this.selectWholeTrack();
    }
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatFade(ms: number): string {
    return formatFadeMs(ms);
  }

  private wholeTrackDurationS(): number {
    return this.resolvedDurationS || (this.track()?.duration ?? 0);
  }

  private startEditorSessionForTrack(_trackId: number, durationS: number): void {
    // The YT editor resolves audio from the track link client-side and renders a
    // timeline (no backend stream/waveform session).
    this.ytVideoId = parseYoutubeId(this.track()?.trackLink ?? null);
    this.resolvedDurationS = durationS;
    this.streamError = this.ytVideoId
      ? null
      : 'This track is not a YouTube link and cannot be previewed.';
  }

  private loadEditorFromWindow(win: TrackWindow): void {
    this.editorFromS = win.positionFrom ?? 0;
    this.editorToS = win.positionTo ?? 0;
    this.editorName = win.name ?? '';
    this.editorFadeInMs = win.fadeInDurationMs ?? 0;
    this.editorFadeOutMs = win.fadeOutDurationMs ?? 0;
    this.editorLockRegion = false;
    this.editorLockName = false;
  }

  /**
   * Keep the editor bound to the freshest version of the selected entry after
   * the track is reloaded (e.g. following a save). The whole-track entry always
   * exists; a window selection that no longer resolves falls back to create.
   */
  private syncSelectionWithTrack(): void {
    // A create just resolved: select the window that wasn't there before.
    if (this.windowIdsBeforeCreate) {
      const known = this.windowIdsBeforeCreate;
      this.windowIdsBeforeCreate = null;
      const created = this.windows.find(w => w.id != null && !known.has(w.id));
      if (created) {
        this.selectWindow(created);
        return;
      }
    }

    if (this.selection.kind === 'whole-track') {
      this.selectWholeTrack();
      return;
    }

    if (this.selection.kind !== 'window') {
      return;
    }

    const selectedId = this.selection.id;
    const selected = this.windows.find(w => w.id === selectedId);

    if (!selected) {
      this.startCreateWindow();
      return;
    }

    this.loadEditorFromWindow(selected);
  }

  private resetState(): void {
    this.streamError = null;
    this.resolvedDurationS = 0;
    this.ytVideoId = null;
    this.currentTrackId = null;
    this.editorStreamComplete = false;
    this.hasAutoSelected = false;
    this.windowIdsBeforeCreate = null;
    this.selection = { kind: 'create' };
    this.editorFromS = null;
    this.editorToS = null;
    this.editorName = '';
    this.editorFadeInMs = 0;
    this.editorFadeOutMs = 0;
    this.editorLockRegion = false;
    this.editorLockName = false;
  }
}
