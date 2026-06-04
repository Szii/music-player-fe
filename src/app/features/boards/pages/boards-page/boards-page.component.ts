import { Component, DestroyRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { USE_YT_IFRAME_PLAYER } from '../../../../core/config/feature-flags';
import { deriveCrossfadeMs } from '../../utils/crossfade';

import {
  MusicBoardsService,
  MusicGroupsService,
  MusicTracksService,
  PlaybackService,
  Board,
  BoardCreateRequest,
  BoardUpdateRequest,
  Group,
  PlaybackState,
  PlayRequest,
  SessionResponse,
  Track,
  TrackWindow,
} from '../../../../api/generated';

import {
  CreateBoardFormComponent,
  CreateBoardEvent,
} from '../../components/create-board-form/create-board-form.component';
import {
  BoardCardComponent,
  PlaylistOptions,
  PlaybackMode,
  LoopMode,
} from '../../components/board-card/board-card.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { SessionsDropdownComponent } from '../../../../shared/components/sessions-dropdown/sessions-dropdown.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../../core/services/board-playback.service';
import { BoardShortcutsService } from '../../../../core/services/board-shortcuts.service';
import { SessionsStore } from '../../../../core/services/sessions-store.service';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';

interface VolumeCommit {
  boardId: number;
  volumePercent: number;
}


@Component({
  selector: 'app-boards-page',
  standalone: true,
  imports: [
    CreateBoardFormComponent,
    BoardCardComponent,
    UiAlertComponent,
    UiCreateCtaComponent,
    SessionsDropdownComponent,
    UiPageTitleComponent,
  ],
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
  template: `
    <div class="app-page board-page">
      <ui-page-title title="Boards">
        <app-sessions-dropdown
          #sessionsDropdown
          class="boards-page__sessions"
        />
      </ui-page-title>

      @if (errorMessage()) {
        <ui-alert variant="danger">
          {{ errorMessage() }}
        </ui-alert>
      }

      @if (loading()) {
        <div class="app-muted boards-page__loading">
          Loading boards…
        </div>
      } @else if (!hasSessions()) {
        <ui-create-cta
          label="Create your first session"
          (clicked)="openCreateSession($event)"
        />
      } @else {
        <app-create-board-form
          #createBoardForm
          class="boards-page__create-board-form"
          [tracks]="tracks()"
          [submitting]="createBoardSubmitting()"
          [showTrigger]="sessionBoards().length > 0"
          (create)="createBoard($event)"
        />

        @if (sessionBoards().length === 0) {
          <ui-create-cta
            label="Create your first music board in this session"
            (clicked)="createBoardForm.open()"
          />
        } @else {
          <div class="boards-list-wrap">
            <div class="boards-list">
              @for (board of sessionBoards(); track board.id) {
                <app-board-card
                  [board]="board"
                  [availableGroups]="getGroupsForBoard(board)"
                  [status]="getBoardStatus(board)"
                  [streamUrl]="getStreamUrl(board)"
                  [selectedWindowId]="getSelectedWindowId(board)"
                  [masterVolume]="getMasterVolume(board)"
                  [masterFadeRampMs]="getMasterFadeRampMs(board)"
                  [volumePercent]="getBoardVolumePercent(board)"
                  [playlistMode]="board.playlistMode ?? false"
                  [sequentialWindows]="getSequentialWindows(board)"
                  [playlistOptions]="getPlaylistOptions(board)"
                  (delete)="deleteBoard(board)"
                  (groupChange)="onGroupSelectionChange(board, $event)"
                  (trackChange)="onTrackSelectionChange(board, $event)"
                  (windowChange)="onWindowSelectionChange(board, $event)"
                  (trackWithWindowChange)="onTrackWithWindowChange(board, $event)"
                  (loopModeChange)="onLoopModeChange(board, $event)"
                  (toggleOverplay)="toggleOverplay(board)"
                  (play)="playBoardTrack(board)"
                  (stop)="stopBoardTrack(board)"
                  (nearEnd)="onBoardNearEnd(board)"
                  (ended)="onAudioEnded(board)"
                  (audioError)="onAudioError(board)"
                  (modeChange)="onModeChange(board, $event)"
                  (playlistOptionsChange)="onPlaylistOptionsChange(board, $event)"
                  (skipNext)="onPlaylistSkip(board)"
                  (volumePreviewChange)="onBoardVolumePreview(board, $event)"
                  (volumeCommit)="onBoardVolumeCommit(board, $event)"
                  (rename)="onBoardRename(board, $event)"
                  (navigateBoardUp)="focusBoardByOffset(board, -1)"
                  (navigateBoardDown)="focusBoardByOffset(board, 1)"
                  (requestPlay)="onBoardRequestPlay(board)"
                />
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --boards-list-max-height: min(70dvh, 720px);
    }

    .boards-page__loading {
      margin-top: 1rem;
      color: var(--app-text-muted);
    }

    .boards-page__sessions {
      flex-shrink: 0;
      align-self: flex-start;
      transform: translateY(0.50rem);
      position: relative;
      z-index: 50;
    }

    .boards-list-wrap {
      margin-top: 1.25rem;
      max-height: var(--boards-list-max-height);
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
    }

    .boards-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .boards-list-wrap,
    .boards-list,
    app-create-board-form,
    ui-create-cta {
      position: relative;
    }

    .boards-page__create-board-form {
      display: block;
      margin-bottom: 1rem;
    }

    @media (max-width: 860px) {
      :host {
        --boards-list-max-height: min(52dvh, 640px);
      }
    }
  `],
})
export class BoardsPageComponent implements OnInit, OnDestroy {
  private readonly boardsApi = inject(MusicBoardsService);
  private readonly groupsApi = inject(MusicGroupsService);
  private readonly tracksApi = inject(MusicTracksService);
  private readonly playbackApi = inject(PlaybackService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly shortcuts = inject(BoardShortcutsService);
  private readonly sessionsStore = inject(SessionsStore);

  readonly boards = signal<Board[]>([]);
  readonly tracks = signal<Track[]>([]);
  readonly groups = signal<Group[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly createBoardSubmitting = signal(false);

  readonly hasSessions = this.sessionsStore.hasSessions;
  readonly sessionBoards = computed<Board[]>(() => {
    const sessionId = this.sessionsStore.selectedSessionId();
    if (sessionId == null) return [];
    return this.boards().filter(b => b.sessionId === sessionId);
  });

  @ViewChild('sessionsDropdown') sessionsDropdownRef?: SessionsDropdownComponent;
  @ViewChildren(BoardCardComponent) boardCards!: QueryList<BoardCardComponent>;

  private readonly streamUrlsByBoard = new Map<number, string>();
  private readonly boardStatuses = new Map<number, PlayerStatus>();
  private readonly selectedWindowByBoard = new Map<number, number | null>();
  /**
   * Local mirror of the backend-persisted sequence mode per board. It also keeps
   * optimistic UI state while an update request is in flight.
   */
  private readonly sequentialWindowsByBoard = new Map<number, boolean>();
  /**
   * Remembers the single-mode track/window selected when a board entered playlist
   * mode, so it can be restored when the board switches back to single instead of
   * being lost.
   */
  private readonly preSingleSelectionByBoard = new Map<number, { trackId: number | null; windowId: number | null }>();
  private readonly masterVolumesByBoard = new Map<number, number>();
  private readonly masterFadeRampMsByBoard = new Map<number, number>();
  private readonly playlistIndexByBoard = new Map<number, number>();
  private readonly playlistOrderByBoard = new Map<number, number[]>();
  private readonly persistedVolumesByBoard = new Map<number, number>();
  private readonly pendingTrackUpdateBoardIds = new Set<number>();
  private readonly playPendingAfterUpdateBoardIds = new Set<number>();
  private readonly playlistAdvanceInFlightBoardIds = new Set<number>();

  /** Fallback board-to-board crossfade when neither side has fades configured. */
  private static readonly DEFAULT_CROSSFADE_MS = 2000;

  private readonly fadeStateVersion = signal(0);
  /** Bumped whenever the locally-selected window changes without a `boards()`
      update (e.g. a sequence-mode advance), so template getters re-read the
      non-reactive selection map and the player crossfades to the new window. */
  private readonly windowSelectionVersion = signal(0);
  private crossfadeCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly volumeCommit$ = new Subject<VolumeCommit>();

  constructor() {
    effect(() => {
      if (!this.sessionsStore.loaded()) return;

      const sessionIds = new Set(
        this.sessionsStore.sessions()
          .map(s => s.sessionId)
          .filter((id): id is number => id != null),
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

  private onShortcutTriggered(boardId: number): void {
    const board = this.boards().find(item => item.id === boardId);
    if (!board) return;

    if (this.isBoardActive(boardId)) {
      this.stopBoardTrack(board);
    } else {
      this.playBoardTrack(board);
    }
  }

  ngOnDestroy(): void {
    this.clearCrossfadeCleanupTimer();
    this.volumeCommit$.complete();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      sessions: this.sessionsStore.load().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading sessions failed.');
          return of({ sessions: [] });
        }),
      ),
      ownTracks: this.tracksApi.getUserTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading tracks failed.');
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError(() => of([] as Track[])),
      ),
      groups: this.groupsApi.getUserGroups().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading groups failed.');
          return of([] as Group[]);
        }),
      ),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sessions, ownTracks, subscribedTracks, groups }) => {
          this.groups.set(groups ?? []);
          this.tracks.set(this.mergeTracks(ownTracks ?? [], subscribedTracks ?? []));

          const mergedBoards = this.flattenSessionBoards(sessions.sessions ?? []);
          this.prepareBoards(mergedBoards, true);

          this.boards.set(this.sortBoards(mergedBoards));
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError('Loading data failed.');
        },
      });
  }

  createBoard(event: CreateBoardEvent): void {
    const sessionId = this.sessionsStore.selectedSessionId();
    if (sessionId == null) {
      this.toast.error('Select a session before creating a board.');
      return;
    }

    this.createBoardSubmitting.set(true);

    const body: BoardCreateRequest = {
      name: event.name || undefined,
      selectedTrackId: event.selectedTrackId ?? undefined,
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
            this.toast.success('Board created.');
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Creating board failed.');
        },
      });
  }

  openCreateSession(event?: Event): void {
    event?.stopPropagation();
    this.sessionsDropdownRef?.openCreate();
  }

  async deleteBoard(board: Board): Promise<void> {
    if (board.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete board',
      message: `Delete board "${board.name || board.id}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
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
            this.toast.success('Board deleted.');
          },
          error: (err: unknown) => {
            console.error(err);
            this.toast.error('Deleting board failed.');
          },
        });
    };

    if (this.isBoardActive(boardId)) {
      if (USE_YT_IFRAME_PLAYER) {
        this.clearBoard(boardId);
        doDelete();
        return;
      }

      this.playbackApi.stopBoard({ boardId })
        .pipe(
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.clearBoard(boardId);
          doDelete();
        });
    } else {
      doDelete();
    }
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
        'Updating loop mode failed.',
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
        'Updating loop mode failed.',
      );
      return;
    }

    // Plain off ↔ whole repeat change — preserve any user-selected window.
    this.updateBoard(
      board,
      { sequenceMode: false, repeat },
      'Updating loop mode failed.',
    );
  }

  toggleOverplay(board: Board): void {
    this.updateBoard(
      board,
      { overplay: !(board.overplay ?? false) },
      'Updating overplay failed.',
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
        'Updating playlist mode failed.',
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
        'Updating sequence mode failed.',
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
        'Updating playlist mode failed.',
        () => this.restoreSingleSelection(boardId),
      );
      return;
    }

    this.updateBoard(
      board,
      { sequenceMode: false },
      'Updating sequence mode failed.',
    );
  }

  /**
   * Restore the track/window the board had before it entered playlist mode. Only
   * applies a track that is still available on the board; otherwise leaves the
   * board with no selection. The board is already stopped at this point.
   */
  private restoreSingleSelection(boardId: number): void {
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
          this.toast.error('Restoring track failed.');
        },
      });
  }

  onBoardRename(board: Board, name: string): void {
    this.updateBoard(board, { name }, 'Renaming board failed.');
  }

  onPlaylistOptionsChange(board: Board, options: PlaylistOptions): void {
    this.updateBoard(board, { shuffle: options.random }, 'Updating shuffle failed.');

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

  onGroupSelectionChange(board: Board, selectedId: number | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    const playingTrack = board.selectedTrack;

    this.sequentialWindowsByBoard.delete(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedGroupId: selectedId ?? undefined,
        selectedTrackId:  undefined,
        selectedWindowId: undefined,
        sequenceMode: false,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
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
          // switch (the group shows a desync hint until then).
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

          // Stopped: just adopt the new group's default selection.
          this.selectedWindowByBoard.delete(boardId);
          this.upsertBoard(updated);
          this.clearBoard(boardId);
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Updating group failed.');
        },
      });
  }

  onTrackWithWindowChange(
    board: Board,
    payload: { trackId: number | null; windowId: number | null },
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
          this.selectedWindowByBoard.set(boardId, windowId);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          const wantsPlay = this.playPendingAfterUpdateBoardIds.delete(boardId);

          if (trackId != null && (wasActive || wantsPlay)) {
            // With the YouTube IFrame backend, an already-active board applies
            // track/window changes client-side (the player crossfades to the new
            // video id / window) — no backend stream call needed.
            if (USE_YT_IFRAME_PLAYER && wasActive) {
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
          this.toast.error('Updating board failed.');
        },
      });
  }

  onTrackSelectionChange(board: Board, selectedId: number | null): void {
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
            if (USE_YT_IFRAME_PLAYER && wasActive) {
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
          this.toast.error('Updating board failed.');
        },
      });
  }

  onWindowSelectionChange(board: Board, windowId: number | null): void {
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
          this.toast.error('Updating window failed.');
        },
      });

    if (this.isBoardActive(boardId)) {
      // With the YouTube IFrame backend the window change is applied client-side
      // by the player reacting to the new window inputs — no backend stream call.
      if (!USE_YT_IFRAME_PLAYER) {
        this.playBoardTrack(board);
      }
    }
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

    // Window changes are synchronous; if the board is already active,
    // onWindowSelectionChange already kicked off a restart. Skip to avoid
    // double-playing.
    if (this.isBoardActive(boardId)) return;

    this.playBoardTrack(board);
  }

  playBoardTrack(board: Board): void {
    if (board.id == null) return;

    if (!board.selectedTrack) {
      if (board.playlistMode) {
        this.advancePlaylist(board);
      }
      return;
    }

    const targetId = board.id;
    const targetOverplay = board.overplay ?? false;
    const wasActive = this.isBoardActive(targetId);

    const boardsToStop = targetOverplay
      ? []
      : this.boards().filter(candidate =>
          candidate.id != null &&
          candidate.id !== targetId &&
          !(candidate.overplay ?? false) &&
          this.isBoardActive(candidate.id),
        );

    if (!wasActive) {
      this.masterVolumesByBoard.set(targetId, 0);

      // Sequence mode always (re)starts from the first window.
      if (this.sequentialWindowsByBoard.get(targetId)) {
        const windows = this.boardWindows(board);
        if (windows.length >= 2) {
          this.setSequenceWindow(targetId, windows[0]);
        }
      }
    }

    const windowId = this.selectedWindowByBoard.get(targetId) ?? undefined;
    const playRequest: PlayRequest = windowId != null ? { windowId } : {};

    // YouTube IFrame backend owns playback status client-side: skip the backend
    // stream/session call and drive the crossfade locally.
    if (USE_YT_IFRAME_PLAYER) {
      this.boardStatuses.set(targetId, 'PLAYING');
      this.streamUrlsByBoard.delete(targetId);
      this.syncPlayingState();
      this.applyPlayCrossfade(targetId, wasActive, boardsToStop);
      return;
    }

    this.playbackApi.playBoard({ boardId: targetId, playRequest })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: state => {
          this.applyPlaybackState(targetId, state);
          this.applyPlayCrossfade(targetId, wasActive, boardsToStop);
        },
        error: (err: unknown) => {
          console.error(err);
          this.rollbackPlayCrossfade(targetId, wasActive, boardsToStop);
          this.toast.error('Starting playback failed.');
        },
      });
  }

  /**
   * Master-volume crossfade orchestration shared by both playback backends:
   * ramp the started board up and any displaced boards down, then release them
   * after the fade.
   */
  private applyPlayCrossfade(
    targetId: number,
    wasActive: boolean,
    boardsToStop: Board[],
  ): void {
    this.clearCrossfadeCleanupTimer();

    if (wasActive && boardsToStop.length === 0) {
      return;
    }

    // Symmetric crossfade (preset-style): a single duration derived from the
    // incoming board's fade-in and the longest displaced fade-out, used for the
    // ramp-up and all ramp-downs.
    const incomingBoard = this.findBoard(targetId);
    const incomingFadeInMs = incomingBoard ? this.boardFadeInMs(incomingBoard) : 0;
    const maxOutgoingFadeOutMs = boardsToStop.reduce(
      (max, item) => Math.max(max, this.boardFadeOutMs(item)),
      0,
    );
    const rampMs = deriveCrossfadeMs(
      maxOutgoingFadeOutMs,
      incomingFadeInMs,
      BoardsPageComponent.DEFAULT_CROSSFADE_MS,
    );

    // Schedule audio-clock-driven master gain ramps in each affected
    // board-player. Setting the ramp before the target ensures the child reads
    // the correct duration when its masterVolume subscription fires.
    if (!wasActive) {
      this.masterFadeRampMsByBoard.set(targetId, rampMs);
      this.masterVolumesByBoard.set(targetId, 1);
    }

    for (const item of boardsToStop) {
      this.masterFadeRampMsByBoard.set(item.id!, rampMs);
      this.masterVolumesByBoard.set(item.id!, 0);
    }

    this.fadeStateVersion.update(n => n + 1);

    const stopAfterFade = boardsToStop.slice();
    this.crossfadeCleanupTimer = setTimeout(() => {
      this.crossfadeCleanupTimer = null;

      if (!wasActive) {
        this.masterVolumesByBoard.delete(targetId);
        this.masterFadeRampMsByBoard.delete(targetId);
      }

      for (const item of stopAfterFade) {
        this.masterVolumesByBoard.delete(item.id!);
        this.masterFadeRampMsByBoard.delete(item.id!);
        this.clearBoard(item.id!);
        this.stopBoardBackend(item.id!);
      }

      this.fadeStateVersion.update(n => n + 1);
    }, rampMs + 60);
  }

  private rollbackPlayCrossfade(
    targetId: number,
    wasActive: boolean,
    boardsToStop: Board[],
  ): void {
    if (!wasActive) {
      this.masterVolumesByBoard.delete(targetId);
      this.masterFadeRampMsByBoard.delete(targetId);
    }

    for (const item of boardsToStop) {
      this.masterVolumesByBoard.delete(item.id!);
      this.masterFadeRampMsByBoard.delete(item.id!);
      this.clearBoard(item.id!);
      this.stopBoardBackend(item.id!);
    }

    this.fadeStateVersion.update(n => n + 1);
  }

  /** Issues the backend stop call unless the YT backend owns status locally. */
  private stopBoardBackend(boardId: number): void {
    if (USE_YT_IFRAME_PLAYER) {
      return;
    }

    this.playbackApi.stopBoard({ boardId })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  stopBoardTrack(board: Board): void {
    if (board.id == null) return;

    const boardId = board.id;

    // YT backend manages status client-side — no backend stop call.
    if (USE_YT_IFRAME_PLAYER) {
      this.clearBoard(boardId);
      return;
    }

    this.playbackApi.stopBoard({ boardId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: state => {
          this.applyPlaybackState(boardId, state);
          this.clearBoard(boardId);
        },
        error: () => {
          this.clearBoard(boardId);
        },
      });
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
    }
  }

  onAudioEnded(board: Board): void {
    if (board.id == null) return;

    if (board.playlistMode) {
      // If nearEnd already kicked off the advance/crossfade, advancePlaylist
      // dedupes via its in-flight guard; otherwise this advances at the seam.
      this.advancePlaylist(board, true, true);
    } else {
      this.clearBoard(board.id);
    }
  }

  onAudioError(board: Board): void {
    if (board.id == null) return;

    console.error('Audio stream failed for board', board.id);
    this.boardStatuses.set(board.id, 'ERROR');
    this.streamUrlsByBoard.delete(board.id);
    this.syncPlayingState();
    this.toast.error('Audio stream failed.');
  }

  getBoardStatus(board: Board): PlayerStatus {
    return board.id != null
      ? (this.boardStatuses.get(board.id) ?? 'STOPPED')
      : 'STOPPED';
  }

  getStreamUrl(board: Board): string | null {
    return board.id != null
      ? (this.streamUrlsByBoard.get(board.id) ?? null)
      : null;
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

  /**
   * Fade lengths (ms) currently in effect for a board: the selected window's
   * fades, or the track's own ("whole track") fades when no window is selected.
   */
  private boardFadeInMs(board: Board): number {
    return this.selectedWindowFor(board)?.fadeInDurationMs
      ?? board.selectedTrack?.fadeInDurationMs
      ?? 0;
  }

  private boardFadeOutMs(board: Board): number {
    return this.selectedWindowFor(board)?.fadeOutDurationMs
      ?? board.selectedTrack?.fadeOutDurationMs
      ?? 0;
  }

  private selectedWindowFor(board: Board): TrackWindow | null {
    if (board.id == null) return null;
    const windowId = this.selectedWindowByBoard.get(board.id) ?? null;
    if (windowId == null) return null;
    return this.boardWindows(board).find(w => w.id === windowId) ?? null;
  }

  private findBoard(id: number): Board | null {
    return this.boards().find(b => b.id === id) ?? null;
  }

  private setSequenceWindow(boardId: number, window: TrackWindow): void {
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

    this.setSequenceWindow(boardId, windows[nextIdx]);

    // The YouTube deck crossfades client-side from the window-input change. The
    // backend-stream player needs an explicit restart at the new window.
    if (!USE_YT_IFRAME_PLAYER && this.isBoardActive(boardId)) {
      const fresh = this.boards().find(b => b.id === boardId);
      if (fresh) {
        this.playBoardTrack(fresh);
      }
    }
  }

  getGroupsForBoard(board: Board): Group[] {
    const selected = board.selectedGroup;
    const base = this.groups();

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

  getSelectedWindowId(board: Board): number | null {
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

                  this.toast.error('Updating volume failed.');
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
          this.toast.error(errorMessage);
        },
      });
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
      ...overrides,
    };
  }

  private applyPlaybackState(boardId: number, state: PlaybackState | null): void {
    this.boardStatuses.set(boardId, state?.status ?? 'STOPPED');

    const resolvedUrl = this.resolveStreamUrl(state?.streamUrl);
    if (resolvedUrl) {
      this.streamUrlsByBoard.set(boardId, resolvedUrl);
    } else {
      this.streamUrlsByBoard.delete(boardId);
    }

    this.syncPlayingState();
  }

  private clearBoard(boardId: number): void {
    this.boardStatuses.set(boardId, 'STOPPED');
    this.streamUrlsByBoard.delete(boardId);
    this.syncPlayingState();
  }

  private isBoardActive(boardId: number): boolean {
    const status = this.boardStatuses.get(boardId);
    return status === 'PLAYING' || status === 'PAUSED';
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

  private prepareBoards(boards: Board[], resetPersistedVolumes = false): void {
    if (resetPersistedVolumes) {
      this.persistedVolumesByBoard.clear();
    }

    for (const board of boards) {
      this.ensureBoardStatus(board);
      this.syncPersistedVolume(board);
      this.syncSelectedWindow(board);
      this.syncSequenceMode(board);
    }
  }

  private ensureBoardStatus(board: Board): void {
    if (board.id != null && !this.boardStatuses.has(board.id)) {
      this.boardStatuses.set(board.id, 'STOPPED');
    }
  }

  private updateBoardVolume(boardId: number, volumePercent: number): number {
    const clamped = clampPct(volumePercent);

    this.boards.update(current =>
      current.map(item =>
        item.id === boardId ? { ...item, volume: clamped } : item,
      ),
    );

    return clamped;
  }

  private removeBoardLocalState(boardId: number): void {
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
    this.shortcuts.clearShortcut(boardId);
  }

  private clearCrossfadeCleanupTimer(): void {
    if (this.crossfadeCleanupTimer !== null) {
      clearTimeout(this.crossfadeCleanupTimer);
      this.crossfadeCleanupTimer = null;
    }
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

  private resolveStreamUrl(streamUrl?: string | null): string | null {
    if (!streamUrl) return null;
    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
      return streamUrl;
    }

    const base = environment.apiUrl.replace(/\/$/, '');
    const path = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
    return `${base}${path}`;
  }

  private mergeTracks(own: Track[], subscribed: Track[]): Track[] {
    const seen = new Set<number>();

    return [...own, ...subscribed].filter(track => {
      if (track.id == null || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  private regeneratePlaylistOrder(boardId: number, tracks: Track[], shuffle: boolean): void {
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
      b.id != null && this.isBoardActive(b.id),
    );
    this.boardPlayback.setPlaying(anyPlaying);
  }

  private refreshBackgroundData(): void {
    forkJoin({
      sessions: this.sessionsStore.load().pipe(catchError(() => of({ sessions: [] }))),
      ownTracks: this.tracksApi.getUserTracks().pipe(catchError(() => of([] as Track[]))),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(catchError(() => of([] as Track[]))),
      groups: this.groupsApi.getUserGroups().pipe(catchError(() => of([] as Group[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sessions, ownTracks, subscribedTracks, groups }) => {
        this.groups.set(groups ?? []);
        this.tracks.set(this.mergeTracks(ownTracks ?? [], subscribedTracks ?? []));

        const mergedBoards = this.flattenSessionBoards(sessions.sessions ?? []);

        this.prepareBoards(mergedBoards);

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
    this.clearCrossfadeCleanupTimer();

    for (const board of this.boards()) {
      if (board.id == null || !this.isBoardActive(board.id)) continue;
      const boardId = board.id;
      this.clearBoard(boardId);
      this.stopBoardBackend(boardId);
    }
  }

  private flattenSessionBoards(sessions: SessionResponse[]): Board[] {
    return sessions.flatMap(session => this.stampSessionId(session.boards ?? [], session.sessionId));
  }

  private stampSessionId(boards: Board[], sessionId: number | undefined): Board[] {
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