import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

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
  ],
  template: `
    <div class="app-page board-page">
      <h1 class="app-page__title">Boards</h1>

      <app-create-board-form
        [tracks]="tracks()"
        [submitting]="createBoardSubmitting()"
        (create)="createBoard($event)"
      />

      <ui-alert *ngIf="errorMessage()" variant="danger">
        {{ errorMessage() }}
      </ui-alert>

      <div *ngIf="loading()" class="app-muted boards-page__loading">
        Loading boards…
      </div>

      <ui-empty-state
        *ngIf="!loading() && boards().length === 0"
        title="No boards yet"
        message="Create your first board to get started."
      />

      <div *ngIf="!loading() && boards().length > 0" class="boards-list-wrap">
        <div class="boards-list">
          <app-board-card
            *ngFor="let board of boards(); trackBy: trackByBoardId"
            [board]="board"
            [availableGroups]="getGroupsForBoard(board)"
            [status]="getBoardStatus(board)"
            [streamUrl]="getStreamUrl(board)"
            [selectedWindowId]="getSelectedWindowId(board)"
            [masterVolume]="getMasterVolume(board)"
            [volumePercent]="getBoardVolumePercent(board)"
            [playlistMode]="board.playlistMode ?? false"
            [playlistOptions]="getPlaylistOptions(board)"
            (delete)="deleteBoard(board)"
            (groupChange)="onGroupSelectionChange(board, $event)"
            (trackChange)="onTrackSelectionChange(board, $event)"
            (windowChange)="onWindowSelectionChange(board, $event)"
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
          />
        </div>
      </div>
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

  readonly boards = signal<Board[]>([]);
  readonly tracks = signal<Track[]>([]);
  readonly groups = signal<Group[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly createBoardSubmitting = signal(false);

  private readonly streamUrlsByBoard = new Map<number, string>();
  private readonly boardStatuses = new Map<number, PlayerStatus>();
  private readonly selectedWindowByBoard = new Map<number, number | null>();
  private readonly masterVolumesByBoard = new Map<number, number>();
  private readonly playlistIndexByBoard = new Map<number, number>();
  private readonly playlistOrderByBoard = new Map<number, number[]>();
  private readonly persistedVolumesByBoard = new Map<number, number>();

  private static readonly CROSSFADE_MS = 800;
  private crossfadeRafId: number | null = null;

  private readonly volumeCommit$ = new Subject<VolumeCommit>();

  ngOnInit(): void {
    this.loadData();
    this.setupVolumeDebounce();
  }

  ngOnDestroy(): void {
    if (this.crossfadeRafId !== null) {
      cancelAnimationFrame(this.crossfadeRafId);
      this.crossfadeRafId = null;
    }
    this.volumeCommit$.complete();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      boards: this.boardsApi.getUserBoards().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading boards failed.');
          return of([] as Board[]);
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
        next: ({ boards, ownTracks, subscribedTracks, groups }) => {
          this.groups.set(groups ?? []);
          this.tracks.set(this.mergeTracks(ownTracks ?? [], subscribedTracks ?? []));

          const mergedBoards = boards ?? [];
          this.persistedVolumesByBoard.clear();

          for (const board of mergedBoards) {
            if (board.id != null && !this.boardStatuses.has(board.id)) {
              this.boardStatuses.set(board.id, 'STOPPED');
            }
            this.syncPersistedVolume(board);
          }

          this.boards.set(mergedBoards);
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError('Loading data failed.');
        },
      });
  }

  createBoard(event: CreateBoardEvent): void {
    this.createBoardSubmitting.set(true);

    const body: BoardCreateRequest = {
      name: event.name || undefined,
      selectedTrackId: event.selectedTrackId ?? undefined,
    };

    this.boardsApi.createUserBoard({ boardCreateRequest: body })
      .pipe(
        finalize(() => this.createBoardSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: created => {
          if (created.id != null) {
            this.boardStatuses.set(created.id, 'STOPPED');
          }
          this.syncPersistedVolume(created);
          this.boards.update(current => [...current, created]);
          this.toast.success('Board created.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Creating board failed.');
        },
      });
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
            this.boardStatuses.delete(boardId);
            this.streamUrlsByBoard.delete(boardId);
            this.selectedWindowByBoard.delete(boardId);
            this.masterVolumesByBoard.delete(boardId);
            this.playlistIndexByBoard.delete(boardId);
            this.playlistOrderByBoard.delete(boardId);
            this.persistedVolumesByBoard.delete(boardId);
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

    if (enabled) {
      this.selectedWindowByBoard.delete(boardId);
      this.regeneratePlaylistOrder(boardId, board.availableTracks ?? [], board.shuffle ?? false);
      this.clearBoard(boardId);
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

    const wasActive = this.isBoardActive(board.id);
    this.selectedWindowByBoard.delete(board.id);

    this.boardsApi.updateUserBoard({
      boardId: board.id,
      boardUpdateRequest: this.baseUpdate(board, {
        selectedGroupId: selectedId ?? undefined,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
          this.clearBoard(updated.id!);
          if (updated.playlistMode && updated.id != null) {
            this.shuffleBoard(updated.id, updated.availableTracks ?? [], updated.shuffle ?? false, wasActive);
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Updating group failed.');
        },
      });
  }

  private shuffleBoard(boardId: number, tracks: Track[], shuffle: boolean, autoPlay: boolean): void {
    this.regeneratePlaylistOrder(boardId, tracks, shuffle);
    const board = this.boards().find(b => b.id === boardId);
    if (board) {
      this.advancePlaylist(board, autoPlay);
    }
  }

  onTrackSelectionChange(board: Board, selectedId: number | null): void {
    if (board.id == null) return;

    const boardId = board.id;
    const wasActive = this.isBoardActive(boardId);
    this.selectedWindowByBoard.delete(boardId);

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

          if (wasActive && selectedId != null) {
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

    this.boards.update(current =>
      current.map(item =>
        item.id === board.id ? { ...item, volume: clampPct(volumePercent) } : item,
      ),
    );
  }

  onBoardVolumeCommit(board: Board, volumePercent: number): void {
    if (board.id == null) return;

    const clamped = clampPct(volumePercent);

    this.boards.update(current =>
      current.map(item =>
        item.id === board.id ? { ...item, volume: clamped } : item,
      ),
    );

    this.volumeCommit$.next({
      boardId: board.id,
      volumePercent: clamped,
    });
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

          if (this.crossfadeRafId !== null) {
            cancelAnimationFrame(this.crossfadeRafId);
            this.crossfadeRafId = null;
          }

          if (wasActive && boardsToStop.length === 0) {
            return;
          }

          const startTime = performance.now();
          const fromVolumes = new Map<number, number>(
            boardsToStop.map(item => [item.id!, this.masterVolumesByBoard.get(item.id!) ?? 1]),
          );

          const ramp = (now: number): void => {
            const t = Math.min(1, (now - startTime) / BoardsPageComponent.CROSSFADE_MS);

            if (!wasActive) {
              this.masterVolumesByBoard.set(targetId, Math.sin((t * Math.PI) / 2));
            }

            for (const item of boardsToStop) {
              this.masterVolumesByBoard.set(
                item.id!,
                (fromVolumes.get(item.id!) ?? 1) * Math.cos((t * Math.PI) / 2),
              );
            }

            if (t < 1) {
              this.crossfadeRafId = requestAnimationFrame(ramp);
              return;
            }

            this.crossfadeRafId = null;

            if (!wasActive) {
              this.masterVolumesByBoard.delete(targetId);
            }

            for (const item of boardsToStop) {
              this.masterVolumesByBoard.delete(item.id!);
              this.clearBoard(item.id!);
              this.playbackApi.stopBoard({ boardId: item.id! })
                .pipe(
                  catchError(() => of(null)),
                  takeUntilDestroyed(this.destroyRef),
                )
                .subscribe();
            }
          };

          this.crossfadeRafId = requestAnimationFrame(ramp);
        },
        error: (err: unknown) => {
          console.error(err);

          if (!wasActive) {
            this.masterVolumesByBoard.delete(targetId);
          }

          for (const item of boardsToStop) {
            this.masterVolumesByBoard.delete(item.id!);
            this.clearBoard(item.id!);
            this.playbackApi.stopBoard({ boardId: item.id! })
              .pipe(
                catchError(() => of(null)),
                takeUntilDestroyed(this.destroyRef),
              )
              .subscribe();
          }

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
    const volume01 = this.getBoardVolumePercent(board) / 100;
    const fade = board.id != null
      ? (this.masterVolumesByBoard.get(board.id) ?? 1)
      : 1;

    return Math.max(0, Math.min(volume01 * fade, 1));
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

    const boardId = board.id;
    const patchedBoard = { ...board, ...this.overridesToBoardPatch(overrides) };

    this.boards.update(current =>
      current.map(item => item.id === boardId ? patchedBoard : item),
    );

    this.boardsApi.updateUserBoard({
      boardId,
      boardUpdateRequest: this.baseUpdate(patchedBoard, overrides),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.upsertBoard(updated);
        },
        error: (err: unknown) => {
          console.error(err);
          this.boards.update(current =>
            current.map(item => item.id === boardId ? board : item),
          );
          this.toast.error(errorMessage);
        },
      });
  }

  private overridesToBoardPatch(overrides: Partial<BoardUpdateRequest>): Partial<Board> {
    const patch: Partial<Board> = {};

    if ('name' in overrides) patch.name = overrides.name;
    if ('repeat' in overrides) patch.repeat = overrides.repeat;
    if ('overplay' in overrides) patch.overplay = overrides.overplay;
    if ('playlistMode' in overrides) patch.playlistMode = overrides.playlistMode;
    if ('shuffle' in overrides) patch.shuffle = overrides.shuffle;
    if ('volume' in overrides) patch.volume = overrides.volume;

    return patch;
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
  }

  private clearBoard(boardId: number): void {
    this.boardStatuses.set(boardId, 'STOPPED');
    this.streamUrlsByBoard.delete(boardId);
  }

  private isBoardActive(boardId: number): boolean {
    const status = this.boardStatuses.get(boardId);
    return status === 'PLAYING' || status === 'PAUSED';
  }

  private upsertBoard(updated: Board): void {
    if (updated.id == null) return;

    this.boards.update(current =>
      current.map(item => item.id === updated.id ? updated : item),
    );

    this.syncPersistedVolume(updated);
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
}

function clampPct(value: number | null | undefined): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(Math.round(numeric), 100))
    : 100;
}