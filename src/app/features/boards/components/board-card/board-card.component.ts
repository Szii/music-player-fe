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
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Board, Group, LinkedBoardMode, Track } from '../../../../api/generated';
import { BoardPlayerYtDeckComponent } from '../board-player-yt-deck/board-player-yt-deck.component';
import { PLAYLIST_CROSSFADE_MS } from '../../utils/crossfade';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import {
  UiSelectComponent,
  UiSelectOption,
  UiSelectSubOptionEvent,
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
import {
  profanityErrorMessage,
  hasProfanity,
} from '../../../../shared/validators/profanity.validator';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';
import { LinkedBoardChoice, LinkedBoardSelection } from '../../models/linked-board-choice';

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

let nextCardId = 0;

@Component({
  selector: 'app-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    TranslocoPipe,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  templateUrl: './board-card.component.html',
  styleUrl: './board-card.component.scss',
})
export class BoardCardComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so every label recomputes when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate(key, params);
  }

  readonly board = input.required<Board>();
  readonly availableGroups = input<Group[]>([]);
  readonly libraryGroups = input<Group[]>([]);
  readonly libraryTracks = input<Track[]>([]);
  readonly status = input<'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR'>('STOPPED');
  readonly selectedWindowId = input<string | null>(null);
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
  /** Boards of the session this board can hand playback over to (may include itself). */
  readonly linkedBoardChoices = input<LinkedBoardChoice[]>([]);
  /** Paused by another board's pause-and-resume action; resumes when that one ends. */
  readonly heldForResume = input(false);
  readonly locked = input(false);

  readonly isPlaying = computed(() => this.status() === 'PLAYING');

  /** YouTube video id parsed from the selected track's link. */
  readonly selectedVideoId = computed(() =>
    parseYoutubeId(this.board().selectedTrack?.trackLink ?? null),
  );

  readonly delete = output<void>();
  readonly groupChange = output<string | null>();
  readonly trackChange = output<string | null>();
  readonly windowChange = output<string | null>();
  readonly trackWithWindowChange = output<{ trackId: string | null; windowId: string | null }>();
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
  /** The After-playback action changed (board null = do nothing). */
  readonly linkedBoardChange = output<LinkedBoardSelection>();
  /** Non-repeating playback is a couple of seconds from its crossfade point. */
  readonly endApproaching = output<void>();
  /** The player's audio actually started (after load/buffer or resume). */
  readonly playbackStarted = output<void>();

  readonly settingsOpen = signal(false);
  /** Mobile only: plays the settings sheet's slide-down before it's removed. */
  readonly settingsClosing = signal(false);
  private settingsCloseTimer: ReturnType<typeof setTimeout> | null = null;
  readonly expanded = signal(false);
  readonly renaming = signal(false);
  readonly renameValue = signal('');
  readonly renameError = computed(() =>
    hasProfanity(this.renameValue()) ? profanityErrorMessage() : '',
  );
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
    const selected = this.board().selectedTrack;
    if (!selected) return null;
    // Match against the current selectable set (group items when a group is
    // selected) so a window item's track still resolves as the shown selection.
    return this.orderedAvailableTracks().some(t => t.id === selected.id)
      ? selected
      : null;
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
    return this.playingTrackWindows().find(w => w.id === id) ?? null;
  });

  readonly hasSelectedWindow = computed(() =>
    !this.playlistMode() && !this.sequenceUnavailable() && this.selectedWindow() != null,
  );

  readonly selectedWindowStart = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow()?.positionFrom ?? null) : null,
  );

  readonly selectedWindowEnd = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow()?.positionTo ?? null) : null,
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

  /** The board's selection is a group window item (a specific window chosen from
      the track dropdown), not a whole track. */
  readonly selectedIsWindowItem = computed(() =>
    (this.selectedItemKey() ?? '').includes('::'),
  );

  // A window item already is a specific window, so the separate window dropdown
  // would be a redundant duplicate — only offer it for a whole-track selection.
  readonly showWindowSelector = computed(() =>
    !this.playlistMode() && !this.selectedIsWindowItem() && this.windows().length > 0,
  );

  /** Playlist mode needs at least one playable track in the selected group. */
  readonly canUsePlaylist = computed(() =>
    this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length >= 1,
  );

  readonly playlistButtonTitle = computed(() =>
    this.canUsePlaylist()
      ? this.t('stages.card.playlistTitle')
      : this.t('stages.card.playlistEmpty'),
  );

  /**
   * Inline warning shown on the board when its current configuration can't play
   * as set up: a window sequence on a track without enough windows (it falls back
   * to looping the whole track), or a playlist on a group with no tracks.
   */
  readonly warningMessage = computed<string | null>(() => {
    if (this.playlistMode()) {
      return this.canUsePlaylist() ? null : this.t('stages.warn.emptyGroup');
    }

    if (this.board().selectedTrack && this.sequenceUnavailable()) {
      return this.t('stages.warn.sequenceNeedsWindows');
    }

    return null;
  });

  // The board state is only Single or Playlist; sequence is surfaced through the
  // loop ribbon, not as a board state.
  readonly modeChipLabel = computed(() =>
    this.t(this.playlistMode() ? 'stages.mode.playlist' : 'stages.mode.single'),
  );

  readonly modeIconName = computed<UiIconName>(() =>
    this.playlistMode() ? 'playlist' : 'single',
  );

  readonly modeChipTooltip = computed(() =>
    this.t(this.playlistMode() ? 'stages.mode.playlistTip' : 'stages.mode.singleTip'),
  );

  // Always-present loop ribbon. In playlist mode each track plays to its end, so
  // looping is fixed to "whole track".
  readonly showLoopChip = computed(() => !this.playlistMode() && this.loopMode() !== 'off');

  readonly loopRibbonLabel = computed(() =>
    this.t(this.loopMode() === 'sequence' ? 'stages.loop.chipSequence' : 'stages.loop.chipWhole'),
  );

  /** Full loop wording for the chip tooltip — the visible label is iconified. */
  readonly loopRibbonTooltip = computed(() => {
    if (this.playlistMode()) return this.t('stages.loop.wholeTip');
    switch (this.loopMode()) {
      case 'whole':
        return this.t('stages.loop.wholeTip');
      case 'sequence':
        return this.t('stages.loop.sequenceTip');
      default:
        return this.t('stages.loop.offTip');
    }
  });

  readonly randomRibbonLabel = computed(() =>
    this.t(this.playlistOptions().random ? 'stages.random.shuffle' : 'stages.random.inOrder'),
  );

  readonly randomIconName = computed<UiIconName>(() =>
    this.playlistOptions().random ? 'shuffle' : 'ordered',
  );

  readonly randomRibbonTooltip = computed(() =>
    this.t(
      this.playlistOptions().random ? 'stages.random.shuffleTip' : 'stages.random.inOrderTip',
    ),
  );

  readonly canStartPlayback = computed(() => {
    if (!this.playlistMode()) {
      return !!this.board().selectedTrack;
    }

    return this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length > 0;
  });

  readonly currentTrackLabel = computed(() => {
    const track = this.board().selectedTrack;
    if (!track) return '—';
    return (
      track.trackName ||
      track.trackOriginalName ||
      this.t('common.trackNum', { id: track.id })
    );
  });

  readonly currentGroupLabel = computed(() => this.board().selectedGroup?.listName ?? null);

  readonly showWindowChip = computed(() => !this.playlistMode() && this.selectedWindow() != null);

  readonly allTracksLabel = computed(() =>
    this.t(this.fromLibrary() ? 'stages.card.allLibraryTracks' : 'stages.card.allSessionTracks'),
  );

  readonly currentWindowLabel = computed(() => {
    if (this.playlistMode()) return this.t('stages.card.auto');
    const w = this.selectedWindow();
    if (!w) return this.t('stages.card.wholePlayback');
    return w.name || this.t('common.window');
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

  /**
   * True when a real window sequence is in effect (sequence mode on a track with
   * at least two windows). The deck uses this to keep its shadow source alive and
   * crossfade window advances through it — same mechanism as a loop seam — so
   * sequence advances stay seamless in a backgrounded tab.
   */
  readonly sequenceActive = computed(
    () => this.sequentialWindows() && this.canSequenceWindows(),
  );

  readonly loopModeChoices = computed<{ value: LoopMode; label: string; disabled?: boolean }[]>(() => [
    { value: 'off', label: this.t('stages.loop.off') },
    { value: 'whole', label: this.t('stages.loop.repeat') },
    // Disable sequencing when the track lacks the windows to step through.
    {
      value: 'sequence',
      label: this.t('stages.loop.windowSequence'),
      disabled: !this.canSequenceWindows(),
    },
  ]);

  readonly loopModeOptions = computed(() =>
    this.locked()
      ? this.loopModeChoices().map(choice => ({ ...choice, disabled: true }))
      : this.loopModeChoices(),
  );

  /** Current single-track loop behaviour, derived from the board flags. */
  readonly loopMode = computed<LoopMode>(() => {
    if (this.sequentialWindows()) return 'sequence';
    return this.board().repeat ? 'whole' : 'off';
  });

  readonly loopModeHint = computed(() => {
    switch (this.loopMode()) {
      case 'whole':
        return this.t('stages.loop.hintWhole');
      case 'sequence':
        return this.t('stages.loop.hintSequence');
      default:
        return this.t('stages.loop.hintOff');
    }
  });

  /** Other boards this one can continue into when its playback ends. */
  private readonly linkTargets = computed(() =>
    this.linkedBoardChoices().filter(choice => choice.id !== this.board().id),
  );

  /** The board started/resumed after this one ends; null when unset or gone. */
  readonly linkedBoard = computed(() => {
    const id = this.board().linkedBoard?.boardId;
    if (id == null) return null;
    return this.linkTargets().find(choice => choice.id === id) ?? null;
  });

  /** What happens with the linked board after this one ends. */
  readonly linkedBoardMode = computed(
    () => this.board().linkedBoard?.mode ?? LinkedBoardMode.Start,
  );

  /** The chain only fires when playback actually ends, i.e. with loop off. */
  readonly afterEndBlockedByLoop = computed(() => this.loopMode() !== 'off');

  /** Linked and able to fire right now — drives the summary chip. */
  readonly afterEndActive = computed(
    () => !this.playlistMode() && !this.afterEndBlockedByLoop() && this.linkedBoard() != null,
  );

  readonly afterEndValue = computed<LinkedBoardMode | null>(() =>
    this.linkedBoard() ? this.linkedBoardMode() : null,
  );

  readonly afterEndOptions = computed<UiSelectOption[]>(() => {
    const targets = this.linkTargets();
    const linked = this.linkedBoard();
    const current = this.linkedBoardMode();
    const subOptions = targets.map(choice => ({ label: choice.name, value: choice.id }));

    // Each action is a category: picking it opens the board list ("More" flyout).
    const actionOption = (
      action: LinkedBoardMode,
      genericKey: string,
      namedKey: string,
    ): UiSelectOption => ({
      label: targets.length === 0
        ? this.t('stages.card.afterEndNoStages')
        : linked && current === action
          ? this.t(namedKey, { name: linked.name })
          : this.t(genericKey),
      value: action,
      requiresSubOption: true,
      subOptionsLabel: this.t('stages.card.afterEndChooseStage'),
      disabled: targets.length === 0,
      subOptions,
    });

    const options = [
      actionOption(
        LinkedBoardMode.Start,
        'stages.card.afterEndStartAnother',
        'stages.card.afterEndStart',
      ),
      actionOption(
        LinkedBoardMode.Resume,
        'stages.card.afterEndResumeAnother',
        'stages.card.afterEndResume',
      ),
    ];
    // With no other boards both rows would read "No other stages" — show one.
    return targets.length === 0 ? options.slice(0, 1) : options;
  });

  private readonly cardUid = nextCardId++;
  readonly afterEndLabelId = `board-after-end-label-${this.cardUid}`;
  readonly afterEndHintId = `board-after-end-hint-${this.cardUid}`;

  readonly afterEndHint = computed(() => {
    if (this.afterEndBlockedByLoop()) return this.t('stages.card.afterEndLoopHint');
    const linked = this.linkedBoard();
    if (!linked) return null;
    return this.linkedBoardMode() === LinkedBoardMode.Resume
      ? this.t('stages.card.afterEndResumeHint', { name: linked.name })
      : this.t('stages.card.afterEndHint');
  });

  readonly afterEndChip = computed(() => {
    const linked = this.linkedBoard();
    if (!this.afterEndActive() || !linked) return null;
    const resume = this.linkedBoardMode() === LinkedBoardMode.Resume;
    const params = { name: linked.name };
    return {
      label: this.t(resume ? 'stages.card.afterEndResumeChip' : 'stages.card.afterEndChip', params),
      tooltip: this.t(
        resume ? 'stages.card.afterEndResumeChipTip' : 'stages.card.afterEndChipTip',
        params,
      ),
    };
  });


  readonly browseLibrary = signal(false);

  readonly fromLibrary = computed(() => !this.locked() && this.browseLibrary());

  readonly groupOptions = computed(() =>
    // A group with no tracks has nothing to select or play, so disable it.
    (this.fromLibrary() ? this.libraryGroups() : this.availableGroups()).map(g => ({
      label: g.listName || this.t('common.groupNum', { id: g.id }),
      value: g.id,
      disabled: (g.tracks?.length ?? 0) === 0,
    })),
  );

  /**
   * The board's selectable items in playback (position) order.
   *
   * When a group is selected these are the group's items — including window items,
   * which are track entries with `isWindow` set and a non-null `windowId` and
   * behave like standalone tracks. The "within a group" fields (isWindow, windowId,
   * positionWithinGroup, per-group name) only exist on the group's `tracks`, not on
   * the board's flat `availableTracks`, so the group is the authoritative source.
   * Sorted by position because the backend returns them alphabetically.
   */
  readonly orderedAvailableTracks = computed(() => {
    const board = this.board();
    const groupId = board.selectedGroup?.id ?? null;

    if (groupId == null) {
      const tracks = this.fromLibrary() ? this.libraryTracks() : (board.availableTracks ?? []);
      return [...tracks].sort(byGroupPosition);
    }

    // Prefer the group from the groups store: it comes from the /groups endpoint,
    // which returns items in position order with positionWithinGroup populated. The
    // board/session response's selectedGroup.tracks is only a fallback — it can
    // arrive alphabetical and without positions.
    const source =
      this.libraryGroups().find(g => g.id === groupId)?.tracks
      ?? this.availableGroups().find(g => g.id === groupId)?.tracks
      ?? board.selectedGroup?.tracks
      ?? [];

    return [...source].sort(byGroupPosition);
  });

  readonly trackOptions = computed(() => {
    // In sequence mode only tracks with at least two windows can be sequenced;
    // the rest are shown but disabled so the active sequence isn't dropped.
    const sequencing = this.sequentialWindows();

    return this.orderedAvailableTracks().map(t => {
      const windowItem = isWindowItem(t);
      const trackWindows = t.trackWindows ?? [];
      // A window item is already one specific window, so it gets no sub-options.
      // Sequence mode plays the windows automatically, so picking an individual
      // window from the track dropdown makes no sense — hide the sub-options there.
      const subOptions = !sequencing && !windowItem && trackWindows.length > 0
        ? [
            {
              label: this.t('stages.card.wholePlayback'),
              value: { trackId: t.id ?? null, windowId: null },
            },
            ...trackWindows.map(w => ({
              label: w.name || this.t('common.window'),
              value: { trackId: t.id ?? null, windowId: w.id ?? null },
            })),
          ]
        : undefined;

      return {
        label:
          t.trackName || t.trackOriginalName || this.t('common.trackNum', { id: t.id }),
        // A composite key so a track and its window items are distinct options
        // (ui-select compares option values by ===).
        value: itemKeyOf(t),
        // Subtle marker so window entries are recognisable in the dropdown.
        tag: windowItem ? this.t('common.window') : undefined,
        subOptions,
        disabled: sequencing && (windowItem || trackWindows.length < 2),
      };
    });
  });

  /** Composite key of the board's current selection, matching a trackOptions value. */
  readonly selectedItemKey = computed(() => {
    const selected = this.displayedTrack();
    if (selected?.id == null) return null;

    const winId = this.selectedWindowId();
    const hasWindowItem =
      winId != null &&
      this.orderedAvailableTracks().some(
        t => isWindowItem(t) && t.id === selected.id && t.windowId === winId,
      );

    return hasWindowItem ? `${selected.id}::${winId}` : `${selected.id}`;
  });

  readonly windowOptions = computed(() =>
    this.windows().map(w => ({
      label: w.name || this.t('common.windowNum', { id: w.id }),
      value: w.id,
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

    // On mobile the settings popover is a bottom sheet: lock background scroll so
    // it can't drift. Mobile only.
    effect((onCleanup) => {
      if (!this.settingsOpen()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  ngOnInit(): void {
    this.browseLibrary.set(readLibraryPreference(this.board().id));

    this.destroyRef.onDestroy(() => {
      this.endShortcutCapture();
    });
  }

  setBrowseLibrary(value: boolean): void {
    this.browseLibrary.set(value);
    writeLibraryPreference(this.board().id, value);
  }

  turnLoopOff(): void {
    if (this.locked()) return;
    this.loopModeChange.emit('off');
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

  expand(): void {
    this.setExpanded(true);
  }

  private setExpanded(expanded: boolean): void {
    this.expanded.set(expanded);
    if (!expanded) this.closeSettingsMenu();
  }

  startRename(): void {
    if (this.locked()) return;
    this.renameValue.set(this.board().name || '');
    this.renaming.set(true);
    setTimeout(() => this.renameInputRef?.nativeElement.select(), 0);
  }

  commitRename(): void {
    if (!this.renaming()) return;
    // Keep the editor open on profanity so the inline error stays visible.
    // Escape still cancels via onRenameKeydown.
    if (hasProfanity(this.renameValue())) return;
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
    if (this.locked() || playlist === this.playlistMode()) return;
    this.modeChange.emit(playlist ? 'playlist' : 'single');
  }

  onLoopModeSelected(mode: string): void {
    if (this.locked() || mode === this.loopMode()) return;
    this.loopModeChange.emit(mode as LoopMode);
  }

  /**
   * A track option was picked from the dropdown. A window item selects its
   * track+window (behaving like a standalone track); anything else selects the
   * whole track, preserving the existing single/sequence track-change flow.
   */
  onTrackOptionChange(key: string | null): void {
    if (key == null) {
      this.trackChange.emit(null);
      return;
    }

    const track = this.orderedAvailableTracks().find(t => itemKeyOf(t) === key);
    if (track?.id == null) {
      this.trackChange.emit(null);
      return;
    }

    if (isWindowItem(track)) {
      this.trackWithWindowChange.emit({ trackId: track.id, windowId: track.windowId! });
    } else {
      this.trackChange.emit(track.id);
    }
  }

  /** Only "Nothing" commits directly; the actions commit via their board sub-option. */
  onAfterEndChange(value: LinkedBoardMode | null): void {
    if (value == null && this.board().linkedBoard != null) {
      this.linkedBoardChange.emit({ boardId: null, mode: this.linkedBoardMode() });
    }
  }

  onAfterEndBoardSelected(event: UiSelectSubOptionEvent): void {
    const boardId = event.sub.value as string;
    const mode = event.parent.value as LinkedBoardMode;
    const current = this.board().linkedBoard;
    if (boardId !== current?.boardId || mode !== current?.mode) {
      this.linkedBoardChange.emit({ boardId, mode });
    }
  }

  onPlaylistRandomToggle(): void {
    if (this.locked()) return;
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



  private getPlaylistCandidates(groupId: string | null): Track[] {
    const unique = new Map<string, Track>();

    const tracks =
      groupId == null
        ? (this.board().availableTracks ?? [])
        : (this.availableGroups().find(group => group.id === groupId)?.tracks ?? []);

    for (const track of [...tracks].sort(
      (a, b) => (a.positionWithinGroup ?? 0) - (b.positionWithinGroup ?? 0),
    )) {
      if (track?.id != null) {
        unique.set(track.id, track);
      }
    }

    return Array.from(unique.values());
  }
}

/** Sort comparator: a group's items by their 1-based position (0 outside a group). */
function byGroupPosition(a: Track, b: Track): number {
  return (a.positionWithinGroup ?? 0) - (b.positionWithinGroup ?? 0);
}

/** Within a group, a track entry that stands in for one of its windows. */
function isWindowItem(t: Track): boolean {
  return t.isWindow === true && t.windowId != null;
}

/** Distinguishes a whole-track entry from each of its window items. */
function itemKeyOf(t: Track): string {
  return isWindowItem(t) ? `${t.id}::${t.windowId}` : `${t.id ?? ''}`;
}

function clampPct(v: number): number {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(Math.round(n), 100))
    : 100;
}

const LIBRARY_PREFERENCE_PREFIX = 'mpf:stages:library:';

function readLibraryPreference(boardId: string | undefined): boolean {
  if (boardId == null) return false;
  try {
    return localStorage.getItem(LIBRARY_PREFERENCE_PREFIX + boardId) === '1';
  } catch {
    return false;
  }
}

function writeLibraryPreference(boardId: string | undefined, value: boolean): void {
  if (boardId == null) return;
  try {
    if (value) {
      localStorage.setItem(LIBRARY_PREFERENCE_PREFIX + boardId, '1');
    } else {
      localStorage.removeItem(LIBRARY_PREFERENCE_PREFIX + boardId);
    }
  } catch {
    // Storage may be unavailable (private mode); the toggle just won't persist.
  }
}
