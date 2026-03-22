import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

import { BoardPlayerComponent } from '../../components/board-player/board-player.component';

@Component({
  selector: 'app-boards-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BoardPlayerComponent],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <a routerLink="/" class="btn btn-outline-primary">Home</a>
        </div>
      </div>

      <h1 class="mb-4">Boards</h1>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="h5 mb-3">Create board</h2>

          <form [formGroup]="createBoardForm" (ngSubmit)="createBoard()">
            <div class="mb-3">
              <label class="form-label">Board name</label>
              <input class="form-control" formControlName="name" type="text" />
            </div>

            <div class="mb-3">
              <label class="form-label">Current track</label>
              <select class="form-select" formControlName="selectedTrackId">
                <option [ngValue]="null">-- no track selected --</option>
                <option *ngFor="let track of tracks" [ngValue]="track.id">
                  {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
                </option>
              </select>
            </div>

            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="createBoardSubmitting"
            >
              {{ createBoardSubmitting ? 'Creating...' : 'Create board' }}
            </button>
          </form>
        </div>
      </div>

      <div *ngIf="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <div *ngIf="loading">Loading boards...</div>

      <div *ngIf="!loading && boards.length === 0" class="alert alert-info">
        No boards yet.
      </div>

      <div *ngIf="!loading" class="row g-3">
        <div class="col-12" *ngFor="let board of boards; trackBy: trackByBoardId">
          <div class="card">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h2 class="h5 mb-1">{{ board.name || ('Board #' + board.id) }}</h2>
                  <div class="text-muted">Owner: {{ board.owner?.name || '-' }}</div>
                </div>

                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  (click)="deleteBoard(board)"
                >
                  Delete
                </button>
              </div>

              <div class="mb-3">
                <label class="form-label">Group</label>
                <select
                  class="form-select"
                  [value]="board.selectedGroup?.id ?? ''"
                  (change)="onGroupSelectionChange(board, $any($event.target).value)"
                >
                  <option value="">-- all tracks --</option>
                  <option *ngFor="let group of groups" [value]="group.id">
                    {{ group.listName || ('Group #' + group.id) }}
                  </option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">Current track</label>
                <select
                  class="form-select"
                  [value]="board.selectedTrack?.id ?? ''"
                  (change)="onTrackSelectionChange(board, $any($event.target).value)"
                >
                  <option value="">-- no track selected --</option>
                  <option *ngFor="let track of getTracksForBoard(board)" [value]="track.id">
                    {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
                  </option>
                </select>
              </div>

              <div *ngIf="board.selectedTrack as selectedTrack" class="mb-3">
                <strong>Current track:</strong>
                {{ selectedTrack.trackName || selectedTrack.trackOriginalName || ('Track #' + selectedTrack.id) }}
              </div>

              <div *ngIf="getWindowsForBoard(board).length > 0" class="mb-3">
                <label class="form-label">Track window</label>
                <select
                  class="form-select"
                  [value]="getSelectedWindowId(board) ?? ''"
                  (change)="onWindowSelectionChange(board, $any($event.target).value)"
                >
                  <option value="">-- whole track --</option>
                  <option *ngFor="let win of getWindowsForBoard(board)" [value]="win.id">
                    {{ win.name || ('Window #' + win.id) }}
                    ({{ formatTime(win.positionFrom ?? 0) }} – {{ formatTime(win.positionTo ?? 0) }})
                  </option>
                </select>
              </div>

              <div class="d-flex gap-3 mb-3">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    [id]="'repeat-' + board.id"
                    [checked]="board.repeat ?? false"
                    (change)="toggleRepeat(board)"
                  />
                  <label class="form-check-label" [for]="'repeat-' + board.id">
                    Loop
                  </label>
                </div>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    [id]="'overplay-' + board.id"
                    [checked]="board.overplay ?? false"
                    (change)="toggleOverplay(board)"
                  />
                  <label class="form-check-label" [for]="'overplay-' + board.id">
                    Overplay
                  </label>
                </div>
              </div>

              <app-board-player
                [title]="board.name || ('Board #' + board.id)"
                [hasTrack]="!!board.selectedTrack"
                [status]="getBoardStatus(board)"
                [streamUrl]="getStreamUrl(board)"
                [durationS]="board.selectedTrack?.duration ?? null"
                [repeat]="board.repeat ?? false"
                (playRequested)="playBoardTrack(board)"
                (stopRequested)="stopBoardTrack(board)"
                (ended)="onAudioEnded(board)"
                (audioError)="onAudioError(board)"
              ></app-board-player>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BoardsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
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
  private boardStatuses = new Map<number, string>();
  selectedWindowByBoard = new Map<number, number | null>();

  createBoardForm = this.fb.group({
    name: [''],
    selectedTrackId: [null as number | null],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    let boardsLoaded = false;
    let tracksLoaded = false;
    let groupsLoaded = false;
    const finishIfDone = () => {
      if (boardsLoaded && tracksLoaded && groupsLoaded) this.loading = false;
    };

    this.boardsApi.getUserBoards().subscribe({
      next: (boards: Board[]) => {
        this.boards = boards ?? [];
        for (const board of this.boards) {
          if (board.id != null && !this.boardStatuses.has(board.id)) {
            this.boardStatuses.set(board.id, 'STOPPED');
          }
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.errorMessage = 'Loading boards failed.';
        boardsLoaded = true;
        finishIfDone();
      },
      complete: () => { boardsLoaded = true; finishIfDone(); },
    });

    this.tracksApi.getUserTracks().subscribe({
      next: (tracks: Track[]) => { this.tracks = tracks ?? []; },
      error: (err: unknown) => {
        console.error(err);
        this.errorMessage = this.errorMessage || 'Loading owned tracks failed.';
        tracksLoaded = true;
        finishIfDone();
      },
      complete: () => { tracksLoaded = true; finishIfDone(); },
    });

    this.groupsApi.getUserGroups().subscribe({
      next: (groups: Group[]) => { this.groups = groups ?? []; },
      error: (err: unknown) => {
        console.error(err);
        this.errorMessage = this.errorMessage || 'Loading groups failed.';
        groupsLoaded = true;
        finishIfDone();
      },
      complete: () => { groupsLoaded = true; finishIfDone(); },
    });
  }

  createBoard(): void {
    this.createBoardSubmitting = true;
    const { name, selectedTrackId } = this.createBoardForm.getRawValue();
    const body: BoardCreateRequest = {
      name: name || undefined,
      selectedTrackId: selectedTrackId ?? undefined,
    };

    this.boardsApi.createUserBoard({ boardCreateRequest: body }).subscribe({
      next: (created: Board) => {
        this.createBoardForm.reset({ name: '', selectedTrackId: null });
        this.boards = [...this.boards, created];
        if (created.id != null) this.boardStatuses.set(created.id, 'STOPPED');
      },
      error: (err: unknown) => { console.error(err); alert('Creating board failed.'); },
      complete: () => { this.createBoardSubmitting = false; },
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
        },
        error: (err: unknown) => { console.error(err); alert('Deleting board failed.'); },
      });
    };

    if (this.isBoardActive(boardId)) {
      this.playbackApi.stopBoard({ boardId }).subscribe({
        next: () => { this.clearBoard(boardId); doDelete(); },
        error: () => { this.clearBoard(boardId); doDelete(); },
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

  onGroupSelectionChange(board: Board, rawValue: string): void {
    if (board.id == null) return;

    const boardId = board.id;
    const selectedId = rawValue === '' ? null : Number(rawValue);
    const previousGroup = board.selectedGroup;
    const selectedGroup = this.groups.find(g => g.id === selectedId) ?? undefined;

    board.selectedGroup = selectedGroup;
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
      },
      error: (err: unknown) => {
        console.error(err);
        board.selectedGroup = previousGroup;
        alert('Updating group failed.');
      },
    });
  }

  onTrackSelectionChange(board: Board, rawValue: string): void {
    if (board.id == null) return;

    const boardId = board.id;
    this.selectedWindowByBoard.delete(boardId);

    const selectedId = rawValue === '' ? null : Number(rawValue);
    const previousTrack = board.selectedTrack;
    const selectedTrack = this.tracks.find(t => t.id === selectedId) ?? undefined;

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
        next: () => { this.clearBoard(boardId); doUpdate(); },
        error: () => { this.clearBoard(boardId); doUpdate(); },
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
          b.id != null
          && b.id !== targetId
          && !(b.overplay ?? false)
          && this.isBoardActive(b.id)
        );

    const stopCalls = boardsToStop.map(b => {
      const id = b.id!;
      return this.playbackApi.stopBoard({ boardId: id }).pipe(
        tap(() => this.clearBoard(id)),
        catchError(() => { this.clearBoard(id); return of(null); }),
      );
    });

    const stopAll$: Observable<unknown> = stopCalls.length > 0 ? forkJoin(stopCalls) : of(null);

    stopAll$
      .pipe(switchMap(() => {
        const windowId = this.selectedWindowByBoard.get(targetId) ?? undefined;
        const playRequest: PlayRequest = windowId != null ? { windowId } : {};
        return this.playbackApi.playBoard({ boardId: targetId, playRequest });
      }))
      .subscribe({
        next: (state: PlaybackState) => {
          this.applyPlaybackState(targetId, state);
        },
        error: (err: unknown) => { console.error(err); alert('Starting playback failed.'); },
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

  trackByBoardId(_index: number, board: Board): number {
    return board.id ?? 0;
  }

  getBoardStatus(board: Board): string {
    if (board.id == null) return 'STOPPED';
    return this.boardStatuses.get(board.id) ?? 'STOPPED';
  }

  getStreamUrl(board: Board): string | null {
    if (board.id == null) return null;
    return this.streamUrlsByBoard.get(board.id) ?? null;
  }

  getTracksForBoard(board: Board): Track[] {
    if (board.availableTracks && board.availableTracks.length > 0) {
      return board.availableTracks;
    }
    if (board.selectedGroup?.tracks && board.selectedGroup.tracks.length > 0) {
      return board.selectedGroup.tracks;
    }
    const groupId = board.selectedGroup?.id;
    if (groupId != null) {
      const group = this.groups.find(g => g.id === groupId);
      if (group?.tracks && group.tracks.length > 0) {
        return group.tracks;
      }
    }
    return this.tracks;
  }

  getWindowsForBoard(board: Board): any[] {
    return board.selectedTrack?.trackWindows ?? [];
  }

  getSelectedWindowId(board: Board): number | null {
    if (board.id == null) return null;
    return this.selectedWindowByBoard.get(board.id) ?? null;
  }

  onWindowSelectionChange(board: Board, rawValue: string): void {
    if (board.id == null) return;
    const windowId = rawValue === '' ? null : Number(rawValue);
    this.selectedWindowByBoard.set(board.id, windowId);
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
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
}