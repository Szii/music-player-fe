import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SessionResponse } from '../../../../api/generated';
import { UiIconComponent } from '../../../../shared/ui/icon/ui-icon.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { ChipVariant, UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { InfoDialogService } from '../../../../shared/features/info-dialog/info-dialog.service';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  profanityErrorMessage,
  hasProfanity,
} from '../../../../shared/validators/profanity.validator';

export interface SessionDescriptionEvent {
  session: SessionResponse;
  description: string;
}

type PublishFilterMode = 'all' | 'published' | 'unpublished';

type DescriptionDialogMode = 'publish' | 'edit';

@Component({
  selector: 'app-my-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    UiIconComponent,
    FormsModule,
    NormalButtonComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiDialogShellComponent,
    UiDataTableComponent,
    UiCharCounterComponent,
    UiActionMenuComponent,
    TranslocoPipe,
  ],
  templateUrl: './my-sessions.component.html',
  styleUrl: './my-sessions.component.scss',
})
export class MySessionsComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly infoDialog = inject(InfoDialogService);

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly sessions = input<SessionResponse[]>([]);
  readonly busySessionId = input<string | null>(null);

  readonly publish = output<SessionDescriptionEvent>();
  readonly publishUpdate = output<SessionResponse>();
  readonly editDescription = output<SessionDescriptionEvent>();
  readonly unpublish = output<SessionResponse>();
  readonly close = output<void>();

  readonly filterOptions = [
    { label: this.t('workshop.filter.all'), value: 'all' },
    { label: this.t('workshop.published'), value: 'published' },
    { label: this.t('workshop.unpublished'), value: 'unpublished' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('workshop.col.session'), className: 'col-title' },
    { label: this.t('workshop.subscribers'), className: 'col-subscribers', width: '110px' },
    { label: this.t('tracks.col.status'), className: 'col-status', width: '170px' },
    { label: '', className: 'col-actions', width: '72px' },
  ];

  readonly descriptionMaxLength = FIELD_LIMITS.sessionShare.description;

  readonly dialogSession = signal<SessionResponse | null>(null);
  readonly dialogMode = signal<DescriptionDialogMode>('publish');
  readonly description = signal('');
  readonly descriptionError = computed(() =>
    hasProfanity(this.description()) ? profanityErrorMessage() : '',
  );

  readonly search = signal('');
  readonly filterMode = persistentSignal<PublishFilterMode>('mpf:workshop:mysessions:filter', 'all');

  readonly filteredSessions = computed(() => {
    const query = this.search().trim().toLowerCase();
    const mode = this.filterMode();

    return this.sessions().filter(session => {
      const published = session.publication != null;
      const matchesSearch = !query || this.matchesSearch(session, query);
      const matchesFilter =
        mode === 'all'
        || (mode === 'published' && published)
        || (mode === 'unpublished' && !published);
      return matchesSearch && matchesFilter;
    });
  });

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as PublishFilterMode);
  }

  publishable(session: SessionResponse): boolean {
    return (session.boards?.length ?? 0) > 0 && (session.trackCount ?? 0) > 0;
  }

  statusVariant(session: SessionResponse): ChipVariant {
    if (session.publication) return 'success';
    return this.publishable(session) ? 'gold' : 'muted';
  }

  statusLabel(session: SessionResponse): string {
    if (session.publication) return this.t('workshop.publishedVersion', { version: session.publication.version });
    return this.t(this.publishable(session) ? 'workshop.unpublished' : 'workshop.notPublishable');
  }

  statusTitle(session: SessionResponse): string | null {
    return this.publishable(session) ? null : this.t('workshop.notPublishableHint');
  }

  menuItems(session: SessionResponse): ActionMenuItem[] {
    const busy = this.busySessionId() === session.sessionId;
    const publishable = this.publishable(session);

    if (session.publication == null) {
      return [{ id: 'publish', label: this.t('workshop.publish'), disabled: busy || !publishable }];
    }

    return [
      { id: 'publishUpdate', label: this.t('workshop.publishUpdate'), disabled: busy || !publishable },
      { id: 'editDescription', label: this.t('workshop.editDescription'), disabled: busy },
      { id: 'unpublish', label: this.t('workshop.unpublish'), variant: 'danger', disabled: busy },
    ];
  }

  onMenuSelect(session: SessionResponse, id: string): void {
    switch (id) {
      case 'publish':
        this.openDialog(session, 'publish');
        break;
      case 'editDescription':
        this.openDialog(session, 'edit');
        break;
      case 'publishUpdate':
        void this.requestPublishUpdate(session);
        break;
      case 'unpublish':
        void this.requestUnpublish(session);
        break;
    }
  }

  openDialog(session: SessionResponse, mode: DescriptionDialogMode): void {
    this.dialogSession.set(session);
    this.dialogMode.set(mode);
    this.description.set(mode === 'edit' ? session.publication?.description ?? '' : '');
  }

  closeDialog(): void {
    this.dialogSession.set(null);
    this.description.set('');
  }

  async confirmDialogAction(): Promise<void> {
    const session = this.dialogSession();
    if (!session || this.descriptionError()) return;

    if (this.dialogMode() === 'edit') {
      this.editDescription.emit({ session, description: this.description() });
      this.closeDialog();
      return;
    }

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.publishTitle'),
      message: this.t('workshop.publishConfirm', { name: this.displayName(session) }),
      confirmText: this.t('workshop.publish'),
      cancelText: this.t('common.cancel'),
    });
    if (!confirmed) return;

    this.publish.emit({ session, description: this.description() });
    this.closeDialog();
  }

  async requestPublishUpdate(session: SessionResponse): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.publishUpdate'),
      message: this.t('workshop.publishUpdateConfirm', {
        name: this.displayName(session),
        version: (session.publication?.version ?? 0) + 1,
      }),
      confirmText: this.t('workshop.publishUpdate'),
      cancelText: this.t('common.cancel'),
    });
    if (confirmed) this.publishUpdate.emit(session);
  }

  async requestUnpublish(session: SessionResponse): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.unpublishTitle'),
      message: this.t('workshop.unpublishConfirm', { name: this.displayName(session) }),
      confirmText: this.t('workshop.unpublish'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });
    if (confirmed) this.unpublish.emit(session);
  }

  openDescription(session: SessionResponse): void {
    const description = session.publication?.description;
    if (!description) return;
    this.infoDialog.open({ title: this.displayName(session), message: description });
  }

  contentLabel(session: SessionResponse): string {
    return this.t('workshop.content', {
      boards: session.boards?.length ?? 0,
      tracks: session.trackCount ?? 0,
      groups: session.groupIds?.length ?? 0,
    });
  }

  subscriberTitle(session: SessionResponse): string {
    return this.t('workshop.subscriberCount', { count: session.publication?.subscriberCount ?? 0 });
  }

  displayName(session: SessionResponse): string {
    return session.sessionName || this.t('sessions.untitled');
  }

  trackById(index: number, session: SessionResponse): string | number {
    return session.sessionId ?? index;
  }

  private matchesSearch(session: SessionResponse, query: string): boolean {
    return [session.sessionName, session.publication?.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  }
}
