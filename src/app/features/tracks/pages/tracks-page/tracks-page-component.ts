import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { TrackTableComponent } from '../../components/track-table/track-table.component';
import {
  TrackFormComponent,
  TrackFormEvent,
} from '../../components/track-form/track-form.component';
import {
  TrackFadesSaveEvent,
  TrackWindowsPanelComponent,
  TrackWindowsReorderEvent,
  WindowDeleteEvent,
  WindowSaveEvent,
} from '../../components/track-window-panel/track-window-panel.component';
import {
  CreateTrackRequestV2,
  Track,
  UpdateTrackRequestV2,
} from '../../../../api/generated';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { truncateAtWord } from '../../../../shared/utils/text';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  YoutubeMetadataError,
  YoutubeMetadataService,
} from '../../../../core/services/youtube-metadata.service';
import { TracksStore } from '../../../../core/services/tracks-store.service';
import { SessionsStore } from '../../../../core/services/sessions-store.service';
import { GroupsStore } from '../../../../core/services/groups-store.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../../core/services/board-playback.service';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

@Component({
  selector: 'app-tracks-page',
  imports: [
    TrackTableComponent,
    TrackFormComponent,
    TrackWindowsPanelComponent,
    UiAlertComponent,
    NormalButtonComponent,
    UiEmptyStateComponent,
    UiCreateCtaComponent,
    UiPageTitleComponent,
    FooterComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tracks-page.component.html',
  styleUrl: './tracks-page.component.scss',
})
export class TracksPageComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  @ViewChild(TrackFormComponent) private trackForm?: TrackFormComponent;

  private readonly tracksStore = inject(TracksStore);
  private readonly sessionsStore = inject(SessionsStore);
  private readonly groupsStore = inject(GroupsStore);
  private readonly ytMetadata = inject(YoutubeMetadataService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly tracks = this.tracksStore.tracks;
  readonly subscription = this.sessionsStore.selectedSubscription;
  readonly loading = this.tracksStore.loading;

  readonly sessionName = computed(() => {
    const session = this.sessionsStore.selectedSession();
    if (session == null) return null;
    return session.sessionName || this.t('sessions.untitled');
  });
  readonly sessionTrackIds = this.sessionsStore.sessionTrackIds;
  readonly scopedTrackIds = this.sessionsStore.scopedTrackIds;

  readonly errorMessage = computed(() => {
    const messages: string[] = [];

    if (this.tracksStore.ownFailed()) messages.push(this.t('tracks.err.loadOwn'));

    return messages.join(' ');
  });

  readonly createSubmitting = signal(false);

  readonly editingTrackId = signal<string | null>(null);
  readonly editTrackName = signal('');
  readonly editTrackLink = signal('');
  /** The link can't be changed once a track has windows or is published. */
  readonly editLockTrackLink = signal(false);

  /**
   * Held by id rather than by value, so the open panel always reflects whatever
   * the store currently holds — a saved window shows up without any extra sync.
   */
  private readonly windowTrackId = signal<string | null>(null);

  readonly windowTrack = computed<Track | null>(() => {
    const id = this.windowTrackId();
    if (id == null) return null;

    return this.tracks().find(track => track.id === id) ?? null;
  });

  ngOnInit(): void {
    forkJoin([this.tracksStore.load(), this.sessionsStore.load(), this.groupsStore.load()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  goToStages(): void {
    void this.router.navigate(['/boards']);
  }

  saveTrack(event: TrackFormEvent): void {
    this.createSubmitting.set(true);

    // Create needs a complete CreateTrackRequestV2 body.
    // Update is PATCH, so send only the fields that should change.
    // When the link changes, YouTube metadata is still fetched client-side
    // because the backend cannot read YouTube directly.
    this.saveTrackViaYoutube(event, this.editingTrackId());
  }

  private saveTrackViaYoutube(event: TrackFormEvent, editingId: string | null): void {
    // Updating without changing the link: this is just a rename, so do not
    // re-read YouTube metadata and do not send unchanged metadata fields.
    if (editingId != null) {
      const existing = this.findTrack(editingId);

      if (existing?.trackLink === event.trackLink) {
        this.runUpdate(editingId, { trackName: event.trackName.trim() || existing.trackName });
        return;
      }
    }

    const videoId = parseYoutubeId(event.trackLink);
    if (!videoId) {
      this.createSubmitting.set(false);
      this.toast.error(this.t('tracks.err.invalidLink'));
      return;
    }

    this.ytMetadata.fetchMetadata(videoId)
      .then((meta) => {
        const duration = Math.max(1, Math.round(meta.durationS));

        if (editingId != null) {
          const body: UpdateTrackRequestV2 = {
            trackName: event.trackName.trim() || truncateAtWord(meta.title, FIELD_LIMITS.track.name),
            trackOriginalName: meta.title,
            trackLink: event.trackLink,
            duration,
          };

          this.runUpdate(editingId, body);
          return;
        }

        const body: CreateTrackRequestV2 = {
          trackName: event.trackName.trim() || truncateAtWord(meta.title, FIELD_LIMITS.track.name),
          trackOriginalName: meta.title,
          trackLink: event.trackLink,
          duration,
          sessionId: this.sessionsStore.selectedSessionId(),
        };

        this.runCreate(body);
      })
      .catch((err: unknown) => {
        console.error(err);
        this.createSubmitting.set(false);
        this.toast.error(this.youtubeErrorMessage(err));
      });
  }

  private runCreate(body: CreateTrackRequestV2): void {
    this.tracksStore.createTrack(body)
      .pipe(
        finalize(() => this.createSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: track => {
          if (body.sessionId != null && track.id != null) {
            this.sessionsStore.noteAdded(body.sessionId, { trackId: track.id });
          }
          this.trackForm?.close();
          this.toast.success(this.t('tracks.msg.created'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('tracks.err.create') }));
        },
      });
  }

  private runUpdate(trackId: string, body: UpdateTrackRequestV2): void {
    this.tracksStore.updateTrack(trackId, body)
      .pipe(
        finalize(() => this.createSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.cancelEdit();
          this.toast.success(this.t('tracks.msg.updated'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('tracks.err.update') }));
        },
      });
  }

  private findTrack(id: string): Track | undefined {
    return this.tracks().find((t) => t.id === id);
  }

  /**
   * A video whose owner blocks embedding can never play here, so say that plainly
   * rather than implying a retry might work.
   */
  private youtubeErrorMessage(err: unknown): string {
    const reason = err instanceof YoutubeMetadataError ? err.reason : 'unknown';
    return this.t(`tracks.err.youtube.${reason}`);
  }

  onEdit(track: Track): void {
    if (track.id == null) return;

    this.editingTrackId.set(track.id);
    this.editTrackName.set(track.trackName ?? '');
    this.editTrackLink.set(track.trackLink ?? '');
    this.editLockTrackLink.set(
      (track.trackWindows?.length ?? 0) > 0,
    );
  }

  cancelEdit(): void {
    this.editingTrackId.set(null);
    this.editTrackName.set('');
    this.editTrackLink.set('');
    this.editLockTrackLink.set(false);
  }

  async onRemove(track: Track): Promise<void> {
    if (track.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('tracks.delete'),
      message: this.t('tracks.msg.deleteConfirm', { name: track.trackName || track.id }),
      confirmText: this.t('common.delete'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    const trackId = track.id;

    this.tracksStore.deleteTrack(trackId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.windowTrackId() === trackId) {
            this.closeWindows();
          }

          this.toast.success(this.t('tracks.msg.deleted'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('tracks.err.delete') }));
        },
      });
  }

  onAddToSession(track: Track): void {
    const sessionId = this.sessionsStore.selectedSessionId();
    if (sessionId == null || track.id == null) return;

    this.sessionsStore.addTrack(sessionId, track.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.t('scope.msg.trackAdded')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('scope.err.add') }));
        },
      });
  }

  async onRemoveFromSession(track: Track): Promise<void> {
    const sessionId = this.sessionsStore.selectedSessionId();
    const trackId = track.id;
    if (sessionId == null || trackId == null) return;

    const viaGroups = this.sessionGroupsContaining(trackId);
    if (!this.sessionsStore.sessionTrackIds().has(trackId) && viaGroups.length > 0) {
      this.toast.warning(this.t('scope.msg.inSessionViaGroup', { groups: viaGroups.join(', ') }), 6000);
      return;
    }

    const stages = viaGroups.length > 0
      ? []
      : this.sessionsStore.selectedSessionStageNames(board => board.selectedTrack?.id === trackId);
    if (stages.length > 0) {
      const confirmed = await this.confirmDialog.confirm({
        title: this.t('scope.removeFromSession'),
        message: this.t('scope.confirmRemoveTrack', {
          name: track.trackName || track.trackOriginalName || trackId,
          stages: stages.join(', '),
        }),
        confirmText: this.t('scope.removeFromSession'),
        cancelText: this.t('common.cancel'),
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    this.sessionsStore.removeTrack(sessionId, trackId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.t('scope.msg.trackRemoved')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('scope.err.remove') }));
        },
      });
  }

  private sessionGroupsContaining(trackId: string): string[] {
    const groupIds = this.sessionsStore.sessionGroupIds();
    return this.groupsStore.groups()
      .filter(group =>
        group.id != null
        && groupIds.has(group.id)
        && (group.tracks ?? []).some(item => item.id === trackId),
      )
      .map(group => group.listName || this.t('common.groupNum', { id: group.id }));
  }

  async onWindows(track: Track): Promise<void> {
    if (this.boardPlayback.isAnyPlaying()) {
      const confirmed = await this.confirmDialog.confirm({
        title: this.t('tracks.stopPlaybackTitle'),
        message: this.t('tracks.stopPlaybackMessage'),
        confirmText: this.t('tracks.stopAndEdit'),
        cancelText: this.t('common.cancel'),
        variant: 'danger',
      });

      if (!confirmed) return;

      this.boardPlayback.stopAll();
    }

    this.windowTrackId.set(track.id ?? null);
  }

  closeWindows(): void {
    this.windowTrackId.set(null);
  }

  onSaveWindow(event: WindowSaveEvent): void {
    const request$ = event.windowId != null
      ? this.tracksStore.updateWindow(event.trackId, event.windowId, event.body)
      : this.tracksStore.createWindow(event.trackId, event.body);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(
            this.t(event.windowId != null ? 'windows.msg.updated' : 'windows.msg.created'),
          );
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, {
            fallback: this.t(event.windowId != null ? 'windows.err.update' : 'windows.err.create'),
          }));
        },
      });
  }

  onSaveTrackFades(event: TrackFadesSaveEvent): void {
    const body: UpdateTrackRequestV2 = {
      fadeInDurationMs: event.fadeInMs,
      fadeOutDurationMs: event.fadeOutMs,
    };

    this.tracksStore.updateTrack(event.trackId, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.t('windows.msg.fadesUpdated')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.fades') }));
        },
      });
  }

  onReorderWindows(event: TrackWindowsReorderEvent): void {
    this.tracksStore.reorderWindows(event.trackId, { windowIds: event.windowIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.t('windows.msg.reordered')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.reorder') }));
        },
      });
  }

  onDeleteWindow(event: WindowDeleteEvent): void {
    this.tracksStore.deleteWindow(event.trackId, event.windowId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.t('windows.msg.deleted')),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.delete') }));
        },
      });
  }
}
