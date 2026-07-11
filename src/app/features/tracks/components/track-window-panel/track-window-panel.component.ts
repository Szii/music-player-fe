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
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { formatFadeMs } from '../../utils/fade';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
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

export interface TrackWindowsReorderEvent {
  trackId: number;
  windowIds: number[];
  movedWindowId: number;
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
    IconButtonComponent,
    UiEmptyStateComponent,
    UiChipComponent,
    UiDialogShellComponent,
  ],
  templateUrl: './track-window-panel.component.html',
  styleUrl: './track-window-panel.component.scss',
})
export class TrackWindowsPanelComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly track = input<Track | null>(null);

  /** Editor-wide preview-loop preference (applies to every window, not one).
      Persisted across sessions. */
  readonly loopPreview = persistentSignal('mpf:window-editor:loop-preview', true);

  readonly close = output<void>();
  readonly saveWindow = output<WindowSaveEvent>();
  readonly deleteWindow = output<WindowDeleteEvent>();
  readonly saveTrackFades = output<TrackFadesSaveEvent>();
  readonly reorderWindows = output<TrackWindowsReorderEvent>();

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
  /** Window to keep visible after a reorder refresh. */
  private pendingScrollWindowId: number | null = null;

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
    // (windows added/removed/reordered). setTimeout lets layout settle first.
    effect(() => {
      this.track();
      setTimeout(() => {
        this.updateWindowScrollState();

        if (this.pendingScrollWindowId != null) {
          const id = this.pendingScrollWindowId;
          this.pendingScrollWindowId = null;
          this.scrollWindowIntoView(id);
        }
      }, 0);
    });
  }

  get windows(): TrackWindow[] {
    return [...(this.track()?.trackWindows ?? [])].sort((a, b) => {
      const positionA = a.positionWithinTrack ?? Number.MAX_SAFE_INTEGER;
      const positionB = b.positionWithinTrack ?? Number.MAX_SAFE_INTEGER;

      if (positionA !== positionB) {
        return positionA - positionB;
      }

      return (a.id ?? 0) - (b.id ?? 0);
    });
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
        return this.editorName.trim() || 'Untitled window';
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

  toggleLoopPreview(): void {
    this.loopPreview.update(enabled => !enabled);
  }

  onWindowListScroll(): void {
    this.updateWindowScrollState();
  }

  scrollWindows(direction: 1 | -1): void {
    const el = this.windowListEl;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  canMoveWindow(win: TrackWindow, direction: 1 | -1): boolean {
    if (win.id == null) return false;

    const index = this.windows.findIndex(item => item.id === win.id);
    if (index < 0) return false;

    const targetIndex = index + direction;
    return targetIndex >= 0 && targetIndex < this.windows.length;
  }

  onMoveWindowClick(event: Event, win: TrackWindow, direction: 1 | -1): void {
    event.preventDefault();
    event.stopPropagation();
    this.moveWindow(win, direction);
  }

  private moveWindow(win: TrackWindow, direction: 1 | -1): void {
    const trackId = this.track()?.id;
    if (trackId == null || win.id == null) return;

    const orderedWindows = this.windows;
    const index = orderedWindows.findIndex(item => item.id === win.id);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= orderedWindows.length) {
      return;
    }

    const windowIds = orderedWindows
      .map(item => item.id)
      .filter((id): id is number => id != null);

    [windowIds[index], windowIds[targetIndex]] = [windowIds[targetIndex], windowIds[index]];

    this.selection = { kind: 'window', id: win.id };
    this.pendingScrollWindowId = win.id;

    this.reorderWindows.emit({
      trackId,
      windowIds,
      movedWindowId: win.id,
    });
  }

  private scrollWindowIntoView(windowId: number): void {
    this.centerCarouselItem(
      this.windowListEl?.querySelector<HTMLElement>(`[data-window-id="${windowId}"]`) ?? null,
    );
  }

  /**
   * Slide the windows carousel so the given item is centred (a sliding window
   * over the full list), the same way the mobile boards page centres its tabs.
   * Only scrolls horizontally, so it never jolts the dialog vertically; a no-op
   * on the desktop vertical list where the row can't scroll sideways.
   */
  private centerCarouselItem(item: HTMLElement | null): void {
    const el = this.windowListEl;
    if (!el || !item) return;

    const elRect = el.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const delta = (itemRect.left - elRect.left) - (el.clientWidth - itemRect.width) / 2;

    el.scrollTo({ left: Math.max(0, el.scrollLeft + delta), behavior: 'smooth' });
    setTimeout(() => this.updateWindowScrollState(), 250);
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

    // Whole track is the first carousel item.
    this.centerCarouselItem(
      this.windowListEl?.querySelector<HTMLElement>('.panel-window-item') ?? null,
    );
  }

  selectWindow(win: TrackWindow): void {
    if (!this.editorReady || win.id == null) return;

    this.selection = { kind: 'window', id: win.id };
    this.loadEditorFromWindow(win);

    this.centerCarouselItem(
      this.windowListEl?.querySelector<HTMLElement>(`[data-window-id="${win.id}"]`) ?? null,
    );
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
    this.pendingScrollWindowId = null;
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
