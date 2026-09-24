import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { SessionResponse } from '../../../api/generated';
import { SessionsStore } from '../../../core/services/sessions-store.service';
import { SessionActionsService } from '../../../core/services/session-actions.service';
import { ConfirmDialogService } from '../../features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { IconButtonComponent } from '../../ui/buttons/ui-icon-button.component';
import { BottomSheetDragDirective } from '../../ui/bottom-sheet/bottom-sheet-drag.directive';

@Component({
  selector: 'app-sessions-dropdown',
  imports: [IconButtonComponent, BottomSheetDragDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.sd-inline]': "variant() === 'inline'",
    '[class.sd-host--open]': 'isOpen()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './sessions-dropdown.component.html',
  styleUrls: ['./sessions-dropdown.component.scss'],
})
export class SessionsDropdownComponent {
  private readonly store = inject(SessionsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly actions = inject(SessionActionsService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly scrollLock = inject(ScrollLockService);

  private readonly sheetDrag = viewChild(BottomSheetDragDirective);

  readonly variant = input<'button' | 'inline'>('button');

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

  async select(session: SessionResponse): Promise<void> {
    const sessionId = session.sessionId;
    if (sessionId == null) return;
    if (this.store.selectedSessionId() === sessionId) {
      this.close();
      return;
    }

    this.close();

    if (this.boardPlayback.isAnyPlaying()) {
      const confirmed = await this.confirmDialog.confirm({
        title: this.t('sessions.switchPlayingTitle'),
        message: this.t('sessions.switchPlayingMessage', {
          name: session.sessionName || this.t('sessions.untitled'),
        }),
        confirmText: this.t('sessions.switchPlayingConfirm'),
        cancelText: this.t('common.cancel'),
      });
      if (!confirmed) return;
    }

    this.boardPlayback.stopAll();
    this.store.selectSession(sessionId);
  }

  startCreate(): void {
    this.close();
    this.actions.create();
  }

  startRename(session: SessionResponse): void {
    this.close();
    this.actions.rename(session);
  }

  confirmDelete(session: SessionResponse): void {
    this.close();
    this.actions.delete(session);
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
