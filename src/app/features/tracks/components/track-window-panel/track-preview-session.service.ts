import { Injectable, inject } from '@angular/core';
import { Observable, concat, of, timer } from 'rxjs';
import { catchError, map, startWith, switchMap, takeWhile } from 'rxjs/operators';

import { environment } from '../../../../../environments/environment';
import {
  MusicTracksService,
  // PlaybackService removed: backend stream/waveform endpoints are no longer in
  // the API spec. This legacy preview path is dormant while the YouTube IFrame
  // player is active (USE_YT_IFRAME_PLAYER).
  // PlaybackService,
  // PlaybackState,
  WaveformResponse,
} from '../../../../api/generated';

export interface TrackPreviewState {
  streamLoading: boolean;
  streamError: string | null;
  waveformLoading: boolean;
  waveformError: string | null;
  resolvedStreamUrl: string | null;
  resolvedDurationS: number;
  waveformPeaks: number[];
  complete: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TrackPreviewSessionService {
  private readonly tracksApi = inject(MusicTracksService);

  createSession(_trackId: number, initialDurationS = 0): Observable<TrackPreviewState> {
    // The backend stream (playTrack) and waveform (getTrackWaveform) endpoints
    // were removed from the API. This path is only reached on the legacy
    // (non-YouTube) editor, which is inactive, so surface a clear error state.
    return of(
      this.createStreamErrorState('Stream preview is unavailable.', initialDurationS),
    ).pipe(startWith(this.createInitialState(initialDurationS)));
  }

  /* Stream/waveform polling disabled — relied on the removed PlaybackService and
     MusicTracksService.getTrackWaveform endpoints.
  private pollWaveform(
    trackId: number,
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): Observable<TrackPreviewState> {
    return timer(0, 700).pipe(
      switchMap(() =>
        this.tracksApi.getTrackWaveform({ trackId }).pipe(
          map((response: WaveformResponse) =>
            this.mapWaveformResponse(response, resolvedStreamUrl, initialDurationS),
          ),
          catchError((error: unknown) => {
            console.warn('getTrackWaveform not ready yet', error);

            return of(
              this.createWaveformPendingState(resolvedStreamUrl, initialDurationS),
            );
          }),
        ),
      ),
      takeWhile((state) => !state.complete, true),
    );
  }
  */

  private mapWaveformResponse(
    response: WaveformResponse,
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): TrackPreviewState {
    const complete = !!response?.complete;
    const peaks = this.normalizePeaks(response?.peaks);
    const resolvedDurationS = this.resolveDuration(response?.durationS, initialDurationS);

    return {
      streamLoading: false,
      streamError: null,
      waveformLoading: !complete,
      waveformError: null,
      resolvedStreamUrl,
      resolvedDurationS,
      waveformPeaks: peaks,
      complete,
    };
  }

  private createInitialState(initialDurationS: number): TrackPreviewState {
    return {
      streamLoading: true,
      streamError: null,
      waveformLoading: false,
      waveformError: null,
      resolvedStreamUrl: null,
      resolvedDurationS: initialDurationS,
      waveformPeaks: [],
      complete: false,
    };
  }

  private createStreamReadyState(
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): TrackPreviewState {
    return {
      streamLoading: false,
      streamError: null,
      waveformLoading: true,
      waveformError: null,
      resolvedStreamUrl,
      resolvedDurationS: initialDurationS,
      waveformPeaks: [],
      complete: false,
    };
  }

  private createStreamErrorState(
    message: string,
    initialDurationS: number,
  ): TrackPreviewState {
    return {
      streamLoading: false,
      streamError: message,
      waveformLoading: false,
      waveformError: null,
      resolvedStreamUrl: null,
      resolvedDurationS: initialDurationS,
      waveformPeaks: [],
      complete: true,
    };
  }

  private createWaveformPendingState(
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): TrackPreviewState {
    return {
      streamLoading: false,
      streamError: null,
      waveformLoading: true,
      waveformError: null,
      resolvedStreamUrl,
      resolvedDurationS: initialDurationS,
      waveformPeaks: [],
      complete: false,
    };
  }

  private normalizePeaks(rawPeaks: unknown): number[] {
    if (!Array.isArray(rawPeaks)) {
      return [];
    }

    return rawPeaks.map((value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    });
  }

  private resolveDuration(rawDuration: unknown, fallback: number): number {
    const numeric = Number(rawDuration);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  private resolveStreamUrl(streamUrl: string | null): string | null {
    if (!streamUrl) {
      return null;
    }

    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
      return streamUrl;
    }

    const base = environment.apiUrl.replace(/\/$/, '');
    const path = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
    return `${base}${path}`;
  }
}