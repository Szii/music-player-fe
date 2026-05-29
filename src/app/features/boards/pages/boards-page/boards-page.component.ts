import { Component, DestroyRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
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
} from '../../../../api/generated';

import {
  CreateBoardFormComponent,
  CreateBoardEvent,
} from '../../components/create-board-form/create-board-form.component';
import {
  BoardCardComponent,
  PlaylistOptions,
} from '../../components/board-card/board-card.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';
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
    CommonModule,
    CreateBoardFormComponent,
    BoardCardComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    SessionsDropdownComponent,
  ],
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
  template: `
    <div class="app-page board-page">
      <header class="boards-page__header">
        <h1 class="app-page__title">Boards</h1>
        <app-sessions-dropdown
          #sessionsDropdown
          class="boards-page__sessions"
        />
      </header>

      <ui-alert *ngIf="errorMessage()" variant="danger">
        {{ errorMessage() }}
      </ui-alert>

      <div *ngIf="loading()" class="app-muted boards-page__loading">
        Loading boards…
      </div>

      <ng-container *ngIf="!loading()">
        <ng-container *ngIf="!hasSessions(); else withSession">
          <div class="boards-page__no-session">
            <button
              type="button"
              class="boards-page__create-cta"
              aria-label="Create your first session"
              (click)="openCreateSession($event)"
            >
              <span class="boards-page__create-plus" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none"
                  stroke="currentColor" stroke-width="2.4"
                  stroke-linecap="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              <span class="boards-page__create-cta-label">Create your first session</span>
            </button>
          </div>
        </ng-container>

        <ng-template #withSession>
          <app-create-board-form
            class="boards-page__create-board-form"
            [tracks]="tracks()"
            [submitting]="createBoardSubmitting()"
            (create)="createBoard($event)"
          />

          <ui-empty-state
            *ngIf="sessionBoards().length === 0"
            title="No boards yet"
            message="Create your first board in this session."
          />

          <div *ngIf="sessionBoards().length > 0" class="boards-list-wrap">
            <div class="boards-list">
              <app-board-card
                *ngFor="let board of sessionBoards(); trackBy: trackByBoardId"
                [board]="board"
                [availableGroups]="getGroupsForBoard(board)"
                [status]="getBoardStatus(board)"
                [streamUrl]="getStreamUrl(board)"
                [selectedWindowId]="getSelectedWindowId(board)"
                [masterVolume]="getMasterVolume(board)"
                [masterFadeRampMs]="getMasterFadeRampMs(board)"
                [volumePercent]="getBoardVolumePercent(board)"
                [playlistMode]="board.playlistMode ?? false"
                [playlistOptions]="getPlaylistOptions(board)"
                (delete)="deleteBoard(board)"
                (groupChange)="onGroupSelectionChange(board, $event)"
                (trackChange)="onTrackSelectionChange(board, $event)"
                (windowChange)="onWindowSelectionChange(board, $event)"
                (trackWithWindowChange)="onTrackWithWindowChange(board, $event)"
                (toggleRepeat)="toggleRepeat(board)"
                (toggleOverplay)="toggleOverplay(board)"
                (play)="playBoardTrack(board)"
                (stop)="stopBoardTrack(board)"
                (ended)="onAudioEnded(board)"
                (audioError)="onAudioError(board)"
                (playlistModeChange)="onPlaylistModeChange(board, $event)"
                (playlistOptionsChange)="onPlaylistOptionsChange(board, $event)"
                (volumePreviewChange)="onBoardVolumePreview(board, $event)"
                (volumeCommit)="onBoardVolumeCommit(board, $event)"
                (rename)="onBoardRename(board, $event)"
                (navigateBoardUp)="focusBoardByOffset(board, -1)"
                (navigateBoardDown)="focusBoardByOffset(board, 1)"
                (requestPlay)="onBoardRequestPlay(board)"
              />
            </div>
          </div>
        </ng-template>
      </ng-container>
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

    .boards-page__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
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
    ui-empty-state {
      position: relative;
    }

    .boards-page__no-session {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4rem 1rem;
    }

    .boards-page__create-cta {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 2.2rem 2.4rem 2.6rem;
      min-width: 260px;
      background: var(--app-parchment);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      color: var(--app-heading);
      cursor: pointer;
      box-shadow: var(--app-shadow);
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition:
        border-color 0.15s ease,
        transform 0.12s ease,
        box-shadow 0.18s ease,
        background-color 0.15s ease;
    }

    .boards-page__create-cta:hover {
      border-color: var(--app-primary);
      transform: translateY(-1px);
      box-shadow:
        0 16px 38px rgba(15, 8, 3, 0.28),
        0 4px 14px rgba(15, 8, 3, 0.16);
    }

    .boards-page__create-cta:focus {
      outline: none;
    }

    .boards-page__create-board-form {
      display: block;
      margin-bottom: 1rem;
    }

    .boards-page__create-cta:focus:not(:focus-visible) {
      outline: none;
      box-shadow: var(--app-shadow);
    }

    .boards-page__create-cta:focus-visible {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring), var(--app-shadow);
    }

    .boards-page__create-cta:active {
      transform: translateY(1px) scale(0.99);
      box-shadow:
        inset 0 2px 6px rgba(15, 8, 3, 0.18),
        0 4px 12px rgba(15, 8, 3, 0.16);
    }

    .boards-page__create-plus {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(180deg, #6a1e10 0%, #58180d 100%);
      color: #fff8ee;
      font-size: 3rem;
      line-height: 1;
      font-weight: 400;
      border: 1px solid #3d1008;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 4px 12px rgba(30, 8, 4, 0.28);
    }

    .boards-page__create-cta-label {
      position: relative;
      padding-bottom: 0.7rem;
      font-family: var(--app-font-heading);
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--app-heading);
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.12);
    }

    .boards-page__create-cta-label::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 100%;
      height: 2px;
      background: var(--app-divider-decor);
      opacity: 0.85;
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
  private readonly masterVolumesByBoard = new Map<number, number>();
  private readonly masterFadeRampMsByBoard = new Map<number, number>();
  private readonly playlistIndexByBoard = new Map<number, number>();
  private readonly playlistOrderByBoard = new Map<number, number[]>();
  private readonly persistedVolumesByBoard = new Map<number, number>();
  private readonly pendingTrackUpdateBoardIds = new Set<number>();
  private readonly playPendingAfterUpdateBoardIds = new Set<number>();

  private static readonly CROSSFADE_MS = 2000;

  private readonly fadeStateVersion = signal(0);
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

  toggleRepeat(board: Board): void {
    this.updateBoard(
      board,
      { repeat: !(board.repeat ?? false) },
      'Updating repeat failed.',
    );
  }

  toggleOverplay(board: Board): void {
    this.updateBoard(
      board,
      { overplay: !(board.overplay ?? false) },
      'Updating overplay failed.',
    );
  }

  onPlaylistModeChange(board: Board, enabled: boolean): void {
    if (board.id == null) return;

    const boardId = board.id;

    this.clearBoard(boardId);
    this.selectedWindowByBoard.delete(boardId);

    if (enabled) {
      this.regeneratePlaylistOrder(boardId, board.availableTracks ?? [], board.shuffle ?? false);
      this.updateBoard(board, { playlistMode: enabled, selectedTrackId: undefined }, 'Updating playlist mode failed.');
    } else {
      this.playlistIndexByBoard.delete(boardId);
      this.playlistOrderByBoard.delete(boardId);
      this.updateBoard(board, { playlistMode: enabled }, 'Updating playlist mode failed.');
    }
  }

  onBoardRename(board: Board, name: string): void {
    this.updateBoard(board, { name }, 'Renaming board failed.');
  }

  onPlaylistOptionsChange(board: Board, options: PlaylistOptions): void {
    this.updateBoard(board, { shuffle: options.random }, 'Updating shuffle failed.');
  }

  onGroupSelectionChange(board: Board, selectedId: number | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    const playingTrack = board.selectedTrack;

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedGroupId: selectedId ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (wasActive && playingTrack) {
            // Keep audio playing on the previous track; backend reset selectedTrack
            // to the new group's default, but we restore it so the player doesn't
            // tear down. The user picks a track from the new group to crossfade.
            let normalized: Board = updated;
            this.boards.update(current => {
              const existing = current.find(b => b.id === boardId);
              normalized = this.withSessionId({ ...updated, selectedTrack: playingTrack }, existing);
              return this.replaceBoard(current, normalized);
            });
            this.syncPersistedVolume(normalized);
          } else {
            this.selectedWindowByBoard.delete(boardId);
            this.upsertBoard(updated);
            this.clearBoard(boardId);
          }

          if (updated.playlistMode && updated.id != null) {
            this.regeneratePlaylistOrder(updated.id, updated.availableTracks ?? [], updated.shuffle ?? false);
          }
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
    this.pendingTrackUpdateBoardIds.add(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: trackId ?? undefined,
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
    this.selectedWindowByBoard.delete(boardId);
    this.pendingTrackUpdateBoardIds.add(boardId);

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: selectedId ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
          this.pendingTrackUpdateBoardIds.delete(boardId);
          const wantsPlay = this.playPendingAfterUpdateBoardIds.delete(boardId);

          if (selectedId != null && (wasActive || wantsPlay)) {
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

    this.selectedWindowByBoard.set(board.id, windowId);

    if (this.isBoardActive(board.id)) {
      this.playBoardTrack(board);
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
    }

    const windowId = this.selectedWindowByBoard.get(targetId) ?? undefined;
    const playRequest: PlayRequest = windowId != null ? { windowId } : {};

    this.playbackApi.playBoard({ boardId: targetId, playRequest })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: state => {
          this.applyPlaybackState(targetId, state);

          this.clearCrossfadeCleanupTimer();

          if (wasActive && boardsToStop.length === 0) {
            return;
          }

          const rampMs = BoardsPageComponent.CROSSFADE_MS;

          // Schedule audio-clock-driven master gain ramps in each affected
          // board-player. Setting rampMs before the target ensures the child
          // reads the correct duration when its masterVolume subscription
          // fires.
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
              this.playbackApi.stopBoard({ boardId: item.id! })
                .pipe(
                  catchError(() => of(null)),
                  takeUntilDestroyed(this.destroyRef),
                )
                .subscribe();
            }

            this.fadeStateVersion.update(n => n + 1);
          }, rampMs + 60);
        },
        error: (err: unknown) => {
          console.error(err);

          if (!wasActive) {
            this.masterVolumesByBoard.delete(targetId);
            this.masterFadeRampMsByBoard.delete(targetId);
          }

          for (const item of boardsToStop) {
            this.masterVolumesByBoard.delete(item.id!);
            this.masterFadeRampMsByBoard.delete(item.id!);
            this.clearBoard(item.id!);
            this.playbackApi.stopBoard({ boardId: item.id! })
              .pipe(
                catchError(() => of(null)),
                takeUntilDestroyed(this.destroyRef),
              )
              .subscribe();
          }

          this.fadeStateVersion.update(n => n + 1);
          this.toast.error('Starting playback failed.');
        },
      });
  }

  stopBoardTrack(board: Board): void {
    if (board.id == null) return;

    const boardId = board.id;

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

  onAudioEnded(board: Board): void {
    if (board.id == null) return;

    if (board.playlistMode) {
      this.advancePlaylist(board);
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

  trackByBoardId(_index: number, board: Board): number {
    return board.id ?? 0;
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

  private advancePlaylist(board: Board, autoPlay = true): void {
    if (board.id == null) return;

    const boardId = board.id;
    const availableTracks = board.availableTracks ?? [];

    if (!availableTracks.length) {
      this.clearBoard(boardId);
      return;
    }

    if (!this.playlistOrderByBoard.has(boardId)) {
      this.regeneratePlaylistOrder(boardId, availableTracks, board.shuffle ?? false);
    }

    const order = this.playlistOrderByBoard.get(boardId)!;
    const nextStep = ((this.playlistIndexByBoard.get(boardId) ?? -1) + 1) % order.length;
    this.playlistIndexByBoard.set(boardId, nextStep);

    const nextTrackIndex = order[nextStep];
    const nextTrack = availableTracks[nextTrackIndex] ?? availableTracks[0];

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedTrackId: nextTrack.id ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.streamUrlsByBoard.delete(boardId);
          this.upsertBoard(updated);
          if (autoPlay) {
            const freshBoard = this.boards().find(item => item.id === boardId);
            if (freshBoard) {
              this.playBoardTrack(freshBoard);
            }
          }
        },
        error: err => {
          console.error('Playlist advance failed', err);
          this.clearBoard(boardId);
        },
      });
  }

  private updateBoard(
    board: Board,
    overrides: Partial<BoardUpdateRequest>,
    errorMessage: string,
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
        next: session => this.replaceBoardsFromSession(session),
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
      volume: board.volume ?? undefined,
      repeat: board.repeat ?? undefined,
      overplay: board.overplay ?? undefined,
      shuffle: board.shuffle ?? undefined,
      playlistMode: board.playlistMode ?? undefined,
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
      this.playbackApi.stopBoard({ boardId })
        .pipe(
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe();
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