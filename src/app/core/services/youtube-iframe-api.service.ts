import { Injectable } from '@angular/core';

/**
 * Privacy-enhanced embed host. Must stay in sync with the CSP `frame-src`
 * directive in nginx.conf.template; both YT player call sites use it so the
 * embed origin can't drift away from what the CSP allows.
 */
export const YT_EMBED_HOST = 'https://www.youtube-nocookie.com';

/**
 * Loads the YouTube IFrame Player API script exactly once and resolves when the
 * global `YT` namespace is ready to construct players.
 *
 * The API invokes `window.onYouTubeIframeAPIReady` after the script finishes
 * loading; we chain any previously registered callback so we never clobber a
 * handler set elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class YoutubeIframeApiService {
  private static readonly SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

  private ready: Promise<typeof YT> | null = null;

  load(): Promise<typeof YT> {
    if (this.ready) {
      return this.ready;
    }

    this.ready = new Promise<typeof YT>((resolve, reject) => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        if (window.YT?.Player) {
          resolve(window.YT);
        } else {
          reject(new Error('YouTube IFrame API loaded without YT.Player'));
        }
      };

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${YoutubeIframeApiService.SCRIPT_SRC}"]`,
      );
      if (existing) {
        return;
      }

      const script = document.createElement('script');
      script.src = YoutubeIframeApiService.SCRIPT_SRC;
      script.async = true;
      script.onerror = () =>
        reject(new Error('Failed to load the YouTube IFrame API script'));
      document.head.appendChild(script);
    });

    return this.ready;
  }
}
