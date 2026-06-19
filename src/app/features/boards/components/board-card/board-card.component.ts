import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Board, Group, Track } from '../../../../api/generated';
import { BoardPlayerYtDeckComponent } from '../board-player-yt-deck/board-player-yt-deck.component';
import { PLAYLIST_CROSSFADE_MS } from '../../utils/crossfade';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import {
  UiSelectComponent,
} from '../../../../shared/ui/select/ui-select.component';
import { UiVolumeSliderComponent } from '../../../../shared/ui/volume-slider/ui-volume-slider.component';
import { UiPlayButtonComponent } from '../../../../shared/ui/play-button/ui-play-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiIconComponent, UiIconName } from '../../../../shared/ui/icon/ui-icon.component';
import { UiInlineSelectComponent } from '../../../../shared/ui/inline-select/ui-inline-select.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { BoardShortcutsService } from '../../../../core/services/board-shortcuts.service';
import { ScrollLockService } from '../../../../core/services/scroll-lock.service';
import { BottomSheetDragDirective } from '../../../../shared/ui/bottom-sheet/bottom-sheet-drag.directive';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';

export interface PlaylistOptions {
  random: boolean;
}

export type PlaybackMode = 'single' | 'playlist' | 'sequence';

/**
 * Loop behaviour for single-track (non-playlist) playback, chosen from the
 * Playback-settings dropdown. `sequence` steps through the track's windows in
 * order; the others loop (or don't loop) the whole track / selected window.
 */
export type LoopMode = 'off' | 'whole' | 'sequence';

@Component({
  selector: 'app-board-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    OverlayModule,
    BoardPlayerYtDeckComponent,
    IconButtonComponent,
    UiSelectComponent,
    UiVolumeSliderComponent,
    UiPlayButtonComponent,
    UiChipComponent,
    UiIconComponent,
    UiInlineSelectComponent,
    UiAlertComponent,
    BottomSheetDragDirective,
    UiCharCounterComponent,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  templateUrl: './board-card.component.html',
  styleUrl: './board-card.component.scss',
})
export class BoardCardComponent implements OnInit {
  readonly board = input.required<Board>();
  readonly availableGroups = input<Group[]>([]);
  readonly status = input<'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR'>('STOPPED');
  readonly selectedWindowId = input<number | null>(null);
  readonly masterVolume = input(1);
  readonly masterFadeRampMs = input(0);
  readonly volumePercent = input<number>(100);
  readonly playlistMode = input(false);
  readonly playlistOptions = input<PlaylistOptions>({ random: false });
  /**
   * Sequence mode plays the selected track's windows one after another. The page
   * receives it from the backend-backed board state and keeps it mutually
   * exclusive with playlist mode.
   */
  readonly sequentialWindows = input(false);

  readonly isPlaying = computed(() => this.status() === 'PLAYING');

  /** YouTube video id parsed from the selected track's link. */
  readonly selectedVideoId = computed(() =>
    parseYoutubeId(this.board().selectedTrack?.trackLink ?? null),
  );

  readonly delete = output<void>();
  readonly groupChange = output<number | null>();
  readonly trackChange = output<number | null>();
  readonly windowChange = output<number | null>();
  readonly trackWithWindowChange = output<{ trackId: number | null; windowId: number | null }>();
  readonly loopModeChange = output<LoopMode>();
  readonly toggleOverplay = output<void>();
  readonly play = output<void>();
  readonly stop = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();
  readonly modeChange = output<PlaybackMode>();
  readonly playlistOptionsChange = output<PlaylistOptions>();
  readonly skipNext = output<void>();
  readonly volumePreviewChange = output<number>();
  readonly volumeCommit = output<number>();
  readonly rename = output<string>();
  readonly navigateBoardUp = output<void>();
  readonly navigateBoardDown = output<void>();
  readonly requestPlay = output<void>();

  readonly settingsOpen = signal(false);
  /** Mobile only: plays the settings sheet's slide-down before it's removed. */
  readonly settingsClosing = signal(false);
  private settingsCloseTimer: ReturnType<typeof setTimeout> | null = null;
  readonly expanded = signal(false);
  readonly renaming = signal(false);
  readonly renameValue = signal('');
  readonly nameMaxLength = FIELD_LIMITS.board.name;
  readonly displayedVolumePercent = signal(100);
  readonly capturingShortcut = signal(false);

  readonly settingsPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];
  @ViewChild('renameInput') renameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('groupSelectRef') groupSelectRef?: UiSelectComponent;
  @ViewChild('trackSelectRef') trackSelectRef?: UiSelectComponent;
  @ViewChild('windowSelectRef') windowSelectRef?: UiSelectComponent;
  @ViewChild('chevronBtn') chevronBtnRef?: ElementRef<HTMLButtonElement>;

  focusGroup(): void {
    this.groupSelectRef?.focusTrigger();
  }

  focusTrack(): void {
    this.trackSelectRef?.focusTrigger();
  }

  focusWindow(): void {
    this.windowSelectRef?.focusTrigger();
  }

  focusChevron(): void {
    this.chevronBtnRef?.nativeElement.focus();
  }

  onChevronKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.expanded() ? this.focusGroup() : this.navigateBoardDown.emit();
        return;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateBoardUp.emit();
        return;

      case 'Escape':
        if (this.expanded()) {
          event.preventDefault();
          this.setExpanded(false);
        }
        return;

      case 'Enter':
      case ' ':
        event.preventDefault();
        this.toggleExpanded();
        return;
    }
  }

  private readonly shortcutsService = inject(BoardShortcutsService);
  private shortcutCaptureHandler: ((event: KeyboardEvent) => void) | null = null;

  readonly shortcut = computed(() => {
    const id = this.board().id;
    if (id == null) return null;
    return this.shortcutsService.shortcuts()[id] ?? null;
  });


  readonly displayedTrack = computed(() => {
    const board = this.board();
    const selected = board.selectedTrack;
    if (!selected) return null;
    const tracks = board.availableTracks ?? [];
    return tracks.some(t => t.id === selected.id) ? selected : null;
  });

  readonly groupDesynced = computed(() => {
    const board = this.board();
    if (!board.selectedTrack || !board.selectedGroup) return false;
    const tracks = board.availableTracks ?? [];
    return !tracks.some(t => t.id === board.selectedTrack?.id);
  });

  private readonly playingTrackWindows = computed(
    () => this.board().selectedTrack?.trackWindows ?? [],
  );

  readonly windows = computed(() => this.displayedTrack()?.trackWindows ?? []);

  readonly selectedWindow = computed(() => {
    const id = this.selectedWindowId();
    if (id == null) return null;
    return this.playingTrackWindows().find(w => (w as any).id === id) ?? null;
  });

  readonly hasSelectedWindow = computed(() =>
    !this.playlistMode() && !this.sequenceUnavailable() && this.selectedWindow() != null,
  );

  readonly selectedWindowStart = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow() as any).positionFrom : null,
  );

  readonly selectedWindowEnd = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow() as any).positionTo : null,
  );

  /**
   * Fade lengths (ms) that drive the player's crossfade: the selected window's
   * fades when one is active, otherwise the track's own ("whole track") fades.
   */
  readonly selectedWindowFadeInMs = computed(() => {
    const window = this.hasSelectedWindow() ? this.selectedWindow() : null;
    return window?.fadeInDurationMs ?? this.board().selectedTrack?.fadeInDurationMs ?? 0;
  });

  readonly selectedWindowFadeOutMs = computed(() => {
    const window = this.hasSelectedWindow() ? this.selectedWindow() : null;
    return window?.fadeOutDurationMs ?? this.board().selectedTrack?.fadeOutDurationMs ?? 0;
  });

  /** Playlist track-to-track uses a fixed crossfade (whole tracks advancing
      through an async backend call); other modes derive it from the fades. */
  readonly playlistCrossfadeMs = computed(() =>
    this.playlistMode() ? PLAYLIST_CROSSFADE_MS : null,
  );

  // In sequence mode the page advances windows and loops the whole sequence, so
  // the player itself must not loop the current window. When the track can't be
  // sequenced (fewer than two windows) the sequence falls back to looping the
  // whole track, so the player loops instead of stopping at the end.
  readonly effectiveRepeat = computed(() => {
    if (this.playlistMode()) return false;
    if (this.sequentialWindows()) return !this.canSequenceWindows();
    return this.board().repeat ?? false;
  });

  readonly showWindowSelector = computed(() =>
    !this.playlistMode() && this.windows().length > 0,
  );

  /** Playlist mode needs at least one playable track in the selected group. */
  readonly canUsePlaylist = computed(() =>
    this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length >= 1,
  );

  readonly playlistButtonTitle = computed(() =>
    this.canUsePlaylist()
      ? 'Play through the selected group'
      : 'This group has no tracks to play',
  );

  /**
   * Inline warning shown on the board when its current configuration can't play
   * as set up: a window sequence on a track without enough windows (it falls back
   * to looping the whole track), or a playlist on a group with no tracks.
   */
  readonly warningMessage = computed<string | null>(() => {
    if (this.playlistMode()) {
      return this.canUsePlaylist()
        ? null
        : 'This group has no tracks to play. Pick a group that has tracks.';
    }

    if (this.board().selectedTrack && this.sequenceUnavailable()) {
      return 'Window sequence needs at least two windows on this track — playing the whole track on loop instead.';
    }

    return null;
  });

  // The board state is only Single or Playlist; sequence is surfaced through the
  // loop ribbon, not as a board state.
  readonly modeChipLabel = computed(() =>
    this.playlistMode() ? 'Playlist' : 'Single',
  );

  readonly modeIconName = computed<UiIconName>(() =>
    this.playlistMode() ? 'playlist' : 'single',
  );

  readonly modeChipTooltip = computed(() =>
    this.playlistMode() ? 'Playlist mode' : 'Single-track mode',
  );

  // Always-present loop ribbon. In playlist mode each track plays to its end, so
  // looping is fixed to "whole track".
  readonly loopRibbonLabel = computed(() => {
    if (this.playlistMode()) return 'Whole';
    switch (this.loopMode()) {
      case 'whole':
        return 'Whole';
      case 'sequence':
        return 'Sequence';
      default:
        return 'Off';
    }
  });

  /** Full loop wording for the chip tooltip — the visible label is iconified. */
  readonly loopRibbonTooltip = computed(() => {
    if (this.playlistMode()) return 'Loop: whole playback';
    switch (this.loopMode()) {
      case 'whole':
        return 'Loop: whole playback';
      case 'sequence':
        return 'Loop: window sequence';
      default:
        return 'Loop: off';
    }
  });

  readonly randomRibbonLabel = computed(() =>
    this.playlistOptions().random ? 'Shuffle' : 'In order',
  );

  readonly randomIconName = computed<UiIconName>(() =>
    this.playlistOptions().random ? 'shuffle' : 'ordered',
  );

  readonly randomRibbonTooltip = computed(() =>
    this.playlistOptions().random
      ? 'Shuffle the group'
      : 'Play the group in order',
  );

  readonly canStartPlayback = computed(() => {
    if (!this.playlistMode()) {
      return !!this.board().selectedTrack;
    }

    return this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length > 0;
  });

  readonly currentTrackLabel = computed(() => {
    const t = this.board().selectedTrack;
    return t ? (t.trackName || t.trackOriginalName || ('Track #' + t.id)) : '—';
  });

  readonly currentGroupLabel = computed(() =>
    this.board().selectedGroup?.listName || 'All tracks',
  );

  readonly currentWindowLabel = computed(() => {
    if (this.playlistMode()) return 'Auto';
    const w = this.selectedWindow() as any;
    if (!w) return 'Whole playback';
    return w.name || 'Window';
  });

  /** Windows belonging to the selected track; sequencing needs at least two. */
  private readonly selectedTrackWindowCount = computed(
    () => this.board().selectedTrack?.trackWindows?.length ?? 0,
  );

  /** Window sequence only makes sense with two or more windows to step between. */
  readonly canSequenceWindows = computed(() => this.selectedTrackWindowCount() >= 2);

  /**
   * Sequence mode is selected but the track can't be sequenced (fewer than two
   * windows). Playback falls back to looping the whole track.
   */
  readonly sequenceUnavailable = computed(
    () => !this.playlistMode() && this.sequentialWindows() && !this.canSequenceWindows(),
  );

  readonly loopModeChoices = computed<{ value: LoopMode; label: string; disabled?: boolean }[]>(() => [
    { value: 'off', label: 'Off' },
    { value: 'whole', label: 'Whole playback' },
    // Disable sequencing when the track lacks the windows to step through.
    { value: 'sequence', label: 'Window sequence', disabled: !this.canSequenceWindows() },
  ]);

  /** Current single-track loop behaviour, derived from the board flags. */
  readonly loopMode = computed<LoopMode>(() => {
    if (this.sequentialWindows()) return 'sequence';
    return this.board().repeat ? 'whole' : 'off';
  });

  readonly loopModeHint = computed(() => {
    switch (this.loopMode()) {
      case 'whole':
        return 'Loops the track or selected window';
      case 'sequence':
        return 'Steps through every window, looping the sequence';
      default:
        return 'Plays once, then stops';
    }
  });

  readonly groupOptions = computed(() =>
    // A group with no tracks has nothing to select or play, so disable it.
    this.availableGroups().map(g => ({
      label: g.listName || ('Group #' + g.id),
      value: g.id,
      disabled: (g.tracks?.length ?? 0) === 0,
    })),
  );

  readonly trackOptions = computed(() => {
    // In sequence mode only tracks with at least two windows can be sequenced;
    // the rest are shown but disabled so the active sequence isn't dropped.
    const sequencing = this.sequentialWindows();

    return (this.board().availableTracks ?? []).map(t => {
      const trackWindows = t.trackWindows ?? [];
      // Sequence mode plays the windows automatically, so picking an individual
      // window from the track dropdown makes no sense — hide the sub-options there.
      const subOptions = !sequencing && trackWindows.length > 0
        ? [
            {
              label: 'Whole playback',
              value: { trackId: t.id ?? null, windowId: null },
            },
            ...trackWindows.map(w => ({
              label: (w as any).name || 'Window',
              value: { trackId: t.id ?? null, windowId: (w as any).id ?? null },
            })),
          ]
        : undefined;

      return {
        label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
        value: t.id,
        subOptions,
        disabled: sequencing && trackWindows.length < 2,
      };
    });
  });

  readonly windowOptions = computed(() =>
    this.windows().map(w => ({
      label: (w as any).name || 'Window #' + (w as any).id,
      value: (w as any).id,
    })),
  );

  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly scrollLock = inject(ScrollLockService);
  constructor() {
    effect(() => {
      const pct = this.volumePercent();
      this.displayedVolumePercent.set(clampPct(pct));
    });

    // On mobile the settings popover is a bottom sheet that owns the screen:
    // lock background scroll and (via the shared body class) hide the bottom nav
    // so it doesn't overlap the sheet. Ref-counted, mobile only.
    effect((onCleanup) => {
      if (!this.settingsOpen()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.endShortcutCapture();
    });
  }

  toggleCaptureShortcut(): void {
    if (this.capturingShortcut()) {
      this.endShortcutCapture();
      return;
    }

    this.capturingShortcut.set(true);
    this.shortcutsService.suspendTriggers();

    this.shortcutCaptureHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.endShortcutCapture();
        return;
      }

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

      const formatted = BoardShortcutsService.formatEvent(event);
      if (!formatted) return;

      const id = this.board().id;
      if (id == null) {
        this.endShortcutCapture();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.shortcutsService.setShortcut(id, formatted);
      this.endShortcutCapture();
    };

    document.addEventListener('keydown', this.shortcutCaptureHandler, true);
  }

  clearShortcut(): void {
    const id = this.board().id;
    if (id == null) return;
    this.shortcutsService.clearShortcut(id);
  }

  private endShortcutCapture(): void {
    if (this.shortcutCaptureHandler) {
      document.removeEventListener('keydown', this.shortcutCaptureHandler, true);
      this.shortcutCaptureHandler = null;
    }
    if (this.capturingShortcut()) {
      this.capturingShortcut.set(false);
    }
    this.shortcutsService.resumeTriggers();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.settingsOpen()) return;
    if (!(event.target instanceof Node)) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      // Use the animated close; guarded so it doesn't race the backdrop click.
      this.animateCloseSettings();
    }
  }

  toggleExpanded(): void {
    this.setExpanded(!this.expanded());
  }

  private setExpanded(expanded: boolean): void {
    this.expanded.set(expanded);
    if (!expanded) this.closeSettingsMenu();
  }

  startRename(): void {
    this.renameValue.set(this.board().name || '');
    this.renaming.set(true);
    setTimeout(() => this.renameInputRef?.nativeElement.select(), 0);
  }

  commitRename(): void {
    if (!this.renaming()) return;
    this.renaming.set(false);
    const name = this.renameValue().trim();
    if (name && name !== this.board().name) {
      this.rename.emit(name);
    }
  }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    } else if (event.key === 'Escape') {
      this.renaming.set(false);
    }
  }

  toggleSettingsMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.settingsOpen()) {
      this.animateCloseSettings();
      return;
    }
    if (this.settingsCloseTimer) {
      clearTimeout(this.settingsCloseTimer);
      this.settingsCloseTimer = null;
    }
    this.settingsClosing.set(false);
    this.settingsOpen.set(true);
  }

  /**
   * Close the settings popover. On mobile (where it's a bottom sheet) play a
   * slide-down first, mirroring the open animation, then remove it.
   */
  animateCloseSettings(): void {
    if (this.settingsClosing()) return;

    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) {
      this.closeSettingsMenu();
      return;
    }

    this.settingsClosing.set(true);
    this.settingsCloseTimer = setTimeout(() => {
      this.settingsCloseTimer = null;
      this.closeSettingsMenu();
    }, 200);
  }

  closeSettingsMenu(): void {
    this.settingsOpen.set(false);
    this.settingsClosing.set(false);
    this.endShortcutCapture();
  }

  /**
   * The mode switch now only toggles playlist vs single-track playback; the
   * sequence option moved into the Loop-mode dropdown. Switching to single from
   * sequence is done via that dropdown, so an already-non-playlist board ignores
   * a "Single" click and keeps its current loop mode.
   */
  setPlaylistTab(playlist: boolean): void {
    if (playlist === this.playlistMode()) return;
    this.modeChange.emit(playlist ? 'playlist' : 'single');
  }

  onLoopModeSelected(mode: string): void {
    if (mode === this.loopMode()) return;
    this.loopModeChange.emit(mode as LoopMode);
  }

  onPlaylistRandomToggle(): void {
    this.playlistOptionsChange.emit({
      ...this.playlistOptions(),
      random: !this.playlistOptions().random,
    });
  }

  onVolumePreview(value: number): void {
    const v = clampPct(value);
    this.displayedVolumePercent.set(v);
    this.volumePreviewChange.emit(v);
  }

  onVolumeCommit(value: number): void {
    const v = clampPct(value);
    this.displayedVolumePercent.set(v);
    this.volumeCommit.emit(v);
  }

  onPrimaryAction(): void {
    if (this.isPlaying()) {
      this.stop.emit();
      return;
    }

    this.play.emit();
  }

  /** Double-tap / double-click on empty card space toggles play. */
  onCardActivate(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest(
        'button, a, input, select, textarea, ui-select, ui-inline-select, ui-volume-slider, .board-card__title-wrap',
      )
    ) {
      return;
    }
    this.onPrimaryAction();
  }



  private getPlaylistCandidates(groupId: number | null): Track[] {
    const unique = new Map<number, Track>();

    const tracks =
      groupId == null
        ? (this.board().availableTracks ?? [])
        : (this.availableGroups().find(group => group.id === groupId)?.tracks ?? []);

    for (const track of tracks) {
      if (track?.id != null) {
        unique.set(track.id, track);
      }
    }

    return Array.from(unique.values());
  }
}

function clampPct(v: number): number {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(Math.round(n), 100))
    : 100;
}