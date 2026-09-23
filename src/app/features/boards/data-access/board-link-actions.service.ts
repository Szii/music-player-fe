import { Injectable, signal } from '@angular/core';

import { LinkedBoardAction } from '../models/linked-board-choice';

const STORAGE_KEY = 'board-link-actions';

/**
 * Per-board After-playback action (start vs. pause-and-resume the linked board).
 *
 * The backend only persists which board is linked (`linkedBoardId`), so the
 * action kind is kept in this browser, like board shortcuts. Boards without an
 * entry default to `start`.
 */
@Injectable({ providedIn: 'root' })
export class BoardLinkActionsService {
  private readonly actions = signal<Record<string, LinkedBoardAction>>(loadActions());

  readonly all = this.actions.asReadonly();

  actionFor(boardId: string | null | undefined): LinkedBoardAction {
    return (boardId != null ? this.actions()[boardId] : undefined) ?? 'start';
  }

  setAction(boardId: string, action: LinkedBoardAction): void {
    if (this.actionFor(boardId) === action) return;

    const next = { ...this.actions() };
    // `start` is the default, so only non-default actions need storing.
    if (action === 'start') {
      delete next[boardId];
    } else {
      next[boardId] = action;
    }
    this.commit(next);
  }

  clear(boardId: string): void {
    if (this.actions()[boardId] == null) return;
    const next = { ...this.actions() };
    delete next[boardId];
    this.commit(next);
  }

  private commit(next: Record<string, LinkedBoardAction>): void {
    this.actions.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode / quota) — keep the in-memory value.
    }
  }
}

function loadActions(): Record<string, LinkedBoardAction> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (raw == null || typeof raw !== 'object') return {};

    const result: Record<string, LinkedBoardAction> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (value === 'start' || value === 'resume') result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}
