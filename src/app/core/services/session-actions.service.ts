import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { SessionResponse } from '../../api/generated';
import { SessionsStore } from './sessions-store.service';
import { ToastService } from '../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../shared/features/confirm-dialog/confirm-dialog.service';
import { PromptDialogService } from '../../shared/features/prompt-dialog/prompt-dialog.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { FIELD_LIMITS } from '../../shared/constants/field-limits';

/** Create/rename/delete session flows, shared by the navbar picker and the stages page. */
@Injectable({ providedIn: 'root' })
export class SessionActionsService {
  private readonly store = inject(SessionsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly promptDialog = inject(PromptDialogService);

  async create(): Promise<void> {
    const name = await this.promptDialog.prompt({
      title: this.t('sessions.new'),
      placeholder: this.t('sessions.namePlaceholder'),
      confirmText: this.t('common.create'),
      cancelText: this.t('common.cancel'),
      maxLength: FIELD_LIMITS.session.name,
    });
    if (!name) return;

    this.store.createSession(name).subscribe({
      next: () => this.toast.success(this.t('sessions.created')),
      error: err => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.createFailed') }));
      },
    });
  }

  async rename(session: SessionResponse): Promise<void> {
    if (session.sessionId == null) return;
    const sessionId = session.sessionId;
    const description = session.sessionDescription;

    const name = await this.promptDialog.prompt({
      title: this.t('sessions.rename'),
      placeholder: this.t('sessions.namePlaceholder'),
      initialValue: session.sessionName ?? '',
      confirmText: this.t('common.save'),
      cancelText: this.t('common.cancel'),
      maxLength: FIELD_LIMITS.session.name,
    });
    if (!name) return;

    this.store.renameSession(sessionId, name, description).subscribe({
      next: () => this.toast.success(this.t('sessions.renamed')),
      error: err => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.renameFailed') }));
      },
    });
  }

  async delete(session: SessionResponse): Promise<void> {
    if (session.sessionId == null) return;
    const sessionId = session.sessionId;
    const label = session.sessionName || this.t('sessions.thisSession');
    const subscribed = session.readOnly === true;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t(subscribed ? 'sessions.shared.unsubscribe' : 'sessions.delete'),
      message: this.t(subscribed ? 'sessions.shared.unsubscribeConfirm' : 'sessions.deleteConfirm', { name: label }),
      confirmText: this.t(subscribed ? 'sessions.shared.unsubscribe' : 'common.delete'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;

    this.store.deleteSession(sessionId).subscribe({
      next: () => this.toast.success(this.t(subscribed ? 'sessions.shared.unsubscribed' : 'sessions.deleted')),
      error: err => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.deleteFailed') }));
      },
    });
  }

  update(session: SessionResponse): void {
    const subscription = session.subscription;
    if (session.sessionId == null || !subscription?.restorable || !subscription.updateAvailable) return;

    this.store.sync(session.sessionId).subscribe({
      next: () => this.toast.success(this.t('sessions.shared.updated')),
      error: err => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: this.t('sessions.shared.syncFailed') }));
      },
    });
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
  }
}
