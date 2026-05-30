import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SessionResponse } from '../../../api/generated';
import { SessionsStore } from '../../../core/services/sessions-store.service';
import { ToastService } from '../../features/toast/toast.service';
import { ConfirmDialogService } from '../../features/confirm-dialog/confirm-dialog.service';
import { PromptDialogService } from '../../features/prompt-dialog/prompt-dialog.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';

@Component({
  selector: 'app-sessions-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (showTrigger()) {
      <div class="sd" [class.sd--open]="isOpen()">
        <button
          type="button"
          class="sd__trigger"
          [attr.aria-expanded]="isOpen()"
          aria-haspopup="menu"
          (click)="toggle()"
        >
          <span class="sd__label">{{ triggerLabel() }}</span>
          <span class="sd__arrow" aria-hidden="true">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>

        @if (isOpen()) {
          <div class="app-popover-surface sd__panel" role="menu">
            <div class="app-popover-header">Sessions</div>

            @if (sessions().length === 0) {
              <div class="sd__empty">No sessions yet.</div>
            } @else {
              <ul class="sd__list">
                @for (s of sessions(); track s.sessionId) {
                  <li
                    class="sd__item"
                    [class.sd__item--selected]="s.sessionId === selectedId()"
                  >
                    <button
                      type="button"
                      class="app-popover-item sd__item-select"
                      [class.app-popover-item--selected]="s.sessionId === selectedId()"
                      (click)="select(s)"
                      [attr.aria-current]="s.sessionId === selectedId() ? 'true' : null"
                    >
                      <span class="sd__item-name">{{ s.sessionName || 'Untitled session' }}</span>
                      @if (s.sessionId === selectedId()) {
                        <span class="sd__item-check" aria-hidden="true">✓</span>
                      }
                    </button>

                    <div class="sd__item-actions">
                      <button
                        type="button"
                        class="sd__icon-btn"
                        aria-label="Rename session"
                        title="Rename"
                        (click)="startRename(s); $event.stopPropagation()"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                          stroke="currentColor" stroke-width="1.9"
                          stroke-linecap="round" stroke-linejoin="round">
                          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                          <path d="M12.5 5.5l4 4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="sd__icon-btn sd__icon-btn--danger"
                        aria-label="Delete session"
                        title="Delete"
                        (click)="confirmDelete(s); $event.stopPropagation()"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                          stroke="currentColor" stroke-width="1.9"
                          stroke-linecap="round" stroke-linejoin="round">
                          <path d="M5 7h14" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M8 7l1-2h6l1 2" />
                          <path d="M7 7l1 12h8l1-12" />
                        </svg>
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }

            <button
              type="button"
              class="sd__create"
              (click)="startCreate()"
            >
              <span class="sd__create-plus" aria-hidden="true">＋</span>
              <span>New session</span>
            </button>
          </div>
        }
      </div>
    }
  `,
  styleUrls: ['./sessions-dropdown.component.scss'],
})
export class SessionsDropdownComponent {
  private readonly store = inject(SessionsStore);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly promptDialog = inject(PromptDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly boardPlayback = inject(BoardPlaybackService);

  readonly isOpen = signal(false);

  readonly sessions = this.store.sessions;
  readonly selectedId = this.store.selectedSessionId;
  readonly selected = this.store.selectedSession;

  readonly showTrigger = computed(() => this.sessions().length > 0);

  readonly triggerLabel = computed(() => {
    const current = this.selected();
    if (current) return current.sessionName || 'Untitled session';
    if (this.sessions().length === 0) return 'No sessions';
    return 'Select session';
  });

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  select(session: SessionResponse): void {
    if (session.sessionId == null) return;
      if (this.store.selectedSessionId() === session.sessionId) {
        return;
      }
    this.boardPlayback.stopAll();
    this.store.selectSession(session.sessionId);
    this.close();
  }

  async startCreate(): Promise<void> {
    this.close();
    const name = await this.promptDialog.prompt({
      title: 'New session',
      placeholder: 'Session name',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    if (!name) return;

    this.store.createSession(name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Session created.');
        },
        error: err => {
          console.error(err);
          this.toast.error('Creating session failed.');
        },
      });
  }

  openCreate(): void {
    this.startCreate();
  }

  async startRename(session: SessionResponse): Promise<void> {
    if (session.sessionId == null) return;
    const sessionId = session.sessionId;
    const description = session.sessionDescription;

    this.close();
    const name = await this.promptDialog.prompt({
      title: 'Rename session',
      placeholder: 'Session name',
      initialValue: session.sessionName ?? '',
      confirmText: 'Save',
      cancelText: 'Cancel',
    });
    if (!name) return;

    this.store.renameSession(sessionId, name, description)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Session renamed.');
        },
        error: err => {
          console.error(err);
          this.toast.error('Renaming session failed.');
        },
      });
  }

  async confirmDelete(session: SessionResponse): Promise<void> {
    if (session.sessionId == null) return;

    const sessionId = session.sessionId;
    const label = session.sessionName || 'this session';

    this.close();
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete session',
      message: `Delete "${label}" and all its boards? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.store.deleteSession(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Session deleted.');
        },
        error: err => {
          console.error(err);
          this.toast.error('Deleting session failed.');
        },
      });
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  onEscape(): void {
    if (this.isOpen()) this.close();
  }
}
