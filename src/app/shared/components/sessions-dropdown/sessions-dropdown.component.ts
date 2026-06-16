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
import { httpErrorMessage } from '../../utils/http-error';
import { ConfirmDialogService } from '../../features/confirm-dialog/confirm-dialog.service';
import { PromptDialogService } from '../../features/prompt-dialog/prompt-dialog.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { IconButtonComponent } from '../../ui/buttons/ui-icon-button.component';
import { FIELD_LIMITS } from '../../constants/field-limits';

@Component({
  selector: 'app-sessions-dropdown',
  imports: [IconButtonComponent],
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
                      <app-icon-button
                        icon="edit"
                        size="xs"
                        variant="ghost"
                        label="Rename session"
                        (clicked)="startRename(s)"
                      />
                      <app-icon-button
                        icon="delete"
                        size="xs"
                        variant="ghost"
                        label="Delete session"
                        (clicked)="confirmDelete(s)"
                      />
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
      maxLength: FIELD_LIMITS.session.name,
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
          this.toast.error(httpErrorMessage(err, { fallback: 'Creating session failed.' }));
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
      maxLength: FIELD_LIMITS.session.name,
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
          this.toast.error(httpErrorMessage(err, { fallback: 'Renaming session failed.' }));
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
          this.toast.error(httpErrorMessage(err, { fallback: 'Deleting session failed.' }));
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
