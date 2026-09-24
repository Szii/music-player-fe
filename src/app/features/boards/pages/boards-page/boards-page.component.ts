import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject, forkJoin, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  groupBy,
  mergeMap,
  switchMap,
} from 'rxjs/operators';

import { environment } from '../../../../../environments/environment';
import { BOARD_CHANGE_CROSSFADE_MS, effectiveCrossfadeMs, sourceCrossfadeMs } from '../../utils/crossfade';

import {
  MusicBoardsService,
  Board,
  BoardCreateRequest,
  BoardUpdateRequest,
  Group,
  LinkedBoard,
  LinkedBoardMode,
  SessionResponse,
  Track,
  TrackWindow,
} from '../../../../api/generated';

import {
  BoardCardComponent,
  PlaylistOptions,
  PlaybackMode,
  LoopMode,
} from '../../components/board-card/board-card.component';
import { LinkedBoardChoice, LinkedBoardSelection } from '../../models/linked-board-choice';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../../core/services/board-playback.service';
import { BoardShortcutsService } from '../../../../core/services/board-shortcuts.service';
import { SessionsStore } from '../../../../core/services/sessions-store.service';
import { SessionActionsService } from '../../../../core/services/session-actions.service';
import { TracksStore } from '../../../../core/services/tracks-store.service';
import { GroupsStore } from '../../../../core/services/groups-store.service';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';

/** Boards faded out by a starting board: stopped, or paused to be resumed later. */
interface DisplacedBoards {
  stop: Board[];
  pause: Board[];
}

/**
 * A board being started/resumed because another board is ending.
 *  - `loading`  — started silently ahead of the seam, waiting for its audio,
 *  - `primed`   — loaded and held paused at its start until the seam,
 *  - `starting` — resumed at the seam, waiting for its audio to fade it in.
 */
interface PendingHandoff {
  fromId: string;
  /** The outgoing board's crossfade, so the fade lands on its seam. */
  rampMs: number;
  phase: 'loading' | 'primed' | 'starting';
  /** The outgoing board reached its crossfade point. */
  seamReached: boolean;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

/** Longest wait for a handoff target's audio before fading it in regardless. */
const LINKED_HANDOFF_START_TIMEOUT_MS = 4000;

interface VolumeCommit {
  boardId: string;
  volumePercent: number;
}


@Component({
  selector: 'app-boards-page',
  imports: [
    IconButtonComponent,
    BoardCardComponent,
    UiAlertComponent,
    UiCreateCtaComponent,
    UiPageTitleComponent,
    FooterComponent,
    TranslocoPipe,
  ],
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
  templateUrl: './boards-page.component.html',
  styleUrl: './boards-page.component.scss',
})
export class BoardsPageComponent implements OnInit, OnDestroy {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate(key, params);
  }

  private readonly boardsApi = inject(MusicBoardsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly shortcuts = inject(BoardShortcutsService);
  private readonly sessionsStore = inject(SessionsStore);
  private readonly sessionActions = inject(SessionActionsService);
  private readonly tracksStore = inject(TracksStore);
  private readonly groupsStore = inject(GroupsStore);

  readonly boards = signal<Board[]>([]);
  readonly tracks = this.tracksStore.tracks;
  readonly groups = this.groupsStore.groups;
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly createBoardSubmitting = signal(false);

  /** Index of the board currently centred in the mobile carousel. */
  readonly activeBoardIndex = signal(0);

  readonly hasSessions = this.sessionsStore.hasSessions;

  private readonly sessionGroups = computed<Group[]>(() => {
    const ids = this.sessionsStore.sessionGroupIds();
    return this.groups().filter(group => group.id != null && ids.has(group.id));
  });

  readonly sessionBoards = computed<Board[]>(() => {
    const sessionId = this.sessionsStore.selectedSessionId();
    if (sessionId == null) return [];
    return this.boards().filter(b => b.sessionId === sessionId);
  });

  /**
   * Boards of the selected session that can be linked for the After-playback
   * action (named as in the tabs). A board without a selected track has nothing
   * to play, so it isn't offered.
   */
  readonly linkedBoardChoices = computed<LinkedBoardChoice[]>(() =>
    this.sessionBoards().flatMap((board, index) =>
      board.id == null || !board.selectedTrack
        ? []
        : [{ id: board.id, name: board.name || this.t('common.stageIndex', { index: index + 1 }) }],
    ),
  );

  @ViewChild('boardsList') boardsListRef?: ElementRef<HTMLElement>;
  @ViewChild('boardsTabs') boardsTabsRef?: ElementRef<HTMLElement>;
  @ViewChildren(BoardCardComponent) boardCards!: QueryList<BoardCardComponent>;

  /** Target of an in-flight pill-initiated smooth scroll. While set, the boards
      passed en route are ignored so the clicked pill stays highlighted instead
      of flickering through each one. */
  private scrollTargetIndex: number | null = null;
  private scrollTargetTimer: ReturnType<typeof setTimeout> | null = null;

  /** Update the active carousel tab as the board strip is swiped. */
  onBoardsScroll(): void {
    const el = this.boardsListRef?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    const max = this.sessionBoards().length - 1;
    const idx = Math.max(0, Math.min(Math.round(el.scrollLeft / el.clientWidth), max));
    if (this.scrollTargetIndex !== null) {
      if (idx === this.scrollTargetIndex) this.clearScrollTarget();
      return;
    }
    if (idx !== this.activeBoardIndex()) {
      this.activeBoardIndex.set(idx);
      this.scrollActiveTabIntoView(idx);
    }
  }

  scrollToBoard(index: number): void {
    const el = this.boardsListRef?.nativeElement;
    if (!el) return;
    this.scrollTargetIndex = index;
    // Fallback: release the lock even if the scroll never lands exactly on the
    // target (interrupted swipe, sub-pixel rounding) so the tab can't freeze.
    if (this.scrollTargetTimer) clearTimeout(this.scrollTargetTimer);
    this.scrollTargetTimer = setTimeout(() => this.clearScrollTarget(), 700);
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    this.activeBoardIndex.set(index);
    this.scrollActiveTabIntoView(index);
  }

  private clearScrollTarget(): void {
    this.scrollTargetIndex = null;
    if (this.scrollTargetTimer) {
      clearTimeout(this.scrollTargetTimer);
      this.scrollTargetTimer = null;
    }
  }

  /** Slide the tab strip so the active board's name stays centred (a sliding
      window over the full board list). */
  private scrollActiveTabIntoView(index: number): void {
    const container = this.boardsTabsRef?.nativeElement;
    const tab = container?.children[index] as HTMLElement | undefined;
    if (!container || !tab) return;
    const target = tab.offsetLeft - (container.clientWidth - tab.offsetWidth) / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  private readonly streamUrlsByBoard = new Map<string, string>();
  private readonly boardStatuses = new Map<string, PlayerStatus>();
  private readonly selectedWindowByBoard = new Map<string, string | null>();
  /**
   * Local mirror of the backend-persisted sequence mode per board. It also keeps
   * optimistic UI state while an update request is in flight.
   */
  private readonly sequentialWindowsByBoard = new Map<string, boolean>();
  /**
   * Remembers the single-mode track/window selected when a board entered playlist
   * mode, so it can be restored when the board switches back to single instead of
   * being lost.
   */
  private readonly preSingleSelectionByBoard = new Map<string, { trackId: string | null; windowId: string | null }>();
  private readonly masterVolumesByBoard = new Map<string, number>();
  private readonly masterFadeRampMsByBoard = new Map<string, number>();
  private readonly playlistIndexByBoard = new Map<string, number>();
  private readonly playlistOrderByBoard = new Map<string, number[]>();
  private readonly persistedVolumesByBoard = new Map<string, number>();
  private readonly pendingTrackUpdateBoardIds = new Set<string>();
  private readonly playPendingAfterUpdateBoardIds = new Set<string>();
  private readonly playlistAdvanceInFlightBoardIds = new Set<string>();
  /** Boards that already started their linked board during the current play-through,
      so nearEnd and ended don't both trigger the handoff. */
  private readonly linkedHandoffBoardIds = new Set<string>();
  /** Linked-board handoffs in progress, keyed by the board being started. */
  private readonly pendingHandoffs = new Map<string, PendingHandoff>();
  /** The fade that last touched each board; an older fade's cleanup skips it. */
  private readonly fadeTokens = new Map<string, number>();
  private fadeTokenSeq = 0;
  private readonly fadeCleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  private readonly fadeStateVersion = signal(0);
  /** Bumped whenever the locally-selected window changes without a `boards()`
      update (e.g. a sequence-mode advance), so template getters re-read the
      non-reactive selection map and the player crossfades to the new window. */
  private readonly windowSelectionVersion = signal(0);

  private readonly volumeCommit$ = new Subject<VolumeCommit>();

  constructor() {
    effect(() => {
      if (!this.sessionsStore.loaded()) return;

      const sessionIds = new Set(
        this.sessionsStore.sessions()
          .map(s => s.sessionId)
          .filter((id): id is string => id != null),
      );
      const current = this.boards();
      const surviving = current.filter(
        b => b.sessionId == null || sessionIds.has(b.sessionId),
      );
      if (surviving.length === current.length) return;

      for (const stale of current) {
        if (stale.id == null) continue;
        if (stale.sessionId != null && !sessionIds.has(stale.sessionId)) {
          this.clearBoard(stale.id);
          this.removeBoardLocalState(stale.id);
        }
      }
      this.boards.set(surviving);
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.setupVolumeDebounce();
    this.boardPlayback.register(
      () => this.stopAllBoards(),
      () => this.refreshBackgroundData(),
    );

    this.shortcuts.trigger$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(boardId => this.onShortcutTriggered(boardId));
  }

  private onShortcutTriggered(boardId: string): void {
    const board = this.boards().find(item => item.id === boardId);
    if (!board) return;

    if (this.isBoardPlaying(boardId)) {
      this.stopBoardTrack(board);
    } else {
      this.playBoardTrack(board);
    }
  }

  ngOnDestroy(): void {
    this.clearFadeCleanupTimers();
    for (const targetId of [...this.pendingHandoffs.keys()]) this.dropHandoff(targetId);
    this.volumeCommit$.complete();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    // Tracks and groups come from the shared stores, which report their own
    // failures — only the boards' own errors are collected here.
    forkJoin({
      sessions: this.sessionsStore.load().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('stages.err.loadSessions') }));
          return of({ sessions: [] });
        }),
      ),
      tracks: this.tracksStore.load(),
      groups: this.groupsStore.load(),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sessions }) => {
          this.syncStoreLoadErrors();

          const mergedBoards = this.flattenSessionBoards(sessions.sessions ?? []);
          this.prepareBoards(mergedBoards, true);

          this.boards.set(this.sortBoards(mergedBoards));
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('stages.err.loadData') }));
        },
      });
  }

  private syncStoreLoadErrors(): void {
    if (this.tracksStore.ownFailed()) {
      this.appendError(this.t('stages.err.loadTracks'));
    }

    if (this.groupsStore.failed()) {
      this.appendError(this.t('stages.err.loadGroups'));
    }
  }

  createBoard(): void {
    const sessionId = this.sessionsStore.selectedSessionId();
    if (sessionId == null) {
      this.toast.error(this.t('stages.err.noSessionSelected'));
      return;
    }

    this.createBoardSubmitting.set(true);

    const body: BoardCreateRequest = {
      name: this.t('common.stageIndex', { index: this.sessionBoards().length + 1 }),
      sessionId,
    };

    this.boardsApi.createUserBoard({ boardCreateRequest: body })
      .pipe(
        finalize(() => this.createBoardSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: session => {
          this.sessionsStore.upsertSessionLocal(session);
          const sessionBoards = this.stampSessionId(session.boards ?? [], session.sessionId);
          const existingIds = new Set(this.boards().map(b => b.id));
          const newBoards = sessionBoards.filter(b => b.id != null && !existingIds.has(b.id));

          this.prepareBoards(newBoards);

          if (newBoards.length > 0) {
            this.boards.update(current => this.sortBoards([...current, ...newBoards]));
            this.focusNewBoard(newBoards[0].id);
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.create') }));
        },
      });
  }

  /** Brings a just-created stage into view with its name ready to edit. */
  private focusNewBoard(boardId: string | undefined): void {
    if (boardId == null) return;

    setTimeout(() => {
      const index = this.sessionBoards().findIndex(board => board.id === boardId);
      if (index >= 0) this.scrollToBoard(index);
      const card = this.boardCards?.find(item => item.board().id === boardId);
      card?.expand();
      card?.startRename();
    });
  }

  openCreateSession(event?: Event): void {
    event?.stopPropagation();
    this.sessionActions.create();
  }

  async deleteBoard(board: Board): Promise<void> {
    if (board.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('stages.card.delete'),
      message: this.t('stages.msg.deleteConfirm', { name: board.name || board.id }),
      confirmText: this.t('common.delete'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    const boardId = board.id;

    const doDelete = (): void => {
      this.boardsApi.deleteUserBoard({ boardId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.boards.update(current => current.filter(b => b.id !== boardId));
            this.removeBoardLocalState(boardId);
            this.syncPlayingState();
            this.toast.success(this.t('stages.msg.deleted'));
          },
          error: (err: unknown) => {
            console.error(err);
            this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.delete') }));
          },
        });
    };

    if (this.isBoardActive(boardId)) {
      this.clearBoard(boardId);
    }

    doDelete();
  }

  /**
   * Single-track loop behaviour, chosen from the Playback-settings dropdown:
   *  - `off`   → play once (no repeat)
   *  - `whole` → loop the whole track / selected window
   *  - `sequence` → step through every window in order, looping the sequence
   *
   * Changing loop mode never stops the board: off ↔ whole is a plain repeat
   * change, and entering/leaving sequence reuses the player's window-change
   * crossfade so playback continues uninterrupted.
   */
  onLoopModeChange(board: Board, mode: LoopMode): void {
    if (board.id == null) return;
    const boardId = board.id;

    const wasSequence = this.getSequentialWindows(board);
    const toSequence = mode === 'sequence';
    const repeat = mode !== 'off';

    if (toSequence) {
      this.sequentialWindowsByBoard.set(boardId, true);

      // Sequence is selectable regardless of window count; if the track has any
      // windows, start the sequence at the first one.
      const windows = this.boardWindows(board);
      const firstWindowId = windows.length >= 1 ? (windows[0].id ?? null) : null;
      if (firstWindowId != null) {
        this.selectedWindowByBoard.set(boardId, firstWindowId);
      }

      this.updateBoard(
        board,
        {
          playlistMode: false,
          sequenceMode: true,
          repeat,
          selectedWindowId: firstWindowId ?? undefined,
        },
        this.t('stages.err.loopMode'),
      );
      return;
    }

    this.sequentialWindowsByBoard.delete(boardId);

    if (wasSequence) {
      // Leaving sequence: drop the per-window selection and keep playing the
      // whole track from the current position (the player's window-change
      // crossfade handles dropping the window bounds). The track is never reset.
      this.selectedWindowByBoard.set(boardId, null);
      this.updateBoard(
        board,
        { sequenceMode: false, repeat, selectedWindowId: undefined },
        this.t('stages.err.loopMode'),
      );
      return;
    }

    // Plain off ↔ whole repeat change — preserve any user-selected window.
    this.updateBoard(
      board,
      { sequenceMode: false, repeat },
      this.t('stages.err.loopMode'),
    );
  }

  toggleOverplay(board: Board): void {
    this.updateBoard(
      board,
      { overplay: !(board.overplay ?? false) },
      this.t('stages.err.overplay'),
    );
  }

  onModeChange(board: Board, mode: PlaybackMode): void {
    if (board.id == null) return;
    const boardId = board.id;

    const fromMode: PlaybackMode = (board.playlistMode ?? false)
      ? 'playlist'
      : this.getSequentialWindows(board) ? 'sequence' : 'single';
    if (fromMode === mode) return;

    // Changing the playback mode always stops the board.
    this.clearBoard(boardId);

    if (mode === 'playlist') {
      // Remember the single-track selection so it can be restored when leaving
      // playlist (entering playlist clears the selected track on the backend).
      this.preSingleSelectionByBoard.set(boardId, {
        trackId: board.selectedTrack?.id ?? null,
        windowId: this.selectedWindowByBoard.get(boardId) ?? null,
      });
      this.sequentialWindowsByBoard.delete(boardId);
      this.selectedWindowByBoard.delete(boardId);
      this.regeneratePlaylistOrder(boardId, board.availableTracks ?? [], board.shuffle ?? false);
      this.updateBoard(
        board,
        {
          playlistMode: true,
          sequenceMode: false,
          selectedTrackId: undefined,
          selectedWindowId: undefined,
        },
        this.t('stages.err.playlistMode'),
      );
      return;
    }

    if (mode === 'sequence') {
      this.sequentialWindowsByBoard.set(boardId, true);

      const windows = this.boardWindows(board);
      const firstWindowId = windows.length >= 2 ? (windows[0].id ?? null) : null;
      if (firstWindowId != null) {
        this.selectedWindowByBoard.set(boardId, firstWindowId);
      }

      this.updateBoard(
        board,
        {
          playlistMode: false,
          sequenceMode: true,
          selectedWindowId: firstWindowId ?? undefined,
        },
        this.t('stages.err.sequenceMode'),
      );
      return;
    }

    // mode === 'single'
    this.sequentialWindowsByBoard.delete(boardId);

    if (fromMode === 'playlist') {
      // Playlist cleared the track; restore the remembered single-mode selection.
      this.playlistIndexByBoard.delete(boardId);
      this.playlistOrderByBoard.delete(boardId);
      this.updateBoard(
        board,
        { playlistMode: false, sequenceMode: false },
        this.t('stages.err.playlistMode'),
        () => this.restoreSingleSelection(boardId),
      );
      return;
    }

    this.updateBoard(
      board,
      { sequenceMode: false },
      this.t('stages.err.sequenceMode'),
    );
  }

  /**
   * Restore the track/window the board had before it entered playlist mode. Only
   * applies a track that is still available on the board; otherwise leaves the
   * board with no selection. The board is already stopped at this point.
   */
  private restoreSingleSelection(boardId: string): void {
    const remembered = this.preSingleSelectionByBoard.get(boardId);
    this.preSingleSelectionByBoard.delete(boardId);

    if (remembered?.trackId == null) return;

    const fresh = this.boards().find(b => b.id === boardId);
    if (!fresh) return;

    if (!(fresh.availableTracks ?? []).some(t => t.id === remembered.trackId)) return;

    this.selectedWindowByBoard.set(boardId, remembered.windowId);

    // Already on the remembered track: the window map update above is enough.
    if (fresh.selectedTrack?.id === remembered.trackId) return;

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(fresh, {
        selectedTrackId: remembered.trackId,
        selectedWindowId: remembered.windowId ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
          this.selectedWindowByBoard.set(boardId, remembered.windowId);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.restoreTrack') }));
        },
      });
  }

  onBoardRename(board: Board, name: string): void {
    this.updateBoard(board, { name }, this.t('stages.err.rename'));
  }

  onLinkedBoardChange(board: Board, selection: LinkedBoardSelection): void {
    const linkedBoard: LinkedBoard | null = selection.boardId == null
      ? null
      : { boardId: selection.boardId, mode: selection.mode };
    this.updateBoard(board, { linkedBoard }, this.t('stages.err.linkedBoard'));
  }

  /** Paused by another board's pause-and-resume action (not a handoff warm-up). */
  isHeldForResume(board: Board): boolean {
    return board.id != null
      && this.boardStatuses.get(board.id) === 'PAUSED'
      && !this.pendingHandoffs.has(board.id);
  }

  onPlaylistOptionsChange(board: Board, options: PlaylistOptions): void {
    this.updateBoard(board, { shuffle: options.random }, this.t('stages.err.shuffle'));

    const boardId = board.id;
    if (boardId == null || !board.playlistMode) return;

    // Rebuild the play order for the new mode immediately so the next track (and
    // the skip button) honours it. Anchor the cursor at the currently-playing
    // track so toggling shuffle does not jump or repeat.
    const tracks = board.availableTracks ?? [];
    this.regeneratePlaylistOrder(boardId, tracks, options.random);

    const currentTrackId = board.selectedTrack?.id ?? null;
    const order = this.playlistOrderByBoard.get(boardId);
    if (order && currentTrackId != null) {
      const step = order.findIndex(i => tracks[i]?.id === currentTrackId);
      if (step >= 0) this.playlistIndexByBoard.set(boardId, step);
    }
  }

  onPlaylistSkip(board: Board): void {
    if (board.id == null || !board.playlistMode) return;
    // Advance to the next track — random picks the next unplayed track in the
    // current shuffle, otherwise the next track in group order. Also starts
    // playback if the board is currently stopped.
    this.advancePlaylist(board);
  }

  onGroupSelectionChange(board: Board, selectedId: string | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    const wasSequence = this.getSequentialWindows(board);
    const playingTrack = board.selectedTrack;

    // Preserve sequence mode across the group change (baseUpdate keeps the current
    // flag). The response handler downgrades to whole playback only when the new
    // group's default track can't be sequenced.
    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedGroupId: selectedId ?? undefined,
        selectedTrackId:  undefined,
        selectedWindowId: undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.syncSessionScope(updated);

          if (updated.playlistMode && updated.id != null) {
            this.regeneratePlaylistOrder(updated.id, updated.availableTracks ?? [], updated.shuffle ?? false);
          }

          // Playlist, playing: immediately switch playback into the new group
          // (advancePlaylist applies the crossfade).
          if (wasActive && updated.playlistMode) {
            this.selectedWindowByBoard.delete(boardId);
            this.upsertBoard(updated);
            const fresh = this.boards().find(b => b.id === boardId);
            if (fresh) this.advancePlaylist(fresh);
            return;
          }

          // Single/sequence, playing: keep the current track playing. The backend
          // reset selectedTrack to the new group's default, but we restore it so the
          // player doesn't tear down — the user picks a track from the new group to
          // switch (the group shows a desync hint until then). Sequence mode and its
          // window selection are left untouched since the track itself didn't change.
          if (wasActive && playingTrack) {
            let normalized: Board = updated;
            this.boards.update(current => {
              const existing = current.find(b => b.id === boardId);
              normalized = this.withSessionId({ ...updated, selectedTrack: playingTrack }, existing);
              return this.replaceBoard(current, normalized);
            });
            this.syncPersistedVolume(normalized);
            return;
          }

          // Stopped: adopt the new group's default selection. Keep sequence mode
          // unless the new track can't be sequenced (fewer than two windows), in
          // which case fall back to whole playback and persist that downgrade.
          this.selectedWindowByBoard.delete(boardId);

          if (wasSequence && !this.canSequenceTrack(updated.selectedTrack)) {
            this.sequentialWindowsByBoard.delete(boardId);
            this.upsertBoard({ ...updated, sequenceMode: false });
            this.clearBoard(boardId);
            this.persistSequenceModeOff(boardId);
            return;
          }

          this.upsertBoard(updated);
          this.clearBoard(boardId);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.group') }));
        },
      });
  }

  onTrackWithWindowChange(
    board: Board,
    payload: { trackId: string | null; windowId: string | null },
  ): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    const { trackId, windowId } = payload;

    this.selectedWindowByBoard.set(boardId, windowId);
    this.sequentialWindowsByBoard.delete(boardId);
    this.pendingTrackUpdateBoardIds.add(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: trackId ?? undefined,
        selectedWindowId: windowId ?? undefined,
        sequenceMode: false,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
          this.syncSessionScope(updated);
          this.selectedWindowByBoard.set(boardId, windowId);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          const wantsPlay = this.playPendingAfterUpdateBoardIds.delete(boardId);

          if (trackId != null && (wasActive || wantsPlay)) {
            // With the YouTube IFrame backend, an already-active board applies
            // track/window changes client-side (the player crossfades to the new
            // video id / window) — no backend stream call needed.
            // An already-active board applies track/window changes client-side
            // (the player crossfades to the new video id / window).
            if (wasActive) {
              return;
            }

            const fresh = this.boards().find(item => item.id === boardId);
            if (fresh) {
              this.playBoardTrack(fresh);
            }
          } else {
            this.clearBoard(boardId);
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          this.playPendingAfterUpdateBoardIds.delete(boardId);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.update') }));
        },
      });
  }

  onTrackSelectionChange(board: Board, selectedId: string | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    // In sequence mode, picking a track keeps the mode and sequences the new
    // track; otherwise selecting a track exits sequence (single behaviour).
    const sequencing = this.getSequentialWindows(board);
    const keepSequence = sequencing && selectedId != null;
    this.selectedWindowByBoard.delete(boardId);
    if (!keepSequence) {
      this.sequentialWindowsByBoard.delete(boardId);
    }
    this.pendingTrackUpdateBoardIds.add(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: selectedId ?? undefined,
        selectedWindowId: undefined,
        sequenceMode: keepSequence,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
          this.syncSessionScope(updated);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          const wantsPlay = this.playPendingAfterUpdateBoardIds.delete(boardId);

          if (keepSequence) {
            // Sequence the new track from its first window (or fall back to single
            // if it can't be sequenced).
            const windows = updated.selectedTrack?.trackWindows ?? [];
            if (windows.length >= 2) {
              this.setSequenceWindow(boardId, windows[0]);
            } else {
              this.sequentialWindowsByBoard.delete(boardId);
            }
          }

          if (selectedId != null && (wasActive || wantsPlay)) {
            // YT backend: an active board crossfades to the new track client-side.
            // An already-active board applies track/window changes client-side
            // (the player crossfades to the new video id / window).
            if (wasActive) {
              return;
            }

            const freshBoard = this.boards().find(item => item.id === boardId);
            if (freshBoard) {
              this.playBoardTrack(freshBoard);
            }
          } else {
            this.clearBoard(boardId);
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          this.playPendingAfterUpdateBoardIds.delete(boardId);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.update') }));
        },
      });
  }

  onWindowSelectionChange(board: Board, windowId: string | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    this.selectedWindowByBoard.set(boardId, windowId);
    // A manual window pick exits sequence mode.
    this.sequentialWindowsByBoard.delete(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedWindowId: windowId ?? undefined,
        sequenceMode: false,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.upsertBoard(updated),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('stages.err.window') }));
        },
      });

    // An active board applies the window change client-side: the player reacts to
    // the new window inputs and crossfades — no backend call needed.
  }

  onBoardVolumePreview(board: Board, volumePercent: number): void {
    if (board.id == null) return;
    this.updateBoardVolume(board.id, volumePercent);
  }

  onBoardVolumeCommit(board: Board, volumePercent: number): void {
    if (board.id == null) return;

    this.volumeCommit$.next({
      boardId: board.id,
      volumePercent: this.updateBoardVolume(board.id, volumePercent),
    });
  }

  onBoardRequestPlay(board: Board): void {
    if (board.id == null) return;
    const boardId = board.id;

    // If a track-update API call is in flight, queue the play to fire after it
    // resolves — otherwise we'd play the old track.
    if (this.pendingTrackUpdateBoardIds.has(boardId)) {
      this.playPendingAfterUpdateBoardIds.add(boardId);
      return;
    }

    // Window changes are synchronous; if the board is already playing,
    // onWindowSelectionChange already kicked off a restart. Skip to avoid
    // double-playing.
    if (this.isBoardPlaying(boardId)) return;

    this.playBoardTrack(board);
  }

  playBoardTrack(board: Board): void {
    if (board.id == null) return;
    const targetId = board.id;

    // Playing a board that is being warmed up for a linked handoff: fade it in now.
    if (this.pendingHandoffs.has(targetId)) {
      this.commitHandoff(targetId, false);
      return;
    }

    if (!board.selectedTrack) {
      if (board.playlistMode) {
        this.advancePlaylist(board);
      }
      return;
    }

    const status = this.boardStatuses.get(targetId);
    const wasPlaying = status === 'PLAYING';
    const displaced = this.displacedBy(board);

    if (!wasPlaying) {
      this.prepareStart(board, status === 'PAUSED');
    }

    // The YouTube IFrame player owns playback status client-side: set the board
    // playing and drive the crossfade locally (no backend stream/session call).
    this.boardStatuses.set(targetId, 'PLAYING');
    this.streamUrlsByBoard.delete(targetId);
    this.syncPlayingState();
    this.applyPlayCrossfade(targetId, wasPlaying, displaced);
  }

  /**
   * Reset per-play state before a board starts from silence. A board resuming from
   * a pause keeps its window/sequence position — the player resumes in place.
   */
  private prepareStart(board: Board, resuming: boolean): void {
    const boardId = board.id!;
    this.masterVolumesByBoard.set(boardId, 0);
    this.linkedHandoffBoardIds.delete(boardId);

    // Sequence mode always (re)starts from the first window.
    if (!resuming && this.sequentialWindowsByBoard.get(boardId)) {
      const windows = this.boardWindows(board);
      if (windows.length >= 2) {
        this.setSequenceWindow(boardId, windows[0]);
      }
    }
  }

  /**
   * Boards a starting board fades out. Other playing boards are stopped (unless
   * either side is overplay); the starting board's pause-and-resume target is
   * paused instead, so it can be resumed in place when that board ends.
   */
  private displacedBy(board: Board): DisplacedBoards {
    const targetId = board.id;
    const pauseTarget = this.resumeTargetFor(board);
    const pause = pauseTarget?.id != null && this.isBoardPlaying(pauseTarget.id)
      ? [pauseTarget]
      : [];

    const stop = (board.overplay ?? false)
      ? []
      : this.boards().filter(candidate =>
          candidate.id != null &&
          candidate.id !== targetId &&
          candidate.id !== pauseTarget?.id &&
          !(candidate.overplay ?? false) &&
          this.isBoardPlaying(candidate.id),
        );

    return { stop, pause };
  }

  /**
   * Master-volume crossfade orchestration: ramp the started board up and the
   * displaced boards down, then stop (or pause) them once the fade completes.
   */
  private applyPlayCrossfade(
    targetId: string,
    wasPlaying: boolean,
    displaced: DisplacedBoards,
    rampMsOverride?: number,
  ): void {
    const fadingOut = displaced.stop.length + displaced.pause.length;
    if (wasPlaying && fadingOut === 0) {
      return;
    }

    // A board-to-board switch always uses a fixed crossfade so every board change
    // feels the same regardless of the boards' own crossfade settings. When
    // starting from silence there are no stopping boards, so the incoming board's
    // own crossfade sizes the fade-up (floored at a tiny safety fade for a 0 setting).
    // A linked handoff passes the outgoing board's crossfade so it lands on the seam.
    const incomingBoard = this.findBoard(targetId);
    const rampMs = rampMsOverride ?? (fadingOut > 0
      ? BOARD_CHANGE_CROSSFADE_MS
      : effectiveCrossfadeMs(incomingBoard ? this.boardCrossfadeMs(incomingBoard) : 0));

    if (!wasPlaying) {
      this.fadeIn(targetId, rampMs);
    }
    this.fadeOut(displaced, rampMs);
  }

  /*
   * Each faded board records the fade that last touched it (a token), so when a
   * later fade takes over the board (e.g. it is restarted mid fade-out) the older
   * fade's cleanup leaves it alone instead of stopping it.
   */

  private fadeIn(boardId: string, rampMs: number): void {
    const token = ++this.fadeTokenSeq;
    this.fadeTokens.set(boardId, token);
    // Setting the ramp before the target ensures the child player reads the
    // correct duration when its masterVolume input changes.
    this.masterFadeRampMsByBoard.set(boardId, rampMs);
    this.masterVolumesByBoard.set(boardId, 1);
    this.fadeStateVersion.update(n => n + 1);

    this.scheduleFadeCleanup(rampMs, () => {
      if (!this.releaseFade(boardId, token)) return;
      this.masterVolumesByBoard.delete(boardId);
      this.masterFadeRampMsByBoard.delete(boardId);
    });
  }

  private fadeOut({ stop, pause }: DisplacedBoards, rampMs: number): void {
    if (stop.length === 0 && pause.length === 0) return;

    const token = ++this.fadeTokenSeq;
    for (const item of [...stop, ...pause]) {
      const id = item.id!;
      // A fading-out board can no longer warm up (or be warmed up for) a handoff.
      this.cancelHandoffsInvolving(id);
      this.fadeTokens.set(id, token);
      this.masterFadeRampMsByBoard.set(id, rampMs);
      this.masterVolumesByBoard.set(id, 0);
    }
    this.fadeStateVersion.update(n => n + 1);

    this.scheduleFadeCleanup(rampMs, () => {
      for (const item of stop) {
        if (!this.releaseFade(item.id!, token)) continue;
        this.masterVolumesByBoard.delete(item.id!);
        this.masterFadeRampMsByBoard.delete(item.id!);
        this.clearBoard(item.id!);
      }

      for (const item of pause) {
        if (!this.releaseFade(item.id!, token)) continue;
        // Keep the master volume at 0 while paused so the resume fades up from silence.
        this.masterFadeRampMsByBoard.delete(item.id!);
        if (this.isBoardPlaying(item.id!)) {
          this.boardStatuses.set(item.id!, 'PAUSED');
        }
      }

      this.syncPlayingState();
    });
  }

  private scheduleFadeCleanup(rampMs: number, cleanup: () => void): void {
    const timer = setTimeout(() => {
      this.fadeCleanupTimers.delete(timer);
      cleanup();
      this.fadeStateVersion.update(n => n + 1);
    }, rampMs + 60);
    this.fadeCleanupTimers.add(timer);
  }

  /** True (and forgets the token) when `token` is still the board's latest fade. */
  private releaseFade(boardId: string, token: number): boolean {
    if (this.fadeTokens.get(boardId) !== token) return false;
    this.fadeTokens.delete(boardId);
    return true;
  }

  stopBoardTrack(board: Board): void {
    if (board.id == null) return;

    // The YouTube IFrame player manages status client-side — no backend stop call.
    this.clearBoard(board.id);
  }

  onBoardNearEnd(board: Board): void {
    if (board.id == null) return;

    if (board.playlistMode) {
      // Advance ahead of the track end so the next track crossfades in while the
      // current one is still playing, instead of gapping after it has stopped.
      this.advancePlaylist(board, true, true);
      return;
    }

    if (this.getSequentialWindows(board)) {
      // Advance to the next window ahead of the current window's end so the
      // window-change crossfade overlaps the seam.
      this.advanceSequenceWindow(board);
      return;
    }

    this.handOffToLinkedBoard(board);
  }

  /**
   * A couple of seconds before this board's crossfade point: warm up the board it
   * will start, so its YouTube player has loaded and buffered by the seam instead
   * of cold-starting there. A paused resume target is already loaded — it resumes
   * at the seam.
   */
  onBoardEndApproaching(board: Board): void {
    if (board.id == null || !this.isBoardPlaying(board.id)) return;

    const next = this.linkedBoardFor(board);
    if (next?.id == null) return;
    if (this.pendingHandoffs.has(next.id)) return;

    const status = this.boardStatuses.get(next.id);
    if (status === 'PLAYING' || status === 'PAUSED') return;

    this.beginHandoff(board, next, false);
  }

  /** A board's audio actually started — advances a handoff waiting on it. */
  onBoardPlaybackStarted(board: Board): void {
    const boardId = board.id;
    const pending = boardId != null ? this.pendingHandoffs.get(boardId) : undefined;
    if (!pending || boardId == null) return;

    if (!pending.seamReached) {
      // Warmed up early: hold it paused at its start (loaded and buffered) so none
      // of it plays unheard; it resumes when the outgoing board reaches the seam.
      if (pending.phase === 'loading') {
        pending.phase = 'primed';
        this.boardStatuses.set(boardId, 'PAUSED');
        this.syncPlayingState();
      }
      return;
    }

    this.commitHandoff(boardId, true);
  }

  onAudioEnded(board: Board): void {
    if (board.id == null) return;

    if (board.playlistMode) {
      // If nearEnd already kicked off the advance/crossfade, advancePlaylist
      // dedupes via its in-flight guard; otherwise this advances at the seam.
      this.advancePlaylist(board, true, true);
      return;
    }

    // Sequence mode: hitting a window's hard end must loop the sequence, not stop
    // the board. This happens when the seamless seam crossfade can't run — e.g. the
    // user seeked into the last window's crossfade tail, aborting the in-flight loop
    // crossfade, or that window ends at the track's natural end.
    if (this.getSequentialWindows(board) && (board.repeat ?? false)) {
      this.restartSequenceLoop(board);
      return;
    }

    // Fallback when nearEnd never fired (e.g. seeked past it): hand off at the seam.
    if (!this.linkedHandoffBoardIds.delete(board.id)) {
      this.handOffToLinkedBoard(board);
      this.linkedHandoffBoardIds.delete(board.id);
    }

    this.clearBoard(board.id);
  }

  /**
   * The outgoing board reached its crossfade point (nearEnd fires one
   * crossfade-length before the seam): start or resume its linked board and
   * crossfade into it as soon as that board's audio is actually playing.
   */
  private handOffToLinkedBoard(board: Board): void {
    const fromId = board.id;
    if (fromId == null || this.linkedHandoffBoardIds.has(fromId)) return;
    if (!this.isBoardPlaying(fromId)) return;

    const next = this.linkedBoardFor(board);
    if (next?.id == null) return;
    const targetId = next.id;

    this.linkedHandoffBoardIds.add(fromId);

    const pending = this.pendingHandoffs.get(targetId);
    if (pending?.fromId === fromId) {
      pending.seamReached = true;
      if (pending.phase === 'primed') {
        this.resumeSilently(targetId);
        pending.phase = 'starting';
      }
      this.armHandoffFallback(targetId);
    } else if (this.isBoardPlaying(targetId)) {
      // Already audible (e.g. an overplay board) — nothing to start.
      return;
    } else {
      this.beginHandoff(board, next, true);
    }

    // Fade the outgoing board out on its own schedule so the fade lands on its
    // seam; the target fades in as soon as its audio is actually playing.
    this.fadeOut({ stop: [board], pause: [] }, effectiveCrossfadeMs(this.boardCrossfadeMs(board)));
  }

  /** Start (or resume) the target silently and track it until it can fade in. */
  private beginHandoff(from: Board, target: Board, seamReached: boolean): void {
    const targetId = target.id!;
    this.dropHandoff(targetId);

    const resuming = this.boardStatuses.get(targetId) === 'PAUSED';
    this.pendingHandoffs.set(targetId, {
      fromId: from.id!,
      rampMs: effectiveCrossfadeMs(this.boardCrossfadeMs(from)),
      phase: resuming ? 'starting' : 'loading',
      seamReached,
      fallbackTimer: null,
    });

    this.prepareStart(target, resuming);
    this.resumeSilently(targetId);

    if (seamReached) {
      this.armHandoffFallback(targetId);
    }
  }

  /** Set a board playing with its master volume held at 0 (no fade yet). */
  private resumeSilently(boardId: string): void {
    // Detach it from any fade still running on it (e.g. the pause fade-out).
    this.fadeTokens.delete(boardId);
    this.masterFadeRampMsByBoard.delete(boardId);
    this.masterVolumesByBoard.set(boardId, 0);
    this.boardStatuses.set(boardId, 'PLAYING');
    this.streamUrlsByBoard.delete(boardId);
    this.syncPlayingState();
    this.fadeStateVersion.update(n => n + 1);
  }

  /** If the target never reports playback (slow network, blocked autoplay), fade it in anyway. */
  private armHandoffFallback(targetId: string): void {
    const pending = this.pendingHandoffs.get(targetId);
    if (!pending || pending.fallbackTimer != null) return;

    pending.fallbackTimer = setTimeout(() => {
      pending.fallbackTimer = null;
      this.commitHandoff(targetId, true);
    }, LINKED_HANDOFF_START_TIMEOUT_MS);
  }

  /**
   * Fade a handoff target in (and whatever it displaces out). At the seam this
   * uses the outgoing board's crossfade — that board is already fading out; a
   * manual early play of the target follows the normal board-switch rules.
   */
  private commitHandoff(targetId: string, atSeam: boolean): void {
    const pending = this.pendingHandoffs.get(targetId);
    if (!pending) return;
    this.dropHandoff(targetId);

    const target = this.findBoard(targetId);
    if (!target) return;

    if (!this.isBoardPlaying(targetId)) {
      this.resumeSilently(targetId);
    }

    this.applyPlayCrossfade(
      targetId,
      false,
      this.displacedBy(target),
      atSeam ? pending.rampMs : undefined,
    );
  }

  /** Forget a pending handoff into this board (no playback change). */
  private dropHandoff(targetId: string): void {
    const pending = this.pendingHandoffs.get(targetId);
    if (!pending) return;
    if (pending.fallbackTimer != null) clearTimeout(pending.fallbackTimer);
    this.pendingHandoffs.delete(targetId);
  }

  /**
   * A board stopped or started fading out: drop the handoff into it, and undo any
   * warm-up it started for a board it will no longer reach the seam to hand off to.
   */
  private cancelHandoffsInvolving(boardId: string): void {
    this.dropHandoff(boardId);

    for (const [targetId, pending] of [...this.pendingHandoffs]) {
      if (pending.fromId !== boardId || pending.seamReached) continue;
      this.dropHandoff(targetId);
      this.clearBoard(targetId);
    }
  }

  /** The board to start after this one, when the chain can fire (single, loop off,
      and the linked board has a track to play). */
  private linkedBoardFor(board: Board): Board | null {
    const linkedId = board.linkedBoard?.boardId;
    if (linkedId == null || linkedId === board.id) return null;
    if (board.playlistMode || (board.repeat ?? false) || this.getSequentialWindows(board)) {
      return null;
    }

    const next = this.findBoard(linkedId);
    if (!next?.selectedTrack || next.sessionId !== board.sessionId) return null;
    return next;
  }

  /** The linked board this one pauses while it plays (pause-and-resume action). */
  private resumeTargetFor(board: Board): Board | null {
    return board.linkedBoard?.mode === LinkedBoardMode.Resume ? this.linkedBoardFor(board) : null;
  }

  onAudioError(board: Board): void {
    if (board.id == null) return;

    console.error('Audio stream failed for board', board.id);
    this.boardStatuses.set(board.id, 'ERROR');
    this.streamUrlsByBoard.delete(board.id);
    this.syncPlayingState();
    this.toast.error(this.t('stages.err.audio'));
  }

  getBoardStatus(board: Board): PlayerStatus {
    return board.id != null
      ? (this.boardStatuses.get(board.id) ?? 'STOPPED')
      : 'STOPPED';
  }

  getMasterVolume(board: Board): number {
    // Read the version signal so template-bound getters re-evaluate when the
    // map mutates outside Angular signal awareness.
    this.fadeStateVersion();

    const volume01 = this.getBoardVolumePercent(board) / 100;
    const fade = board.id != null
      ? (this.masterVolumesByBoard.get(board.id) ?? 1)
      : 1;

    return Math.max(0, Math.min(volume01 * fade, 1));
  }

  getMasterFadeRampMs(board: Board): number {
    this.fadeStateVersion();
    return board.id != null
      ? (this.masterFadeRampMsByBoard.get(board.id) ?? 0)
      : 0;
  }

  getBoardVolumePercent(board: Board): number {
    return clampPct(board.volume);
  }

  getPlaylistOptions(board: Board): PlaylistOptions {
    return {
      random: board.shuffle ?? false,
    };
  }

  getSequentialWindows(board: Board): boolean {
    if (board.id == null) {
      return this.sequenceModeFromBoard(board);
    }

    return this.sequentialWindowsByBoard.get(board.id)
      ?? this.sequenceModeFromBoard(board);
  }

  private boardWindows(board: Board): TrackWindow[] {
    return board.selectedTrack?.trackWindows ?? [];
  }

  /** A track can be sequenced only when it has at least two windows to step between. */
  private canSequenceTrack(track: Track | null | undefined): boolean {
    return (track?.trackWindows?.length ?? 0) >= 2;
  }

  /**
   * Persist a downgrade out of sequence mode for a board that optimistically kept
   * it across a group change but landed on a track that can't be sequenced.
   */
  private persistSequenceModeOff(boardId: string): void {
    const fresh = this.boards().find(b => b.id === boardId);
    if (!fresh) return;

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(fresh, { sequenceMode: false }),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(updated => {
        if (updated) this.upsertBoard(updated);
      });
  }

  /**
   * Crossfade length (ms) currently in effect for a board: the fade-in + fade-out
   * of the selected window, or the track's own ("whole track") fades when no
   * window is selected.
   */
  private boardCrossfadeMs(board: Board): number {
    const window = this.selectedWindowFor(board);
    const fadeInMs = window?.fadeInDurationMs ?? board.selectedTrack?.fadeInDurationMs ?? 0;
    const fadeOutMs = window?.fadeOutDurationMs ?? board.selectedTrack?.fadeOutDurationMs ?? 0;
    return sourceCrossfadeMs(fadeInMs, fadeOutMs);
  }

  private selectedWindowFor(board: Board): TrackWindow | null {
    if (board.id == null) return null;
    const windowId = this.selectedWindowByBoard.get(board.id) ?? null;
    if (windowId == null) return null;
    return this.boardWindows(board).find(w => w.id === windowId) ?? null;
  }

  private findBoard(id: string): Board | null {
    return this.boards().find(b => b.id === id) ?? null;
  }

  private setSequenceWindow(boardId: string, window: TrackWindow): void {
    this.selectedWindowByBoard.set(boardId, window.id ?? null);
    // Force template getters bound to the selection to re-evaluate so the
    // player receives the new window and crossfades into it.
    this.windowSelectionVersion.update(n => n + 1);
  }

  /**
   * Advance to the next window in sequence mode. Reuses the player's window-change
   * crossfade by mutating the locally selected window. At the last window it loops
   * back to the first when repeat is on, otherwise it lets the window play out so
   * the player emits `ended` and the board stops.
   */
  private advanceSequenceWindow(board: Board): void {
    if (board.id == null) return;
    const boardId = board.id;

    const windows = this.boardWindows(board);
    if (windows.length < 2) {
      this.clearBoard(boardId);
      return;
    }

    const currentId = this.selectedWindowByBoard.get(boardId) ?? null;
    const currentIdx = windows.findIndex(w => w.id === currentId);
    let nextIdx = currentIdx + 1;

    if (nextIdx >= windows.length) {
      if (!(board.repeat ?? false)) {
        // No loop: the last window plays to its end and the board stops.
        return;
      }
      nextIdx = 0;
    }

    // The YouTube deck crossfades client-side from the window-input change.
    this.setSequenceWindow(boardId, windows[nextIdx]);
  }

  /**
   * Loop a window sequence back to its first window after the player reached a
   * window's hard end instead of crossfading at the seam (e.g. a manual seek into
   * the last window's crossfade tail aborted the in-flight loop crossfade). A clean
   * stop→play cycle restarts playback: the looping track/video is unchanged, so the
   * player only resumes on a STOPPED→PLAYING status edge. Normal seam loops keep
   * their seamless crossfade — this is just the recovery path for that edge case.
   */
  private restartSequenceLoop(board: Board): void {
    const boardId = board.id;
    if (boardId == null) return;

    this.clearBoard(boardId);

    // Defer so the STOPPED status reaches the player before PLAYING is set again;
    // a same-tick stop+play would net no status change and the player wouldn't
    // restart.
    setTimeout(() => {
      const fresh = this.boards().find(b => b.id === boardId);
      if (fresh && this.sequenceModeFromBoard(fresh)) {
        this.playBoardTrack(fresh);
      }
    });
  }

  getGroupsForBoard(board: Board): Group[] {
    const selected = board.selectedGroup;
    const base = this.sessionGroups();

    if (selected?.id == null) {
      return base;
    }

    return base.some(group => group.id === selected.id)
      ? base
      : [selected, ...base];
  }

  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    // Only start board traversal when nothing is focused (i.e. focus on body).
    // Any other focused control (inputs, dropdowns, dialogs) keeps its own
    // arrow-key semantics.
    const active = document.activeElement;
    if (active != null && active !== document.body) return;

    const cards = this.boardCards?.toArray() ?? [];
    if (cards.length === 0) return;

    event.preventDefault();
    const target = event.key === 'ArrowDown' ? cards[0] : cards[cards.length - 1];
    target?.focusChevron();
  }

  focusBoardByOffset(board: Board, delta: number): void {
    const cards = this.boardCards?.toArray() ?? [];
    const idx = cards.findIndex(c => c.board().id === board.id);
    if (idx < 0) return;
    const target = cards[idx + delta];
    target?.focusChevron();
  }

  getSelectedWindowId(board: Board): string | null {
    // Read the version so this template getter re-evaluates when the selection
    // map mutates without a boards() update (sequence-mode advance).
    this.windowSelectionVersion();
    return board.id != null
      ? (this.selectedWindowByBoard.get(board.id) ?? null)
      : null;
  }

  private setupVolumeDebounce(): void {
    this.volumeCommit$
      .pipe(
        groupBy(commit => commit.boardId),
        mergeMap(group$ =>
          group$.pipe(
            debounceTime(400),
            distinctUntilChanged(
              (a, b) => a.boardId === b.boardId && a.volumePercent === b.volumePercent,
            ),
            switchMap(({ boardId, volumePercent }) => {
              const board = this.boards().find(item => item.id === boardId);
              if (!board) {
                return of(null);
              }

              return this.boardsApi.updateUserBoard({
                boardId,
                boardUpdateRequest: this.baseUpdate(board, { volume: volumePercent }),
              }).pipe(
                catchError((err: unknown) => {
                  console.error(err);

                  const rolledBack = this.persistedVolumesByBoard.get(boardId) ?? 100;
                  this.boards.update(current =>
                    current.map(item =>
                      item.id === boardId ? { ...item, volume: rolledBack } : item,
                    ),
                  );

                  this.toast.error(httpErrorMessage(err, { fallback: 'Updating volume failed.' }));
                  return of(null);
                }),
              );
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(updated => {
        if (updated) {
          this.upsertBoard(updated);
        }
      });
  }

  private advancePlaylist(
    board: Board,
    autoPlay = true,
    requireActiveToContinue = false,
  ): void {
    if (board.id == null) return;

    const boardId = board.id;

    // nearEnd (preload) and ended (seam) can both ask to advance the same board;
    // run only one advance at a time so a track isn't skipped.
    if (this.playlistAdvanceInFlightBoardIds.has(boardId)) return;

    const availableTracks = board.availableTracks ?? [];

    if (!availableTracks.length) {
      this.clearBoard(boardId);
      return;
    }

    if (!this.playlistOrderByBoard.has(boardId)) {
      this.regeneratePlaylistOrder(boardId, availableTracks, board.shuffle ?? false);
    }

    let order = this.playlistOrderByBoard.get(boardId)!;
    const prevStep = this.playlistIndexByBoard.get(boardId) ?? -1;
    const lastPlayedIndex = prevStep >= 0 && prevStep < order.length ? order[prevStep] : -1;
    let nextStep = prevStep + 1;

    if (nextStep >= order.length) {
      // Completed a full pass over the group. Reshuffle for the next cycle when
      // random so every track plays once before any repeats, but the order
      // differs each cycle. Avoid replaying the just-finished track back-to-back.
      if (board.shuffle ?? false) {
        this.regeneratePlaylistOrder(boardId, availableTracks, true);
        order = this.playlistOrderByBoard.get(boardId)!;
        if (order.length > 1 && order[0] === lastPlayedIndex) {
          [order[0], order[1]] = [order[1], order[0]];
        }
      }
      nextStep = 0;
    }

    this.playlistIndexByBoard.set(boardId, nextStep);

    const nextTrackIndex = order[nextStep];
    const nextTrack = availableTracks[nextTrackIndex] ?? availableTracks[0];

    this.playlistAdvanceInFlightBoardIds.add(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: nextTrack.id ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.playlistAdvanceInFlightBoardIds.delete(boardId);
          this.streamUrlsByBoard.delete(boardId);
          this.upsertBoard(updated);
          // A continuation advance (nearEnd/ended) must not resurrect a board
          // the user stopped while the update was in flight.
          if (requireActiveToContinue && !this.isBoardActive(boardId)) {
            return;
          }
          if (autoPlay) {
            const freshBoard = this.boards().find(item => item.id === boardId);
            if (freshBoard) {
              this.playBoardTrack(freshBoard);
            }
          }
        },
        error: err => {
          this.playlistAdvanceInFlightBoardIds.delete(boardId);
          console.error('Playlist advance failed', err);
          this.clearBoard(boardId);
        },
      });
  }

  private updateBoard(
    board: Board,
    overrides: Partial<BoardUpdateRequest>,
    errorMessage: string,
    onSuccess?: () => void,
  ): void {
    if (board.id == null) return;

    const sessionId = board.sessionId ?? this.sessionsStore.selectedSessionId();

    if (sessionId == null) {
      this.toast.error('No session selected.');
      return;
    }

    this.boardsApi.updateUserBoard({
      boardId: board.id,
      boardUpdateRequest: this.baseUpdate(board, overrides),
    })
      .pipe(
        switchMap(() => this.sessionsStore.refreshSession(sessionId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: session => {
          this.replaceBoardsFromSession(session);
          onSuccess?.();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: errorMessage }));
        },
      });
  }

  /**
   * Picking a track or group from the whole library adds it to the session on the
   * server, which widens every board's track list — re-read the session then.
   */
  private syncSessionScope(board: Board): void {
    const sessionId = board.sessionId ?? this.sessionsStore.selectedSessionId();
    if (sessionId == null) return;

    const trackId = board.selectedTrack?.id;
    const groupId = board.selectedGroup?.id;
    const known =
      (trackId == null || this.sessionsStore.scopedTrackIds().has(trackId))
      && (groupId == null || this.sessionsStore.sessionGroupIds().has(groupId));
    if (known) return;

    this.sessionsStore.refreshSession(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: session => this.refreshAvailableTracks(session),
        error: (err: unknown) => console.error(err),
      });
  }

  private refreshAvailableTracks(session: SessionResponse): void {
    const fresh = new Map((session.boards ?? []).map(b => [b.id, b.availableTracks]));

    this.boards.update(current =>
      current.map(board =>
        fresh.has(board.id) ? { ...board, availableTracks: fresh.get(board.id) } : board,
      ),
    );
  }

  private replaceBoardsFromSession(session: SessionResponse | null): void {
    if (session?.sessionId == null) return;

    const sessionId = session.sessionId;
    const sessionBoards = this.stampSessionId(session.boards ?? [], sessionId);
    this.prepareBoards(sessionBoards);

    this.boards.update(current => {
      const boardsFromOtherSessions = current.filter(board => board.sessionId !== sessionId);
      return this.sortBoards([...boardsFromOtherSessions, ...sessionBoards]);
    });
  }

  private baseUpdate(
    board: Board,
    overrides: Partial<BoardUpdateRequest> = {},
  ): BoardUpdateRequest {
    return {
      name: board.name ?? undefined,
      selectedTrackId: board.selectedTrack?.id ?? undefined,
      selectedGroupId: board.selectedGroup?.id ?? undefined,
      selectedWindowId: board.selectedWindow?.id ?? undefined,
      volume: board.volume ?? undefined,
      repeat: board.repeat ?? undefined,
      overplay: board.overplay ?? undefined,
      shuffle: board.shuffle ?? undefined,
      playlistMode: board.playlistMode ?? undefined,
      sequenceMode: this.sequenceModeForRequest(board),
      // Always sent so a full update never drops the link (null clears it); a
      // link to a board deleted meanwhile is cleared rather than re-sent.
      linkedBoard: this.findBoard(board.linkedBoard?.boardId ?? '') ? board.linkedBoard : null,
      ...overrides,
    };
  }

  private clearBoard(boardId: string): void {
    this.cancelHandoffsInvolving(boardId);
    this.boardStatuses.set(boardId, 'STOPPED');
    this.streamUrlsByBoard.delete(boardId);
    this.syncPlayingState();
  }

  private isBoardActive(boardId: string): boolean {
    const status = this.boardStatuses.get(boardId);
    return status === 'PLAYING' || status === 'PAUSED';
  }

  /** Audibly playing — excludes boards paused for a pause-and-resume action. */
  private isBoardPlaying(boardId: string): boolean {
    return this.boardStatuses.get(boardId) === 'PLAYING';
  }

  private upsertBoard(updated: Board): void {
    if (updated.id == null) return;

    let normalizedBoard: Board = updated;

    this.boards.update(current => {
      const existingBoard = current.find(item => item.id === updated.id);
      normalizedBoard = this.withSessionId(updated, existingBoard);
      return this.replaceBoard(current, normalizedBoard);
    });

    this.syncPersistedVolume(normalizedBoard);
    this.syncSelectedWindow(normalizedBoard);
    this.syncSequenceMode(normalizedBoard);
  }

  private replaceBoard(boards: Board[], board: Board): Board[] {
    const exists = boards.some(item => item.id === board.id);
    const next = exists
      ? boards.map(item => item.id === board.id ? board : item)
      : [...boards, board];

    return this.sortBoards(next);
  }

  private withSessionId(board: Board, existing?: Board): Board {
    return {
      ...board,
      sessionId:
        board.sessionId
        ?? existing?.sessionId
        ?? this.sessionsStore.selectedSessionId()
        ?? undefined,
    };
  }

  private prepareBoards(
    boards: Board[],
    resetPersistedVolumes = false,
    preserveActiveSelection = false,
  ): void {
    if (resetPersistedVolumes) {
      this.persistedVolumesByBoard.clear();
    }

    for (const board of boards) {
      this.ensureBoardStatus(board);
      this.syncPersistedVolume(board);

      // A background refresh must not clobber the live window/sequence position of
      // a playing board: sequence advances are intentionally not persisted, so the
      // backend's selectedWindow is stale (pinned at the first window).
      if (preserveActiveSelection && board.id != null && this.isBoardActive(board.id)) {
        continue;
      }

      this.syncSelectedWindow(board);
      this.syncSequenceMode(board);
    }
  }

  private ensureBoardStatus(board: Board): void {
    if (board.id != null && !this.boardStatuses.has(board.id)) {
      this.boardStatuses.set(board.id, 'STOPPED');
    }
  }

  private updateBoardVolume(boardId: string, volumePercent: number): number {
    const clamped = clampPct(volumePercent);

    this.boards.update(current =>
      current.map(item =>
        item.id === boardId ? { ...item, volume: clamped } : item,
      ),
    );

    return clamped;
  }

  private removeBoardLocalState(boardId: string): void {
    this.boardStatuses.delete(boardId);
    this.streamUrlsByBoard.delete(boardId);
    this.selectedWindowByBoard.delete(boardId);
    this.sequentialWindowsByBoard.delete(boardId);
    this.preSingleSelectionByBoard.delete(boardId);
    this.masterVolumesByBoard.delete(boardId);
    this.masterFadeRampMsByBoard.delete(boardId);
    this.playlistIndexByBoard.delete(boardId);
    this.playlistOrderByBoard.delete(boardId);
    this.persistedVolumesByBoard.delete(boardId);
    this.pendingTrackUpdateBoardIds.delete(boardId);
    this.playPendingAfterUpdateBoardIds.delete(boardId);
    this.linkedHandoffBoardIds.delete(boardId);
    this.dropHandoff(boardId);
    this.fadeTokens.delete(boardId);
    this.shortcuts.clearShortcut(boardId);
  }

  private clearFadeCleanupTimers(): void {
    for (const timer of this.fadeCleanupTimers) clearTimeout(timer);
    this.fadeCleanupTimers.clear();
    this.fadeTokens.clear();
  }

  private syncPersistedVolume(board: Board): void {
    if (board.id != null) {
      this.persistedVolumesByBoard.set(board.id, clampPct(board.volume));
    }
  }

  private syncSelectedWindow(board: Board): void {
    if (board.id != null) {
      this.selectedWindowByBoard.set(board.id, board.selectedWindow?.id ?? null);
    }
  }

  private syncSequenceMode(board: Board): void {
    if (board.id == null) return;

    if (!this.sequenceModeFromBoard(board)) {
      this.sequentialWindowsByBoard.delete(board.id);
      return;
    }

    this.sequentialWindowsByBoard.set(board.id, true);

    const hasSelectedWindow = this.selectedWindowByBoard.get(board.id) != null;
    if (hasSelectedWindow) return;

    const firstWindow = board.selectedTrack?.trackWindows?.[0];
    if (firstWindow?.id != null) {
      this.selectedWindowByBoard.set(board.id, firstWindow.id);
    }
  }

  private sequenceModeFromBoard(board: Board): boolean {
    return !(board.playlistMode ?? false)
      && ((board.sequenceMode ?? false) === true);
  }

  private sequenceModeForRequest(board: Board): boolean | undefined {
    if (board.id != null) {
      const localValue = this.sequentialWindowsByBoard.get(board.id);
      if (localValue != null) return localValue;
    }

    return board.sequenceMode ?? undefined;
  }

  private regeneratePlaylistOrder(boardId: string, tracks: Track[], shuffle: boolean): void {
    const indices = tracks.map((_, i) => i);
    if (shuffle) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    this.playlistOrderByBoard.set(boardId, indices);
    this.playlistIndexByBoard.set(boardId, -1);
  }

  private appendError(message: string): void {
    this.errorMessage.update(current =>
      current ? (current.includes(message) ? current : `${current} ${message}`) : message,
    );
  }

  private syncPlayingState(): void {
    const anyPlaying = this.boards().some(b =>
      b.id != null && this.isBoardPlaying(b.id),
    );
    this.boardPlayback.setPlaying(anyPlaying);
  }

  /**
   * Re-entering /boards costs one request: sessions.
   *
   * Sessions carry the boards along with each board's `availableTracks`,
   * `selectedTrack` and `selectedGroup` — so the server is already authoritative
   * about what every board can play, including after a publisher revokes a share.
   * The store's track list only populates the create-board form's picker, and the
   * group list only the per-board dropdown; neither can change behind the user's
   * back, so both are served from cache here.
   */
  private refreshBackgroundData(): void {
    forkJoin({
      sessions: this.sessionsStore.refresh().pipe(catchError(() => of({ sessions: [] }))),
      tracks: this.tracksStore.load(),
      groups: this.groupsStore.load(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sessions }) => {
        const mergedBoards = this.flattenSessionBoards(sessions.sessions ?? []);

        this.prepareBoards(mergedBoards, false, true);

        // Merge fresh board data but preserve selectedTrack for active boards
        // so that an in-progress stream is not torn down just because the track
        // was deleted or unsubscribed on the server.
        this.boards.update(current => {
          const freshMap = new Map(mergedBoards.map(b => [b.id, b]));
          const updated = current.map(existing => {
            if (!freshMap.has(existing.id)) return existing;
            const fresh = freshMap.get(existing.id)!;
            if (existing.id != null && this.isBoardActive(existing.id)) {
              return { ...fresh, selectedTrack: existing.selectedTrack };
            }
            return fresh;
          });
          const existingIds = new Set(current.map(b => b.id));
          const added = mergedBoards.filter(b => !existingIds.has(b.id));
          return this.sortBoards([...updated, ...added]);
        });
      });
  }

  private stopAllBoards(): void {
    this.clearFadeCleanupTimers();

    for (const board of this.boards()) {
      if (board.id == null || !this.isBoardActive(board.id)) continue;
      this.clearBoard(board.id);
    }
  }

  private flattenSessionBoards(sessions: SessionResponse[]): Board[] {
    return sessions.flatMap(session => this.stampSessionId(session.boards ?? [], session.sessionId));
  }

  private stampSessionId(boards: Board[], sessionId: string | undefined): Board[] {
    if (sessionId == null) return boards;
    return boards.map(b => ({ ...b, sessionId }));
  }

  private sortBoards(boards: Board[]): Board[] {
    return [...boards].sort((a, b) => {
      const nameA = a.name ?? '';
      const nameB = b.name ?? '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }

}

function clampPct(value: number | null | undefined): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(Math.round(numeric), 100))
    : 100;
} 