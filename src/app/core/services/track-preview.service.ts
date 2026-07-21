import { Injectable, NgZone, inject, signal } from '@angular/core';
import {
  YoutubeIframeApiService,
  YT_EMBED_HOST,
} from './youtube-iframe-api.service';

/** How long a preview snippet plays before it stops itself. */
const PREVIEW_SECONDS = 10;
/** Quick fade in/out at the ends of a snippet so it doesn't jump in or cut off. */
const FADE_MS = 500;
const FADE_STEPS = 12;
/** Peak preview volume (0–100). Previews are a quick check, not full playback. */
const PREVIEW_VOLUME = 50;

/**
 * Plays a short, non-looping snippet of a track (or window) so the user can hear
 * how it sounds while editing. Deliberately simple: one shared hidden YouTube
 * player, one snippet at a time, auto-stops after {@link PREVIEW_SECONDS}. No
 * pause, seek, loop or crossfade — that lives in the board/window players.
 *
 * `activeKey` lets a button reflect whether it is the one currently previewing.
 * ponytail: single global player, fine for previews; a per-row player pool would
 * only matter if simultaneous previews were ever needed.
 */
@Injectable({ providedIn: 'root' })
export class TrackPreviewService {
  private readonly api = inject(YoutubeIframeApiService);
  private readonly zone = inject(NgZone);

  private player: YT.Player | null = null;
  private creating: Promise<YT.Player | null> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  /** Bumped on every play/stop so a stale async continuation can bail. */
  private token = 0;

  private readonly _activeKey = signal<string | null>(null);
  /** Key of the item currently previewing, or null. */
  readonly activeKey = this._activeKey.asReadonly();

  readonly previewSeconds = PREVIEW_SECONDS;

  /** Warm up the shared player ahead of time so the first click plays instantly
      (and keeps the play call inside the user gesture, so autoplay is allowed). */
  preload(): void {
    void this.ensurePlayer();
  }

  /** Start a snippet for `videoId` from `startS`. Replaces any current preview. */
  async play(key: string, videoId: string, startS = 0): Promise<void> {
    if (!videoId) return;

    const myToken = ++this.token;
    this.clearTimers();
    this._activeKey.set(key);

    const player = await this.ensurePlayer();
    if (!player || myToken !== this.token) return;

    player.loadVideoById(videoId, Math.max(0, Math.floor(startS)));
    player.playVideo();

    // Fade in from silence.
    this.rampVolume(0, PREVIEW_VOLUME, myToken);

    // Schedule the fade-out so it finishes exactly at the snippet's end.
    this.stopTimer = setTimeout(() => {
      if (myToken === this.token) {
        this.rampVolume(PREVIEW_VOLUME, 0, myToken, () => this.stop());
      }
    }, Math.max(0, PREVIEW_SECONDS * 1000 - FADE_MS));
  }

  stop(): void {
    this.token++;
    this.clearTimers();
    if (this.player) {
      try {
        this.player.stopVideo();
      } catch {
        // player already gone / not ready — nothing to stop
      }
    }
    this._activeKey.set(null);
  }

  /** Ramp the player volume `from` → `to` over {@link FADE_MS}, then run `onDone`. */
  private rampVolume(from: number, to: number, token: number, onDone?: () => void): void {
    this.clearFadeTimer();

    try {
      this.player?.setVolume(from);
    } catch {
      // not ready — the ramp below will keep trying
    }

    let step = 0;
    this.fadeTimer = setInterval(() => {
      if (token !== this.token) {
        this.clearFadeTimer();
        return;
      }
      step++;
      const volume = Math.round(from + (to - from) * (step / FADE_STEPS));
      try {
        this.player?.setVolume(Math.max(0, Math.min(100, volume)));
      } catch {
        // ignore — onDone / stop handles teardown
      }
      if (step >= FADE_STEPS) {
        this.clearFadeTimer();
        onDone?.();
      }
    }, FADE_MS / FADE_STEPS);
  }

  private clearTimers(): void {
    if (this.stopTimer != null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.clearFadeTimer();
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer != null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private ensurePlayer(): Promise<YT.Player | null> {
    if (this.player) return Promise.resolve(this.player);
    if (this.creating) return this.creating;

    const mount = document.createElement('div');
    // Off-screen, audio-only mount.
    mount.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(mount);

    this.creating = this.api
      .load()
      .then(
        yt =>
          new Promise<YT.Player | null>(resolve => {
            const player = new yt.Player(mount, {
              host: YT_EMBED_HOST,
              width: 1,
              height: 1,
              playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
              },
              events: {
                onReady: () =>
                  this.zone.run(() => {
                    this.player = player;
                    this.creating = null;
                    resolve(player);
                  }),
                onError: () => this.zone.run(() => this.stop()),
              },
              // `host` is a real runtime option but missing from @types/youtube.
            } as YT.PlayerOptions & { host: string });
          }),
      )
      .catch(() => {
        this.creating = null;
        return null;
      });

    return this.creating;
  }
}
