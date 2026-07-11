import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
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
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  PROFANITY_ERROR,
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
  ],
  templateUrl: './my-tracks.component.html',
  styleUrl: './my-tracks.component.scss',
})
export class MyTracksComponent {
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly infoDialog = inject(InfoDialogService);

  readonly tracks = input<Track[]>([]);
  readonly busyTrackId = input<number | null>(null);

  readonly publish = output<PublishEvent>();
  readonly unpublish = output<Track>();
  readonly close = output<void>();
  readonly addTrack = output<void>();

  readonly filterOptions = [
    { label: 'All tracks', value: 'all' },
    { label: 'Published', value: 'published' },
    { label: 'Unpublished', value: 'unpublished' },
  ];

  readonly columns: UiDataTableColumn[] = [
    { label: 'Track', className: 'col-title' },
    { label: 'Duration', className: 'col-duration', width: '100px' },
    { label: 'Subscribers', className: 'col-subscribers', width: '120px' },
    { label: 'Status', className: 'col-status', width: '150px' },
    { label: '', className: 'col-actions', width: '72px' },
  ];

  readonly descriptionMaxLength = FIELD_LIMITS.trackShare.description;

  readonly publishTrack = signal<Track | null>(null);
  readonly publishDesc = signal('');
  readonly descriptionError = computed(() =>
    hasProfanity(this.publishDesc()) ? PROFANITY_ERROR : '',
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
      title: 'Publish track',
      message: `Publish "${this.displayName(track)}"?`,
      confirmText: 'Publish',
      cancelText: 'Cancel',
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
      title: 'Unpublish track',
      message: `Unpublish "${this.displayName(track)}"?`,
      confirmText: 'Unpublish',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.unpublish.emit(track);
  }

  trackById(index: number, track: Track): number {
    return track.id ?? index;
  }

  menuItems(track: Track): ActionMenuItem[] {
    const busy = this.busyTrackId() === track.id;

    if (track.trackShare) {
      return [{ id: 'unpublish', label: 'Unpublish', variant: 'danger', disabled: busy }];
    }

    return [{ id: 'publish', label: 'Publish', disabled: busy }];
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
    return `${count} ${count === 1 ? 'subscriber' : 'subscribers'}`;
  }

  displayName(track: Track): string {
    return track.trackName || track.trackOriginalName || ('Track #' + track.id);
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