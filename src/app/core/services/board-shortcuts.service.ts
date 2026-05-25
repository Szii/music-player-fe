import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

const STORAGE_KEY = 'board-shortcuts';
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

@Injectable({ providedIn: 'root' })
export class BoardShortcutsService {
  readonly shortcuts = signal<Record<number, string>>(this.load());
  readonly trigger$ = new Subject<number>();

  private triggersEnabled = true;

  constructor() {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  getShortcut(boardId: number): string | null {
    return this.shortcuts()[boardId] ?? null;
  }

  setShortcut(boardId: number, shortcut: string): void {
    const next: Record<number, string> = { ...this.shortcuts() };

    for (const key of Object.keys(next)) {
      const id = Number(key);
      if (id !== boardId && next[id] === shortcut) {
        delete next[id];
      }
    }

    next[boardId] = shortcut;
    this.shortcuts.set(next);
    this.persist(next);
  }

  clearShortcut(boardId: number): void {
    if (this.shortcuts()[boardId] == null) return;
    const next = { ...this.shortcuts() };
    delete next[boardId];
    this.shortcuts.set(next);
    this.persist(next);
  }

  suspendTriggers(): void {
    this.triggersEnabled = false;
  }

  resumeTriggers(): void {
    this.triggersEnabled = true;
  }

  static formatEvent(event: KeyboardEvent): string | null {
    if (MODIFIER_KEYS.has(event.key)) return null;

    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key);

    return parts.join('+');
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.triggersEnabled) return;
    if (this.isEditableTarget(event.target)) return;

    const formatted = BoardShortcutsService.formatEvent(event);
    if (!formatted) return;

    const current = this.shortcuts();
    let matched = false;

    for (const [key, value] of Object.entries(current)) {
      if (value === formatted) {
        matched = true;
        this.trigger$.next(Number(key));
      }
    }

    if (matched) {
      event.preventDefault();
    }
  };

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private load(): Record<number, string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const result: Record<number, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          const id = Number(key);
          if (Number.isFinite(id) && typeof value === 'string' && value) {
            result[id] = value;
          }
        }
        return result;
      }
    } catch {}
    return {};
  }

  private persist(value: Record<number, string>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {}
  }
}
