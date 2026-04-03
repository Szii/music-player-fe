// track-preview-session.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, startWith, switchMap, takeWhile } from 'rxjs/operators';

import { environment } from '../../../../../environments/environment';
import {
  MusicTracksService,
  PlaybackService,
  PlaybackState,
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
  private readonly playbackApi = inject(PlaybackService);
  private readonly tracksApi = inject(MusicTracksService);

  createSession(trackId: number, initialDurationS = 0): Observable<TrackPreviewState> {
    return this.playbackApi.playTrack({ trackId }).pipe(
      switchMap((playbackState: PlaybackState) => {
        const resolvedStreamUrl = this.resolveStreamUrl(playbackState?.streamUrl ?? null);

        if (!resolvedStreamUrl) {
          return of(
            this.createStreamErrorState('No stream URL returned.', initialDurationS),
          );
        }

        return this.pollWaveform(trackId, resolvedStreamUrl, initialDurationS);
      }),
      catchError((error: unknown) => {
        console.error('playTrack failed', error);

        return of(
          this.createStreamErrorState('Failed to start track playback.', initialDurationS),
        );
      }),
      startWith(this.createInitialState(initialDurationS)),
    );
  }

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
            console.error('getTrackWaveform failed', error);

            return of(
              this.createWaveformErrorState(resolvedStreamUrl, initialDurationS),
            );
          }),
        ),
      ),
      takeWhile((state) => !state.complete, true),
    );
  }

  private mapWaveformResponse(
    response: WaveformResponse,
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): TrackPreviewState {
    const complete = !!response?.complete;

    return {
      streamLoading: false,
      streamError: null,
      waveformLoading: !complete,
      waveformError: null,
      resolvedStreamUrl,
      resolvedDurationS: this.resolveDuration(response?.durationS, initialDurationS),
      waveformPeaks: this.normalizePeaks(response?.peaks),
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

  private createWaveformErrorState(
    resolvedStreamUrl: string,
    initialDurationS: number,
  ): TrackPreviewState {
    return {
      streamLoading: false,
      streamError: null,
      waveformLoading: false,
      waveformError: 'Failed to load waveform.',
      resolvedStreamUrl,
      resolvedDurationS: initialDurationS,
      waveformPeaks: [],
      complete: true,
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