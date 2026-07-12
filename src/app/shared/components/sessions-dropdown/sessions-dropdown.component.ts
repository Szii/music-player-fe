import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { SessionResponse } from '../../../api/generated';
import { SessionsStore } from '../../../core/services/sessions-store.service';
import { ToastService } from '../../features/toast/toast.service';
import { httpErrorMessage } from '../../utils/http-error';
import { ConfirmDialogService } from '../../features/confirm-dialog/confirm-dialog.service';
import { PromptDialogService } from '../../features/prompt-dialog/prompt-dialog.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { IconButtonComponent } from '../../ui/buttons/ui-icon-button.component';
import { BottomSheetDragDirective } from '../../ui/bottom-sheet/bottom-sheet-drag.directive';
import { FIELD_LIMITS } from '../../constants/field-limits';

@Component({
  selector: 'app-sessions-dropdown',
  imports: [IconButtonComponent, BottomSheetDragDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './sessions-dropdown.component.html',
  styleUrls: ['./sessions-dropdown.component.scss'],
})
export class SessionsDropdownComponent {
  private readonly store = inject(SessionsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly promptDialog = inject(PromptDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly scrollLock = inject(ScrollLockService);

  private readonly sheetDrag = viewChild(BottomSheetDragDirective);

  readonly isOpen = signal(false);

  constructor() {
    // On phones the panel becomes a bottom sheet that owns the screen: lock the
    // background scroll (and hide the bottom nav via the shared body class) while
    // it's open, matching ui-select and the board-settings menu.
    effect((onCleanup) => {
      if (!this.isOpen()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  readonly sessions = this.store.sessions;
  readonly selectedId = this.store.selectedSessionId;
  readonly selected = this.store.selectedSession;

  readonly showTrigger = computed(() => this.sessions().length > 0);

  /** Read by `t()` so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate(key, params);
  }

  readonly triggerLabel = computed(() => {
    const current = this.selected();
    if (current) return current.sessionName || this.t('sessions.untitled');
    if (this.sessions().length === 0) return this.t('sessions.none');
    return this.t('sessions.select');
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

  /** Tap the mobile bottom-sheet scrim to dismiss. pointerdown + preventDefault
      avoids a ghost click reaching the trigger (which would re-open the menu). */
  onScrimDown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const drag = this.sheetDrag();
    if (drag) {
      drag.close();
    } else {
      this.dismissSheet();
    }
  }

  /** Close the sheet after a scrim tap or handle drag/tap. */
  dismissSheet(): void {
    this.close();
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
      title: this.t('sessions.new'),
      placeholder: this.t('sessions.namePlaceholder'),
      confirmText: this.t('common.create'),
      cancelText: this.t('common.cancel'),
      maxLength: FIELD_LIMITS.session.name,
    });
    if (!name) return;

    this.store.createSession(name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.t('sessions.created'));
        },
        error: err => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.createFailed') }));
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
      title: this.t('sessions.rename'),
      placeholder: this.t('sessions.namePlaceholder'),
      initialValue: session.sessionName ?? '',
      confirmText: this.t('common.save'),
      cancelText: this.t('common.cancel'),
      maxLength: FIELD_LIMITS.session.name,
    });
    if (!name) return;

    this.store.renameSession(sessionId, name, description)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.t('sessions.renamed'));
        },
        error: err => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.renameFailed') }));
        },
      });
  }

  async confirmDelete(session: SessionResponse): Promise<void> {
    if (session.sessionId == null) return;

    const sessionId = session.sessionId;
    const label = session.sessionName || this.t('sessions.thisSession');

    this.close();
    const confirmed = await this.confirmDialog.confirm({
      title: this.t('sessions.delete'),
      message: this.t('sessions.deleteConfirm', { name: label }),
      confirmText: this.t('common.delete'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    this.store.deleteSession(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.t('sessions.deleted'));
        },
        error: err => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.deleteFailed') }));
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
