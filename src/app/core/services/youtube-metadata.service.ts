import { Injectable, NgZone, inject } from '@angular/core';
import {
  YoutubeIframeApiService,
  YT_EMBED_HOST,
} from './youtube-iframe-api.service';

export interface YoutubeMetadata {
  /** The original YouTube video title. */
  title: string;
  /** Track duration in seconds. */
  durationS: number;
}

/**
 * Reads YouTube video metadata (title + duration) client-side via a throwaway,
 * off-screen IFrame player. Used by the client-side track-create flow to fill
 * the fields the backend can no longer fetch itself (it's IP-locked out of
 * YouTube).
 *
 * The player is muted and auto-played so the video buffers enough to expose
 * `getDuration()` / `getVideoData()`, then destroyed.
 */
@Injectable({ providedIn: 'root' })
export class YoutubeMetadataService {
  private static readonly TIMEOUT_MS = 12_000;

  private readonly api = inject(YoutubeIframeApiService);
  private readonly zone = inject(NgZone);

  fetchMetadata(videoId: string): Promise<YoutubeMetadata> {
    return this.api.load().then(
      (yt) =>
        new Promise<YoutubeMetadata>((resolve, reject) => {
          const host = document.createElement('div');
          host.style.position = 'fixed';
          host.style.left = '-10000px';
          host.style.top = '0';
          host.style.width = '320px';
          host.style.height = '180px';
          host.setAttribute('aria-hidden', 'true');
          document.body.appendChild(host);

          let player: YT.Player | null = null;
          let settled = false;
          let pollTimer: ReturnType<typeof setInterval> | null = null;
          let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

          const cleanup = () => {
            if (pollTimer !== null) clearInterval(pollTimer);
            if (timeoutTimer !== null) clearTimeout(timeoutTimer);
            try {
              player?.destroy();
            } catch {
              // ignore teardown races
            }
            host.remove();
          };

          const finish = (value: YoutubeMetadata) => {
            if (settled) return;
            settled = true;
            cleanup();
            this.zone.run(() => resolve(value));
          };

          const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            this.zone.run(() => reject(error));
          };

          const tryCapture = () => {
            if (!player) return;
            const durationS = player.getDuration?.() ?? 0;
            const title = player.getVideoData?.()?.title ?? '';
            if (durationS > 0 && title) {
              finish({ title, durationS });
            }
          };

          timeoutTimer = setTimeout(
            () => fail(new Error('Timed out reading YouTube metadata')),
            YoutubeMetadataService.TIMEOUT_MS,
          );

          player = new yt.Player(host, {
            // Privacy-enhanced domain — must match the CSP frame-src directive.
            host: YT_EMBED_HOST,
            width: 320,
            height: 180,
            videoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              fs: 0,
              playsinline: 1,
              rel: 0,
            },
            events: {
              onReady: () => {
                try {
                  player?.mute();
                  player?.playVideo();
                } catch {
                  // ignore — the poll/timeout still governs the outcome
                }
                tryCapture();
              },
              onStateChange: () => tryCapture(),
              onError: () => fail(new Error('YouTube could not load this video')),
            },
            // `host` is a real runtime option but missing from @types/youtube.
          } as YT.PlayerOptions & { host: string });

          pollTimer = setInterval(tryCapture, 250);
        }),
    );
  }
}
