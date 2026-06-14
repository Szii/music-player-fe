import {
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  WindowDeleteEvent,
  WindowSaveEvent,
} from '../../components/track-window-panel/track-window-panel.component';
import {
  CreateTrackRequestV2,
  MusicTracksService,
  Track,
  TrackRequest,
} from '../../../../api/generated';
import { USE_YT_IFRAME_PLAYER } from '../../../../core/config/feature-flags';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { YoutubeMetadataService } from '../../../../core/services/youtube-metadata.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlaybackService } from '../../../../core/services/board-playback.service';

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
  ],
  template: `
    <div class="app-page tracks-page">
      <ui-page-title title="Tracks" />

      <app-track-form
        #trackForm
        [editingTrackId]="editingTrackId()"
        [editTrackName]="editTrackName()"
        [editTrackLink]="editTrackLink()"
        [lockTrackLink]="editLockTrackLink()"
        [submitting]="createSubmitting()"
        [showTrigger]="tracks().length > 0"
        (save)="saveTrack($event)"
        (cancel)="cancelEdit()"
      />

      @if (errorMessage()) {
        <ui-alert variant="danger">
          {{ errorMessage() }}
        </ui-alert>
      }

      @if (!loading() && tracks().length === 0) {
        <ui-create-cta
          label="Create your first track"
          (clicked)="trackForm.open()"
        />
      } @else {
        <div class="tracks-page__section">
          <div class="tracks-page__table-wrap">
            <app-track-table
              [tracks]="tracks()"
              [loading]="loading()"
              (edit)="onEdit($event)"
              (remove)="onRemove($event)"
              (windows)="onWindows($event)"
            />
          </div>

          <hr class="tracks-page__divider" />
        </div>
      }

      <app-track-windows-panel
        [track]="windowTrack()"
        (close)="closeWindows()"
        (saveWindow)="onSaveWindow($event)"
        (deleteWindow)="onDeleteWindow($event)"
        (saveTrackFades)="onSaveTrackFades($event)"
      />
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .tracks-page {
      --track-table-max-height: calc(100dvh - 360px);
    }

    .tracks-page__subtitle {
      margin: 0 0 1rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--app-text);
    }

    /* Give the "+" trigger a deliberate gap from the toolbar below it.
       app-icon-button is display:contents, so without this the spacing is
       just an inline line-box. :has() keeps the margin off the empty state
       (no trigger → the create CTA renders instead). */
    app-track-form:has(app-icon-button) {
      display: block;
      margin-bottom: var(--space-sm);
    }

    .tracks-page__section {
      min-width: 0;
    }

    .tracks-page__table-wrap {
      --track-table-max-height: var(--track-table-max-height);
      min-height: 0;
    }

    .tracks-page__divider {
      border: none;
      border-top: var(--app-border);
    }

    @media (max-width: 900px) {
      .tracks-page {
        --track-table-max-height: calc(100dvh - 280px);
      }
    }
  `],
})
export class TracksPageComponent implements OnInit {
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
          this.appendError('Loading your tracks failed.');
          return of([] as Track[]);
        }),
      ),
      subscribedTracks: this.tracksApi.getUserSubscribedTracks().pipe(
        catchError((err: unknown) => {
          console.error(err);
          this.appendError('Loading subscribed tracks failed.');
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
          this.appendError('Loading tracks failed.');
        },
      });
  }

  saveTrack(event: TrackFormEvent): void {
    this.createSubmitting.set(true);

    const body: TrackRequest = {
      trackName: event.trackName || undefined,
      trackLink: event.trackLink,
    };

    const editingId = this.editingTrackId();

    if (editingId != null) {
      this.tracksApi.updateTrack({ trackId: editingId, trackRequest: body })
        .pipe(
          finalize(() => this.createSubmitting.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => {
            this.cancelEdit();
            this.loadTracks();
            this.toast.success('Track updated.');
          },
          error: (err: unknown) => {
            console.error(err);
            this.toast.error('Updating track failed.');
          },
        });
      return;
    }

    // Client-side YouTube path: the backend can no longer fetch the original
    // title/duration from YouTube, so read them here and use the v2 endpoint.
    if (USE_YT_IFRAME_PLAYER) {
      this.createTrackViaYoutube(event);
      return;
    }

    this.tracksApi.createTrack({ trackRequest: body })
      .pipe(
        finalize(() => this.createSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.onTrackCreated();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Creating track failed.');
        },
      });
  }

  private createTrackViaYoutube(event: TrackFormEvent): void {
    const videoId = parseYoutubeId(event.trackLink);

    if (!videoId) {
      this.createSubmitting.set(false);
      this.toast.error('Enter a valid YouTube link.');
      return;
    }

    this.ytMetadata.fetchMetadata(videoId)
      .then((meta) => {
        const body: CreateTrackRequestV2 = {
          trackName: event.trackName || undefined,
          trackOriginalName: meta.title,
          trackLink: event.trackLink,
          duration: Math.max(1, Math.round(meta.durationS)),
        };

        this.tracksApi.createTrackV2({ createTrackRequestV2: body })
          .pipe(
            finalize(() => this.createSubmitting.set(false)),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe({
            next: () => {
              this.onTrackCreated();
            },
            error: (err: unknown) => {
              console.error(err);
              this.toast.error('Creating track failed.');
            },
          });
      })
      .catch((err: unknown) => {
        console.error(err);
        this.createSubmitting.set(false);
        this.toast.error('Could not read the YouTube video — check the link.');
      });
  }

  private onTrackCreated(): void {
    this.trackForm?.close();
    this.loadTracks();
    this.toast.success('Track created.');
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
      title: 'Delete track',
      message: `Delete track "${track.trackName || track.id}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
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

          this.toast.success('Track deleted.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Deleting track failed.');
        },
      });
  }

  async onWindows(track: Track): Promise<void> {
    if (this.boardPlayback.isAnyPlaying()) {
      const confirmed = await this.confirmDialog.confirm({
        title: 'Stop playback?',
        message: 'Opening the window editor will stop all playing boards. Continue?',
        confirmText: 'Stop & edit',
        cancelText: 'Cancel',
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
          this.toast.success(event.windowId != null ? 'Window updated.' : 'Window created.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(
            event.windowId != null ? 'Updating window failed.' : 'Creating window failed.',
          );
        },
      });
  }

  onSaveTrackFades(event: TrackFadesSaveEvent): void {
    const track = this.tracks().find(t => t.id === event.trackId);
    const trackLink = track?.trackLink;

    // updateTrack requires a trackLink; without it we can't persist the fades.
    if (!trackLink) {
      this.toast.error('Saving track fades failed.');
      return;
    }

    const body: TrackRequest = {
      trackName: track?.trackName || undefined,
      trackLink,
      fadeInDurationMs: event.fadeInMs,
      fadeOutDurationMs: event.fadeOutMs,
    };

    this.tracksApi.updateTrack({ trackId: event.trackId, trackRequest: body })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrack) => {
          // A fade-only update must not drop the track's windows. updateTrack's
          // response doesn't carry them, so keep the ones we already have.
          const merged: Track = {
            ...updatedTrack,
            trackWindows: updatedTrack.trackWindows ?? track?.trackWindows,
          };
          this.applyTrackUpdate(event.trackId, merged);
          this.toast.success('Track fades updated.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Saving track fades failed.');
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
          this.toast.success('Window deleted.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error('Deleting window failed.');
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