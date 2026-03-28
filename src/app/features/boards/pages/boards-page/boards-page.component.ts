import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';

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
import { BoardCardComponent } from '../../components/board-card/board-card.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';

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
      <h1 class="boards-page__title">Boards</h1>

      <app-create-board-form
        [tracks]="tracks"
        [submitting]="createBoardSubmitting"
        (create)="createBoard($event)"
      ></app-create-board-form>

      <ui-alert *ngIf="errorMessage" variant="danger">
        {{ errorMessage }}
      </ui-alert>

      <div *ngIf="loading" class="app-muted boards-page__loading">
        Loading boards...
      </div>

      <ui-empty-state
        *ngIf="!loading && boards.length === 0"
        title="No boards yet"
        message="Create your first board to get started."
      ></ui-empty-state>

      <div *ngIf="!loading && boards.length > 0" class="boards-list-wrap">
        <div class="boards-list">
          <app-board-card
            *ngFor="let board of boards; trackBy: trackByBoardId"
            [board]="board"
            [availableGroups]="getGroupsForBoard(board)"
            [status]="getBoardStatus(board)"
            [streamUrl]="getStreamUrl(board)"
            [selectedWindowId]="getSelectedWindowId(board)"
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
          ></app-board-card>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --boards-list-max-height: min(70dvh, 720px);
    }

    .boards-page__title {
      margin: 0 0 1.5rem;
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
    }

    .boards-page__loading {
      margin-top: 1rem;
      color: #94a3b8;
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
export class BoardsPageComponent implements OnInit {
  private boardsApi = inject(MusicBoardsService);
  private groupsApi = inject(MusicGroupsService);
  private tracksApi = inject(MusicTracksService);
  private playbackApi = inject(PlaybackService);

  boards: Board[] = [];
  tracks: Track[] = [];
  groups: Group[] = [];
  loading = false;
  errorMessage = '';
  createBoardSubmitting = false;

  private streamUrlsByBoard = new Map<number, string>();
  private boardStatuses = new Map<number, PlayerStatus>();
  selectedWindowByBoard = new Map<number, number | null>();

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      boards: this.boardsApi.getUserBoards().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.addError('Loading boards failed.');
          return of([] as Board[]);
        }),
      ),
      ownTracks: this.tracksApi.getUserTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.addError('Loading tracks failed.');
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          return of([] as Track[]);
        }),
      ),
      groups: this.groupsApi.getUserGroups().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.addError('Loading groups failed.');
          return of([] as Group[]);
        }),
      ),
    }).subscribe({
      next: ({ boards, ownTracks, subscribedTracks, groups }) => {
        this.groups = groups ?? [];
        this.tracks = this.mergeTracks(ownTracks ?? [], subscribedTracks ?? []);
        this.boards = boards ?? [];

        for (const board of this.boards) {
          if (board.id != null && !this.boardStatuses.has(board.id)) {
            this.boardStatuses.set(board.id, 'STOPPED');
          }
        }

        this.loading = false;
      },
      error: (err: unknown) => {
        console.error(err);
        this.addError('Loading data failed.');
        this.loading = false;
      },
    });
  }

  createBoard(event: CreateBoardEvent): void {
    this.createBoardSubmitting = true;
    const body: BoardCreateRequest = {
      name: event.name || undefined,
      selectedTrackId: event.selectedTrackId ?? undefined,
    };

    this.boardsApi.createUserBoard({ boardCreateRequest: body }).subscribe({
      next: (created: Board) => {
        this.boards = [...this.boards, created];
        if (created.id != null) this.boardStatuses.set(created.id, 'STOPPED');
      },
      error: (err: unknown) => {
        console.error(err);
        alert('Creating board failed.');
      },
      complete: () => {
        this.createBoardSubmitting = false;
      },
    });
  }

  deleteBoard(board: Board): void {
    if (board.id == null) return;
    if (!confirm(`Delete board "${board.name || board.id}"?`)) return;

    const boardId = board.id;
    const doDelete = () => {
      this.boardsApi.deleteUserBoard({ boardId }).subscribe({
        next: () => {
          this.boards = this.boards.filter(b => b.id !== boardId);
          this.boardStatuses.delete(boardId);
          this.streamUrlsByBoard.delete(boardId);
          this.selectedWindowByBoard.delete(boardId);
        },
        error: (err: unknown) => {
          console.error(err);
          alert('Deleting board failed.');
        },
      });
    };

    if (this.isBoardActive(boardId)) {
      this.playbackApi.stopBoard({ boardId }).subscribe({
        next: () => {
          this.clearBoard(boardId);
          doDelete();
        },
        error: () => {
          this.clearBoard(boardId);
          doDelete();
        },
      });
    } else {
      doDelete();
    }
  }

  toggleRepeat(board: Board): void {
    if (board.id == null) return;
    const boardId = board.id;
    const newRepeat = !(board.repeat ?? false);
    board.repeat = newRepeat;

    const body: BoardUpdateRequest = {
      name: board.name ?? undefined,
      selectedTrackId: board.selectedTrack?.id ?? undefined,
      selectedGroupId: board.selectedGroup?.id ?? undefined,
      volume: board.volume ?? undefined,
      repeat: newRepeat,
      overplay: board.overplay ?? undefined,
    };

    this.boardsApi.updateUserBoard({ boardId, boardUpdateRequest: body }).subscribe({
      next: (updated: Board) => {
        this.boards = this.boards.map(b => b.id === boardId ? updated : b);
      },
      error: (err: unknown) => {
        console.error(err);
        board.repeat = !newRepeat;
        alert('Updating repeat failed.');
      },
    });
  }

  toggleOverplay(board: Board): void {
    if (board.id == null) return;
    const boardId = board.id;
    const newOverplay = !(board.overplay ?? false);
    board.overplay = newOverplay;

    const body: BoardUpdateRequest = {
      name: board.name ?? undefined,
      selectedTrackId: board.selectedTrack?.id ?? undefined,
      selectedGroupId: board.selectedGroup?.id ?? undefined,
      volume: board.volume ?? undefined,
      repeat: board.repeat ?? undefined,
      overplay: newOverplay,
    };

    this.boardsApi.updateUserBoard({ boardId, boardUpdateRequest: body }).subscribe({
      next: (updated: Board) => {
        this.boards = this.boards.map(b => b.id === boardId ? updated : b);
      },
      error: (err: unknown) => {
        console.error(err);
        board.overplay = !newOverplay;
        alert('Updating overplay failed.');
      },
    });
  }

  onGroupSelectionChange(board: Board, selectedId: number | null): void {
    if (board.id == null) return;
    const boardId = board.id;
    const previousGroup = board.selectedGroup;
    board.selectedGroup = this.getGroupsForBoard(board).find(g => g.id === selectedId) ?? undefined;
    this.selectedWindowByBoard.delete(boardId);

    const body: BoardUpdateRequest = {
      name: board.name ?? undefined,
      selectedTrackId: board.selectedTrack?.id ?? undefined,
      selectedGroupId: selectedId ?? undefined,
      volume: board.volume ?? undefined,
      repeat: board.repeat ?? undefined,
      overplay: board.overplay ?? undefined,
    };

    this.boardsApi.updateUserBoard({ boardId, boardUpdateRequest: body }).subscribe({
      next: (updated: Board) => {
        this.boards = this.boards.map(b => b.id === boardId ? updated : b);
        this.clearBoard(boardId);
      },
      error: (err: unknown) => {
        console.error(err);
        board.selectedGroup = previousGroup;
        alert('Updating group failed.');
      },
    });
  }

  onTrackSelectionChange(board: Board, selectedId: number | null): void {
    if (board.id == null) return;
    const boardId = board.id;
    this.selectedWindowByBoard.delete(boardId);
    const previousTrack = board.selectedTrack;
    const selectedTrack = (board.availableTracks ?? []).find(t => t.id === selectedId) ?? undefined;

    const doUpdate = () => {
      board.selectedTrack = selectedTrack;
      const body: BoardUpdateRequest = {
        name: board.name ?? undefined,
        selectedTrackId: selectedId ?? undefined,
        selectedGroupId: board.selectedGroup?.id ?? undefined,
        volume: board.volume ?? undefined,
        repeat: board.repeat ?? undefined,
        overplay: board.overplay ?? undefined,
      };

      this.boardsApi.updateUserBoard({ boardId, boardUpdateRequest: body }).subscribe({
        next: (updated: Board) => {
          this.boards = this.boards.map(b => b.id === boardId ? updated : b);
          this.clearBoard(boardId);
        },
        error: (err: unknown) => {
          console.error(err);
          board.selectedTrack = previousTrack;
          alert('Updating board failed.');
        },
      });
    };

    if (this.isBoardActive(boardId)) {
      this.playbackApi.stopBoard({ boardId }).subscribe({
        next: () => {
          this.clearBoard(boardId);
          doUpdate();
        },
        error: () => {
          this.clearBoard(boardId);
          doUpdate();
        },
      });
    } else {
      doUpdate();
    }
  }

  playBoardTrack(board: Board): void {
    if (board.id == null || !board.selectedTrack) return;

    const targetId = board.id;
    const targetOverplay = board.overplay ?? false;

    const boardsToStop = targetOverplay
      ? []
      : this.boards.filter(b =>
          b.id != null && b.id !== targetId && !(b.overplay ?? false) && this.isBoardActive(b.id),
        );

    const stopCalls = boardsToStop.map(b => {
      const id = b.id!;
      return this.playbackApi.stopBoard({ boardId: id }).pipe(
        tap(() => this.clearBoard(id)),
        catchError(() => {
          this.clearBoard(id);
          return of(null);
        }),
      );
    });

    const stopAll$: Observable<unknown> = stopCalls.length > 0 ? forkJoin(stopCalls) : of(null);

    stopAll$.pipe(
      switchMap(() => {
        const windowId = this.selectedWindowByBoard.get(targetId) ?? undefined;
        const playRequest: PlayRequest = windowId != null ? { windowId } : {};
        return this.playbackApi.playBoard({ boardId: targetId, playRequest });
      }),
    ).subscribe({
      next: (state: PlaybackState) => {
        this.applyPlaybackState(targetId, state);
      },
      error: (err: unknown) => {
        console.error(err);
        alert('Starting playback failed.');
      },
    });
  }

  stopBoardTrack(board: Board): void {
    if (board.id == null) return;
    const boardId = board.id;

    this.playbackApi.stopBoard({ boardId }).subscribe({
      next: (state: PlaybackState) => {
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
    this.clearBoard(board.id);
  }

  onAudioError(board: Board): void {
    if (board.id == null) return;
    console.error('Audio stream failed for board', board.id);
    this.boardStatuses.set(board.id, 'ERROR');
    this.streamUrlsByBoard.delete(board.id);
    alert('Audio stream failed.');
  }

  onWindowSelectionChange(board: Board, windowId: number | null): void {
    if (board.id == null) return;
    this.selectedWindowByBoard.set(board.id, windowId);
    if (this.isBoardActive(board.id)) {
      this.playBoardTrack(board);
    }
  }

  trackByBoardId(_index: number, board: Board): number {
    return board.id ?? 0;
  }

  getBoardStatus(board: Board): PlayerStatus {
    if (board.id == null) return 'STOPPED';
    return this.boardStatuses.get(board.id) ?? 'STOPPED';
  }

  getStreamUrl(board: Board): string | null {
    if (board.id == null) return null;
    return this.streamUrlsByBoard.get(board.id) ?? null;
  }

  getGroupsForBoard(board: Board): Group[] {
    const selectedGroup = board.selectedGroup;
    const baseGroups = this.groups ?? [];
    if (selectedGroup?.id == null) return baseGroups;
    return baseGroups.some(g => g.id === selectedGroup.id)
      ? baseGroups
      : [selectedGroup, ...baseGroups];
  }

  getSelectedWindowId(board: Board): number | null {
    if (board.id == null) return null;
    return this.selectedWindowByBoard.get(board.id) ?? null;
  }

  private applyPlaybackState(boardId: number, state: PlaybackState | null): void {
    this.boardStatuses.set(boardId, state?.status ?? 'STOPPED');
    const url = this.resolveStreamUrl(state?.streamUrl);
    if (url) {
      this.streamUrlsByBoard.set(boardId, url);
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

  private resolveStreamUrl(streamUrl?: string | null): string | null {
    if (!streamUrl) return null;
    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) return streamUrl;
    const base = environment.apiUrl.replace(/\/$/, '');
    const path = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
    return `${base}${path}`;
  }

  private mergeTracks(ownTracks: Track[], subscribedTracks: Track[]): Track[] {
    const seen = new Set<number>();
    const merged: Track[] = [];

    for (const t of [...ownTracks, ...subscribedTracks]) {
      if (t.id != null && !seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }

    return merged;
  }

  private addError(message: string): void {
    if (!this.errorMessage) {
      this.errorMessage = message;
      return;
    }
    if (!this.errorMessage.includes(message)) {
      this.errorMessage = `${this.errorMessage} ${message}`;
    }
  }
}