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
import { SessionResponse } from '../../../../api/generated';
import { ChipVariant, UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';

type SubscriptionStatus = 'removed' | 'unpublished' | 'update' | 'current';

const STATUS_VARIANTS: Record<SubscriptionStatus, ChipVariant> = {
  removed: 'muted',
  unpublished: 'muted',
  update: 'crimson',
  current: 'success',
};

@Component({
  selector: 'app-my-subscriptions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    UiChipComponent,
    UiDialogShellComponent,
    UiListToolbarComponent,
    UiDataTableComponent,
    UiActionMenuComponent,
    TranslocoPipe,
  ],
  templateUrl: './my-subscriptions.component.html',
  styleUrl: './my-subscriptions.component.scss',
})
export class MySubscriptionsComponent {
  private readonly transloco = inject(TranslocoService);

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly sessions = input<SessionResponse[]>([]);
  readonly busySessionId = input<string | null>(null);

  readonly update = output<SessionResponse>();
  readonly unsubscribe = output<SessionResponse>();
  readonly close = output<void>();

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('workshop.col.session'), className: 'col-title' },
    { label: this.t('tracks.owner'), className: 'col-owner', width: '18%' },
    { label: this.t('workshop.col.version'), className: 'col-version', width: '110px' },
    { label: this.t('tracks.col.status'), className: 'col-status', width: '190px' },
    { label: '', className: 'col-actions', width: '88px' },
  ];

  readonly search = signal('');

  readonly filteredSessions = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.sessions().filter(session =>
      !query
      || [session.sessionName, session.subscription?.owner?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  status(session: SessionResponse): SubscriptionStatus {
    const subscription = session.subscription;
    if (!subscription?.restorable) return 'removed';
    if (subscription.unpublished) return 'unpublished';
    if (subscription.updateAvailable) return 'update';
    return 'current';
  }

  statusVariant(session: SessionResponse): ChipVariant {
    return STATUS_VARIANTS[this.status(session)];
  }

  statusLabel(session: SessionResponse): string {
    return this.t(`workshop.subscriptionStatus.${this.status(session)}`);
  }

  versionLabel(session: SessionResponse): string {
    const subscription = session.subscription;
    const installed = `v${subscription?.installedVersion ?? 0}`;
    return subscription?.updateAvailable ? `${installed} → v${subscription.latestVersion}` : installed;
  }

  menuItems(session: SessionResponse): ActionMenuItem[] {
    const busy = this.busySessionId() === session.sessionId;
    const subscription = session.subscription;
    const items: ActionMenuItem[] = [];

    if (subscription?.restorable && subscription.updateAvailable) {
      items.push({ id: 'update', label: this.t('sessions.shared.update'), disabled: busy });
    }
    items.push({ id: 'unsubscribe', label: this.t('workshop.unsubscribe'), variant: 'danger', disabled: busy });
    return items;
  }

  onMenuSelect(session: SessionResponse, id: string): void {
    if (id === 'update') {
      this.update.emit(session);
    } else if (id === 'unsubscribe') {
      this.unsubscribe.emit(session);
    }
  }

  displayName(session: SessionResponse): string {
    return session.sessionName || this.t('sessions.untitled');
  }

  trackById(index: number, session: SessionResponse): string | number {
    return session.sessionId ?? index;
  }
}
