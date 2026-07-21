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
import { Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
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
import { PreviewButtonComponent } from '../../../../shared/ui/preview-button/preview-button.component';
import { previewMidpointS } from '../../../../shared/utils/preview';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  profanityErrorMessage,
  hasProfanity,
} from '../../../../shared/validators/profanity.validator';

export interface PublishEvent {
  track: Track;
  description: string;
}

type PublishFilterMode = 'all' | 'published' | 'unpublished';

@Component({
  selector: 'app-my-tracks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    FormsModule,
    NormalButtonComponent,
    UiListToolbarComponent,
    UiChipComponent,
    UiDialogShellComponent,
    UiDataTableComponent,
    UiCharCounterComponent,
    UiActionMenuComponent,
    PreviewButtonComponent,
    TranslocoPipe,
  ],
  templateUrl: './my-tracks.component.html',
  styleUrl: './my-tracks.component.scss',
})
export class MyTracksComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly infoDialog = inject(InfoDialogService);

  readonly tracks = input<Track[]>([]);
  readonly busyTrackId = input<string | null>(null);

  readonly publish = output<PublishEvent>();
  readonly unpublish = output<Track>();
  readonly close = output<void>();
  readonly addTrack = output<void>();

  readonly filterOptions = [
    { label: this.t('tracks.filter.all'), value: 'all' },
    { label: this.t('workshop.published'), value: 'published' },
    { label: this.t('workshop.unpublished'), value: 'unpublished' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: this.t('tracks.col.track'), className: 'col-title' },
    { label: this.t('tracks.col.duration'), className: 'col-duration', width: '100px' },
    { label: this.t('workshop.subscribers'), className: 'col-subscribers', width: '120px' },
    { label: this.t('tracks.col.status'), className: 'col-status', width: '150px' },
    { label: '', className: 'col-actions', width: '104px' },
  ];

  readonly descriptionMaxLength = FIELD_LIMITS.trackShare.description;

  readonly publishTrack = signal<Track | null>(null);
  readonly publishDesc = signal('');
  readonly descriptionError = computed(() =>
    hasProfanity(this.publishDesc()) ? profanityErrorMessage() : '',
  );
  readonly search = signal('');
  readonly filterMode = persistentSignal<PublishFilterMode>('mpf:workshop:mytracks:filter', 'all');

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as PublishFilterMode);
  }

  readonly filteredTracks = computed(() => {
    const query = this.search().trim().toLowerCase();
    const mode = this.filterMode();

    return this.tracks().filter(track => {
      const matchesSearch = !query || this.matchesSearch(track, query);

      const matchesFilter =
        mode === 'all' ||
        (mode === 'published' && !!track.trackShare) ||
        (mode === 'unpublished' && !track.trackShare);

      return matchesSearch && matchesFilter;
    });
  });

  openPublish(track: Track): void {
    this.publishTrack.set(track);
    this.publishDesc.set('');
  }

  closePublish(): void {
    this.publishTrack.set(null);
    this.publishDesc.set('');
  }

  async confirmPublish(): Promise<void> {
    const track = this.publishTrack();
    if (!track || this.descriptionError()) return;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.publishTitle'),
      message: this.t('workshop.publishConfirm', { name: this.displayName(track) }),
      confirmText: this.t('workshop.publish'),
      cancelText: this.t('common.cancel'),
    });

    if (!confirmed) return;

    this.publish.emit({
      track,
      description: this.publishDesc(),
    });

    this.closePublish();
  }

  async requestUnpublish(track: Track): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: this.t('workshop.unpublishTitle'),
      message: this.t('workshop.unpublishConfirm', { name: this.displayName(track) }),
      confirmText: this.t('workshop.unpublish'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    this.unpublish.emit(track);
  }

  trackById(index: number, track: Track): string | number {
    return track.id ?? index;
  }

  menuItems(track: Track): ActionMenuItem[] {
    const busy = this.busyTrackId() === track.id;

    if (track.trackShare) {
      return [{ id: 'unpublish', label: this.t('workshop.unpublish'), variant: 'danger', disabled: busy }];
    }

    return [{ id: 'publish', label: this.t('workshop.publish'), disabled: busy }];
  }

  onMenuSelect(track: Track, id: string): void {
    if (id === 'publish') {
      this.openPublish(track);
    } else if (id === 'unpublish') {
      void this.requestUnpublish(track);
    }
  }

  openDescription(track: Track): void {
    const description = track.trackShare?.description;
    if (!description) return;

    this.infoDialog.open({
      title: this.displayName(track),
      message: description,
    });
  }

  subscriberCount(track: Track): number {
    return track.trackShare?.subscriberCount ?? 0;
  }

  subscriberTitle(track: Track): string {
    const count = this.subscriberCount(track);
    return this.t('workshop.subscriberCount', { count });
  }

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || this.t('common.trackNum', { id: track.id });
  }

  /** Preview from the middle of the track. */
  previewStartS(track: Track): number {
    return previewMidpointS(track.duration);
  }

  formatDuration(seconds?: number): string {
    if (seconds == null) return '—';

    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private matchesSearch(track: Track, query: string): boolean {
    const haystack = [
      this.displayName(track),
      track.trackShare?.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }
}