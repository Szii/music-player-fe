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
import { SessionShareResponse } from '../../../../api/generated';
import { UiIconComponent } from '../../../../shared/ui/icon/ui-icon.component';
import { InfoDialogService } from '../../../../shared/features/info-dialog/info-dialog.service';
import {
  UiDataTableColumn,
  UiDataTableComponent,
} from '../../../../shared/ui/data-table/ui-data-table.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';

type SessionCatalogSortMode =
  | 'updatedDesc'
  | 'nameAsc'
  | 'nameDesc'
  | 'ownerAsc'
  | 'subscribersDesc';

@Component({
  selector: 'app-session-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UiIconComponent,
    UiDataTableComponent,
    UiListToolbarComponent,
    NormalButtonComponent,
    TranslocoPipe,
  ],
  templateUrl: './session-catalog.component.html',
  styleUrl: './session-catalog.component.scss',
})
export class SessionCatalogComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly infoDialog = inject(InfoDialogService);

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly shares = input<SessionShareResponse[]>([]);
  readonly busyShareId = input<string | null>(null);

  readonly subscribe = output<SessionShareResponse>();

  readonly search = signal('');
  readonly sortMode = persistentSignal<SessionCatalogSortMode>('mpf:workshop:sessions:sort', 'updatedDesc');

  readonly sortOptions = [
    { label: this.t('workshop.sort.updatedDesc'), value: 'updatedDesc' },
    { label: this.t('sort.nameAsc'), value: 'nameAsc' },
    { label: this.t('sort.nameDesc'), value: 'nameDesc' },
    { label: this.t('sort.ownerAsc'), value: 'ownerAsc' },
    { label: this.t('sort.subscribersDesc'), value: 'subscribersDesc' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('workshop.col.session'), className: 'col-title' },
    { label: this.t('tracks.owner'), className: 'col-owner', width: '14%' },
    { label: this.t('workshop.col.content'), className: 'col-content', width: '250px' },
    { label: this.t('workshop.subscribers'), className: 'col-subscribers', width: '110px' },
    { label: '', className: 'col-actions', width: '140px' },
  ];

  readonly filteredShares = computed(() => {
    const query = this.search().trim().toLowerCase();
    const sort = this.sortMode();

    return this.shares()
      .filter(share => !query || this.matchesSearch(share, query))
      .sort((a, b) => this.compareShares(a, b, sort));
  });

  setSortMode(value: unknown): void {
    this.sortMode.set(value as SessionCatalogSortMode);
  }

  openDescription(share: SessionShareResponse): void {
    if (!share.description) return;
    this.infoDialog.open({ title: this.displayName(share), message: share.description });
  }

  contentLabel(share: SessionShareResponse): string {
    return this.t('workshop.content', {
      boards: share.boardCount ?? 0,
      tracks: share.trackCount ?? 0,
      groups: share.groupCount ?? 0,
    });
  }

  subscriberTitle(share: SessionShareResponse): string {
    return this.t('workshop.subscriberCount', { count: share.subscriberCount ?? 0 });
  }

  displayName(share: SessionShareResponse): string {
    return share.name || this.t('sessions.untitled');
  }

  trackById = (index: number, share: SessionShareResponse): string | number => share.id ?? index;

  private matchesSearch(share: SessionShareResponse, query: string): boolean {
    return [share.name, share.description, share.owner?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  }

  private compareShares(a: SessionShareResponse, b: SessionShareResponse, sort: SessionCatalogSortMode): number {
    switch (sort) {
      case 'nameAsc':
        return this.compareStrings(this.displayName(a), this.displayName(b));
      case 'nameDesc':
        return this.compareStrings(this.displayName(b), this.displayName(a));
      case 'ownerAsc':
        return this.compareStrings(a.owner?.name ?? '', b.owner?.name ?? '');
      case 'subscribersDesc':
        return (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0);
      case 'updatedDesc':
      default:
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    }
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }
}
