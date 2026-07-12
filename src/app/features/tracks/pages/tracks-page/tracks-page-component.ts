import {
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

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
  MusicTracksService,
  ReorderTrackWindowsRequest,
  Track,
  UpdateTrackRequestV2,
} from '../../../../api/generated';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { YoutubeMetadataService } from '../../../../core/services/youtube-metadata.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../../core/services/board-playback.service';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

@Component({
  selector: 'app-tracks-page',
  standalone: true,
  imports: [
    TrackTableComponent,
    TrackFormComponent,
    TrackWindowsPanelComponent,
    UiAlertComponent,
    UiCreateCtaComponent,
    UiPageTitleComponent,
    FooterComponent,
    TranslocoPipe,
  ],
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

  private readonly tracksApi = inject(MusicTracksService);
  private readonly ytMetadata = inject(YoutubeMetadataService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly boardPlayback = inject(BoardPlaybackService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tracks = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly createSubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly editingTrackId = signal<number | null>(null);
  readonly editTrackName = signal('');
  readonly editTrackLink = signal('');
  /** The link can't be changed once a track has windows or is published. */
  readonly editLockTrackLink = signal(false);

  readonly windowTrack = signal<Track | null>(null);

  ngOnInit(): void {
    this.loadTracks();
  }

  loadTracks(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      userTracks: this.tracksApi.getUserTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('tracks.err.loadOwn') }));
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('tracks.err.loadSubscribed') }));
          return of([] as Track[]);
        }),
      ),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ userTracks, subscribedTracks }) => {
          const merged = this.mergeTracks(userTracks ?? [], subscribedTracks ?? []);
          this.tracks.set(merged);
          this.syncWindowTrack(merged);
        },
        error: (err: unknown) => {
          console.error(err);
          this.appendError(httpErrorMessage(err, { fallback: this.t('stages.err.loadTracks') }));
        },
      });
  }

  saveTrack(event: TrackFormEvent): void {
    this.createSubmitting.set(true);

    // Create needs a complete CreateTrackRequestV2 body.
    // Update is PATCH, so send only the fields that should change.
    // When the link changes, YouTube metadata is still fetched client-side
    // because the backend cannot read YouTube directly.
    this.saveTrackViaYoutube(event, this.editingTrackId());
  }

  private saveTrackViaYoutube(event: TrackFormEvent, editingId: number | null): void {
    // Updating without changing the link: this is just a rename, so do not
    // re-read YouTube metadata and do not send unchanged metadata fields.
    if (editingId != null) {
      const existing = this.findTrack(editingId);

      if (existing?.trackLink === event.trackLink) {
        const body: UpdateTrackRequestV2 = {
          trackName: event.trackName,
        };

        this.runUpdate(editingId, body);
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
            trackName: event.trackName,
            trackOriginalName: meta.title,
            trackLink: event.trackLink,
            duration,
          };

          this.runUpdate(editingId, body);
          return;
        }

        const body: CreateTrackRequestV2 = {
          trackName: event.trackName,
          trackOriginalName: meta.title,
          trackLink: event.trackLink,
          duration,
        };

        this.runCreateV2(body);
      })
      .catch((err: unknown) => {
        console.error(err);
        this.createSubmitting.set(false);
        this.toast.error(this.t('tracks.err.unreadableVideo'));
      });
  }

  private runCreateV2(body: CreateTrackRequestV2): void {
    this.tracksApi.createTrackV2({ createTrackRequestV2: body })
      .pipe(
        finalize(() => this.createSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.onTrackCreated(),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('tracks.err.create') }));
        },
      });
  }

  private runUpdate(trackId: number, body: UpdateTrackRequestV2): void {
    this.tracksApi.updateTrack({ trackId, updateTrackRequestV2: body })
      .pipe(
        finalize(() => this.createSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.cancelEdit();
          this.loadTracks();
          this.toast.success(this.t('tracks.msg.updated'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('tracks.err.update') }));
        },
      });
  }

  private findTrack(id: number): Track | undefined {
    return this.tracks().find((t) => t.id === id);
  }

  private onTrackCreated(): void {
    this.trackForm?.close();
    this.loadTracks();
    this.toast.success(this.t('tracks.msg.created'));
  }

  onEdit(track: Track): void {
    if (track.id == null) return;

    this.editingTrackId.set(track.id);
    this.editTrackName.set(track.trackName ?? '');
    this.editTrackLink.set(track.trackLink ?? '');
    this.editLockTrackLink.set(
      (track.trackWindows?.length ?? 0) > 0 || track.trackShare != null,
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

    this.tracksApi.deleteTrack({ trackId: track.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.tracks.update(current => current.filter(t => t.id !== track.id));

          if (this.windowTrack()?.id === track.id) {
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

    this.windowTrack.set(track);
  }

  closeWindows(): void {
    this.windowTrack.set(null);
  }

  onSaveWindow(event: WindowSaveEvent): void {
    const request$ = event.windowId != null
      ? this.tracksApi.updateTrackWindow({
          trackId: event.trackId,
          windowId: event.windowId,
          trackWindowRequest: event.body,
        })
      : this.tracksApi.createTrackWindow({
          trackId: event.trackId,
          trackWindowRequest: event.body,
        });

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrack) => {
          this.applyTrackUpdate(event.trackId, updatedTrack);
          this.toast.success(this.t(event.windowId != null ? 'windows.msg.updated' : 'windows.msg.created'));
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
    const track = this.findTrack(event.trackId);

    const body: UpdateTrackRequestV2 = {
      fadeInDurationMs: event.fadeInMs,
      fadeOutDurationMs: event.fadeOutMs,
    };

    this.tracksApi.updateTrack({ trackId: event.trackId, updateTrackRequestV2: body })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrack) => {
          // A fade-only update must not drop the track's windows. updateTrack's
          // response may not carry them, so keep the ones we already have.
          const merged: Track = {
            ...(track ?? updatedTrack),
            ...updatedTrack,
            fadeInDurationMs: updatedTrack.fadeInDurationMs ?? body.fadeInDurationMs,
            fadeOutDurationMs: updatedTrack.fadeOutDurationMs ?? body.fadeOutDurationMs,
            trackWindows: updatedTrack.trackWindows ?? track?.trackWindows,
          };

          this.applyTrackUpdate(event.trackId, merged);
          this.toast.success(this.t('windows.msg.fadesUpdated'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.fades') }));
        },
      });
  }

  onReorderWindows(event: TrackWindowsReorderEvent): void {
    const body: ReorderTrackWindowsRequest = {
      windowIds: event.windowIds,
    };

    this.tracksApi.reorderTrackWindows({
      trackId: event.trackId,
      reorderTrackWindowsRequest: body,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrack) => {
          this.applyTrackUpdate(event.trackId, updatedTrack);
          this.toast.success(this.t('windows.msg.reordered'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.reorder') }));
        },
      });
  }

  onDeleteWindow(event: WindowDeleteEvent): void {
    this.tracksApi.deleteTrackWindow({
      trackId: event.trackId,
      windowId: event.windowId,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrack) => {
          this.applyTrackUpdate(event.trackId, updatedTrack);
          this.toast.success(this.t('windows.msg.deleted'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('windows.err.delete') }));
        },
      });
  }

  private applyTrackUpdate(trackId: number, updatedTrack: Track): void {
    this.tracks.update(current =>
      current.map(track => track.id === trackId ? updatedTrack : track),
    );

    if (this.windowTrack()?.id === trackId) {
      this.windowTrack.set(updatedTrack);
    }
  }

  private syncWindowTrack(mergedTracks: Track[]): void {
    const currentWindowTrack = this.windowTrack();
    if (currentWindowTrack?.id == null) return;

    const fresh = mergedTracks.find(track => track.id === currentWindowTrack.id) ?? null;
    this.windowTrack.set(fresh);
  }

  private mergeTracks(own: Track[], subscribed: Track[]): Track[] {
    const seen = new Set<number>();

    return [...own, ...subscribed].filter(track => {
      if (track.id == null || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  private appendError(message: string): void {
    this.errorMessage.update(current =>
      current ? (current.includes(message) ? current : `${current} ${message}`) : message,
    );
  }
}