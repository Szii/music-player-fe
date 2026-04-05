export interface WindowEditorAudioSourceLoadOptions {
  audioElement: HTMLAudioElement;
  useMse?: boolean;
  estimatedDurationS?: number;
  windowStartS?: number;
  bytesPerSecond?: number;

  /**
   * Force native audio element instead of MSE.
   */
  preferNative?: boolean;

  /**
   * Automatically prefer native playback when duration is above this threshold.
   * Default: 20 minutes.
   */
  nativeForLongTracksOverS?: number;

  /**
   * Keep downloaded chunks in memory so we can build a blob fallback.
   * Default: true for shorter tracks, false for long tracks.
   */
  keepAllChunks?: boolean;

  /**
   * Maximum bytes to keep in memory for blob fallback.
   * If exceeded, chunk retention is disabled and stored chunks are released.
   * Default: 96 MB.
   */
  maxStoredBytes?: number;
}

export class WindowEditorAudioSourceManager {
  storedChunks: ArrayBuffer[] = [];
  totalStoredBytes = 0;
  totalDownloadedBytes = 0;
  streamComplete = false;
  seekableMaxS = 0;

  usingMse = false;
  usingBlob = false;
  usingNative = false;

  onProgress:
    | ((totalBytes: number, complete: boolean, seekableMaxS: number) => void)
    | null = null;

  onError: ((message: string) => void) | null = null;

  private cachedBlob: Blob | null = null;

  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private mseObjectUrl: string | null = null;
  private blobObjectUrl: string | null = null;

  private fetchAbort: AbortController | null = null;
  private activeUrl: string | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private estimatedDurationS = 0;
  private windowStartS = 0;
  private bytesPerSecond = 24_000;

  private loadToken = 0;
  private firstPlayableResolved = false;
  private firstPlayablePromise: Promise<void> = Promise.resolve();
  private firstPlayableResolve: (() => void) | null = null;

  private nativeCleanup: (() => void) | null = null;

  private keepAllChunks = true;
  private maxStoredBytes = 96 * 1024 * 1024;
  private maxBufferedLocalEndS = 0;
  private blobSnapshotStoredBytes = 0;

  private get downloadedLocalEndS(): number {
    if (this.streamComplete) {
      return this.estimatedDurationS;
    }
    // Use stored bytes (blob extent) — not MSE buffer end which plateaus during eviction
    if (this.totalStoredBytes > 0) {
      return this.totalStoredBytes / this.bytesPerSecond;
    }
    return this.totalDownloadedBytes / this.bytesPerSecond;
  }

  async load(
    url: string,
    options: WindowEditorAudioSourceLoadOptions,
  ): Promise<void> {
    this.destroy();

    const token = ++this.loadToken;

    this.activeUrl = url;
    this.audioElement = options.audioElement;
    this.estimatedDurationS = options.estimatedDurationS ?? 0;
    this.windowStartS = options.windowStartS ?? 0;

    if (options.bytesPerSecond) {
      this.bytesPerSecond = options.bytesPerSecond;
    }

    const nativeForLongTracksOverS = options.nativeForLongTracksOverS ?? 20 * 60;
    const shouldPreferNative =
      options.preferNative === true ||
      (this.estimatedDurationS > 0 && this.estimatedDurationS >= nativeForLongTracksOverS);

    this.keepAllChunks =
      options.keepAllChunks ??
      !shouldPreferNative;

    this.maxStoredBytes = options.maxStoredBytes ?? 96 * 1024 * 1024;

    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.totalDownloadedBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = this.windowStartS;
    this.maxBufferedLocalEndS = 0;
    this.usingBlob = false;
    this.usingMse = false;
    this.usingNative = false;

    this.resetFirstPlayable();

    const abort = new AbortController();
    this.fetchAbort = abort;

    const audio = this.audioElement;
    if (!audio) {
      return;
    }

    const canUseMse =
      options.useMse !== false &&
      !shouldPreferNative &&
      'MediaSource' in window &&
      MediaSource.isTypeSupported('audio/mpeg');

    if (!canUseMse) {
      this.attachNative(audio, url, abort.signal, token);
      await this.waitForDirectAudioReady(audio, abort.signal);
      this.resolveFirstPlayable();
      return;
    }

    await this.setupMse(audio, abort.signal);
    void this.fetchStream(url, abort, token);
    await this.firstPlayablePromise;
  }

  getBlob(): Blob | null {
    if (this.storedChunks.length === 0 && !this.cachedBlob) {
      return null;
    }

    if (this.cachedBlob) {
      return this.cachedBlob;
    }

    const blob = new Blob(this.storedChunks, { type: 'audio/mpeg' });

    if (this.streamComplete) {
      this.cachedBlob = blob;
    }

    return blob;
  }

  getBlobUrl(): string | null {
    const blob = this.getBlob();
    if (!blob) {
      return null;
    }

    if (this.blobObjectUrl) {
      return this.blobObjectUrl;
    }

    this.blobObjectUrl = URL.createObjectURL(blob);
    return this.blobObjectUrl;
  }

  switchToBlobSrc(seekToS: number, wasPlaying: boolean): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    if (this.usingNative) {
      try {
        audio.currentTime = seekToS;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('window-editor native play after seek failed', error);
        });
      }

      return true;
    }

    if (!this.keepAllChunks && !this.cachedBlob) {
      return false;
    }

    if (!this.isBlobSeekable(seekToS)) {
      return false;
    }

    if (this.usingBlob && this.isCurrentBlobSnapshotFresh()) {
      try {
        audio.currentTime = seekToS;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('window-editor blob play after seek failed', error);
        });
      }

      return true;
    }

    this.tearDownMse();
    this.usingMse = false;

    const src = this.rebuildBlobObjectUrl();
    if (!src) {
      return false;
    }

    this.assignSourceAndSeek(
      audio,
      src,
      seekToS,
      wasPlaying,
      'window-editor play after blob switch failed',
    );

    return true;
  }

  private isCurrentBlobSnapshotFresh(): boolean {
    return !!this.blobObjectUrl && this.blobSnapshotStoredBytes === this.totalStoredBytes;
  }

  private rebuildBlobObjectUrl(): string | null {
    const blob = this.getBlob();
    if (!blob) {
      return null;
    }

    if (this.blobObjectUrl) {
      URL.revokeObjectURL(this.blobObjectUrl);
    }

    this.blobObjectUrl = URL.createObjectURL(blob);
    this.blobSnapshotStoredBytes = this.totalStoredBytes;
    this.usingBlob = true;
    this.usingNative = false;

    return this.blobObjectUrl;
  }

  isInMseBuffer(targetS: number): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    if (this.usingNative) {
      return true;
    }

    for (let i = 0; i < audio.buffered.length; i++) {
      if (
        audio.buffered.start(i) - 0.5 <= targetS &&
        audio.buffered.end(i) + 0.5 >= targetS
      ) {
        return true;
      }
    }

    return false;
  }

  isBlobSeekable(targetS: number): boolean {
    if (this.usingNative) {
      return true;
    }

    return targetS >= 0 && targetS <= this.downloadedLocalEndS + 0.5;
  }

  get downloadedPercent(): number {
    if (this.usingNative) {
      const end = this.getNativeSeekableEndS();
      const targetEnd = this.windowStartS + this.estimatedDurationS;

      if (this.estimatedDurationS <= 0 || targetEnd <= this.windowStartS) {
        return 0;
      }

      if (end >= targetEnd - 0.25) {
        return 100;
      }

      return Math.max(
        0,
        Math.min(99, ((end - this.windowStartS) / this.estimatedDurationS) * 100),
      );
    }

    if (this.estimatedDurationS <= 0) {
      return 0;
    }

    if (this.streamComplete) {
      return 100;
    }

    if (this.maxBufferedLocalEndS > 0) {
      return Math.max(
        0,
        Math.min(99, (this.maxBufferedLocalEndS / this.estimatedDurationS) * 100),
      );
    }

    if (this.totalDownloadedBytes === 0) {
      return 0;
    }

    const estimatedTotalBytes = this.bytesPerSecond * this.estimatedDurationS;
    return Math.min(99, (this.totalDownloadedBytes / estimatedTotalBytes) * 100);
  }

  get estimatedDownloadedS(): number {
    if (this.usingNative) {
      return this.getNativeSeekableEndS();
    }

    if (this.streamComplete) {
      return this.windowStartS + this.estimatedDurationS;
    }

    return this.windowStartS + this.downloadedLocalEndS;
  }

  abort(): void {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
  }

  destroy(): void {
    this.loadToken++;
    this.abort();
    this.tearDownMse();
    this.tearDownBlob();
    this.tearDownNative();

    this.activeUrl = null;
    this.audioElement = null;
    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.totalDownloadedBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = 0;
    this.maxBufferedLocalEndS = 0;
    this.usingMse = false;
    this.usingBlob = false;
    this.usingNative = false;
    this.keepAllChunks = true;
    this.maxStoredBytes = 96 * 1024 * 1024;
    this.blobSnapshotStoredBytes = 0;

    this.resetFirstPlayable();
  }

  private attachNative(
    audio: HTMLAudioElement,
    url: string,
    signal: AbortSignal,
    token: number,
  ): void {
    this.usingNative = true;
    this.usingMse = false;
    this.usingBlob = false;

    const emitProgress = () => {
      if (signal.aborted || token !== this.loadToken) {
        return;
      }

      const end = this.getNativeSeekableEndS();
      this.seekableMaxS = Math.max(this.windowStartS, end);

      const targetEnd = this.windowStartS + this.estimatedDurationS;
      const complete =
        this.estimatedDurationS > 0 && end >= targetEnd - 0.25;

      if (complete) {
        this.streamComplete = true;
      }

      this.onProgress?.(this.totalDownloadedBytes, complete, this.seekableMaxS);
    };

    const onReady = () => {
      emitProgress();
      this.resolveFirstPlayable();
    };

    const onError = () => {
      if (signal.aborted || token !== this.loadToken) {
        return;
      }

      this.onError?.('Stream fetch error');
    };

    audio.src = url;
    audio.load();

    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('loadeddata', onReady);
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('progress', emitProgress);
    audio.addEventListener('timeupdate', emitProgress);
    audio.addEventListener('seeked', emitProgress);
    audio.addEventListener('durationchange', emitProgress);
    audio.addEventListener('error', onError);

    this.nativeCleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('progress', emitProgress);
      audio.removeEventListener('timeupdate', emitProgress);
      audio.removeEventListener('seeked', emitProgress);
      audio.removeEventListener('durationchange', emitProgress);
      audio.removeEventListener('error', onError);
    };
  }

  private getNativeSeekableEndS(): number {
    const audio = this.audioElement;
    if (!audio) {
      return this.windowStartS;
    }

    try {
      if (audio.seekable.length > 0) {
        return Math.floor(audio.seekable.end(audio.seekable.length - 1));
      }
    } catch {}

    try {
      if (audio.buffered.length > 0) {
        return Math.floor(audio.buffered.end(audio.buffered.length - 1));
      }
    } catch {}

    return Math.max(this.windowStartS, Math.floor(audio.currentTime || 0));
  }

  private getMseBufferedLocalEndS(): number {
    const sourceBuffer = this.sourceBuffer;
    if (sourceBuffer) {
      try {
        if (sourceBuffer.buffered.length > 0) {
          return sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
        }
      } catch {}
    }

    const audio = this.audioElement;
    if (audio) {
      try {
        if (audio.buffered.length > 0) {
          return audio.buffered.end(audio.buffered.length - 1);
        }
      } catch {}
    }

    return 0;
  }


  private emitProgress(complete: boolean): void {
    let seekable = this.windowStartS;

    if (complete) {
      seekable = this.windowStartS + this.estimatedDurationS;
      this.maxBufferedLocalEndS = Math.max(this.maxBufferedLocalEndS, this.estimatedDurationS);
    } else if (this.usingNative) {
      seekable = this.getNativeSeekableEndS();
    } else if (this.usingMse) {
      const bufferedEndLocal = Math.max(0, this.getMseBufferedLocalEndS());
      if (bufferedEndLocal > 0) {
        this.maxBufferedLocalEndS = Math.max(this.maxBufferedLocalEndS, bufferedEndLocal);
      }
      // Report seekable based on stored bytes (blob extent), not MSE buffer which plateaus during eviction
      seekable = this.windowStartS + this.downloadedLocalEndS;
    } else if (this.usingBlob) {
      seekable = this.windowStartS + this.downloadedLocalEndS;
    } else {
      seekable = this.estimatedDownloadedS;
    }

    if (this.estimatedDurationS > 0) {
      seekable = Math.min(seekable, this.windowStartS + this.estimatedDurationS);
    }

    this.seekableMaxS = Math.max(this.seekableMaxS, seekable);
    this.onProgress?.(this.totalDownloadedBytes, complete, this.seekableMaxS);
  }

  private async fetchStream(
    url: string,
    abort: AbortController,
    token: number,
  ): Promise<void> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch(url, { signal: abort.signal });

      if (!response.ok || !response.body) {
        this.onError?.(`Stream fetch failed: HTTP ${response.status}`);
        return;
      }

      reader = response.body.getReader();

      while (true) {
        if (abort.signal.aborted || this.activeUrl !== url || token !== this.loadToken) {
          break;
        }

        const { done, value } = await reader.read();

        if (done) {
          this.streamComplete = true;

          if (this.keepAllChunks && this.storedChunks.length > 0) {
            this.cachedBlob = new Blob(this.storedChunks, { type: 'audio/mpeg' });
          }

          if (this.usingMse && this.mediaSource?.readyState === 'open') {
            const sb = this.sourceBuffer;

            if (sb?.updating) {
              await this.waitForUpdateEnd(sb, abort.signal);
            }

            try {
              if (sb && sb.buffered.length > 0 && this.mediaSource.readyState === 'open') {
                const finalBufferedEnd = sb.buffered.end(sb.buffered.length - 1);

                if (isFinite(finalBufferedEnd) && finalBufferedEnd > 0) {
                  this.mediaSource.duration = finalBufferedEnd;
                }
              }
            } catch (error) {
              console.warn('window-editor MSE duration finalize failed', error);
            }

            try {
              if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
              }
            } catch (error) {
              console.warn('window-editor endOfStream failed', error);
            }
          }

          this.emitProgress(true);
          this.resolveFirstPlayable();
          break;
        }

        if (!value) {
          break;
        }

        const chunkBuffer = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ) as ArrayBuffer;

        this.totalDownloadedBytes += value.byteLength;
        this.storeChunk(chunkBuffer, value.byteLength);

        // Report progress immediately based on stored bytes — not gated on MSE append
        this.emitProgress(false);

        if (this.usingMse && this.sourceBuffer && this.mediaSource?.readyState === 'open') {
          const sb = this.sourceBuffer;

          try {
            if (sb.updating) {
              await this.waitForUpdateEnd(sb, abort.signal);
            }

            if (abort.signal.aborted || this.activeUrl !== url || token !== this.loadToken) {
              break;
            }

            if (this.mediaSource?.readyState === 'open' && this.usingMse) {
              sb.appendBuffer(chunkBuffer);
              await this.waitForUpdateEnd(sb, abort.signal);

              const bufferedEndLocal = this.getMseBufferedLocalEndS();
              if (bufferedEndLocal > 0) {
                this.maxBufferedLocalEndS = Math.max(this.maxBufferedLocalEndS, bufferedEndLocal);
              }

              this.resolveFirstPlayable();
            }
          } catch (error) {
            if ((error as DOMException)?.name === 'QuotaExceededError') {
              await this.handleQuotaExceeded(sb, chunkBuffer, abort.signal);
            } else {
              console.warn('window-editor appendBuffer error', error);
              await this.sleep(50, abort.signal);
            }
          }
        } else {
          this.resolveFirstPlayable();
        }
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('window-editor stream fetch error', error);
        this.onError?.('Stream fetch error');
      }
    } finally {
      try {
        await reader?.cancel();
      } catch {}
    }
  }

  private storeChunk(chunkBuffer: ArrayBuffer, chunkByteLength: number): void {
    if (!this.keepAllChunks) {
      return;
    }

    if (this.totalStoredBytes + chunkByteLength > this.maxStoredBytes) {
      this.keepAllChunks = false;
      this.storedChunks = [];
      this.totalStoredBytes = 0;
      this.cachedBlob = null;
      return;
    }

    this.cachedBlob = null;
    this.storedChunks.push(chunkBuffer);
    this.totalStoredBytes += chunkByteLength;
  }

  private async handleQuotaExceeded(
    sourceBuffer: SourceBuffer,
    chunkBuffer: ArrayBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    const audio = this.audioElement;

    if (audio && sourceBuffer.buffered.length > 0) {
      const currentTime = audio.currentTime || 0;
      const bufferStart = sourceBuffer.buffered.start(0);

      // Keep a wider safety margin for long tracks.
      const evictUpTo = Math.max(0, currentTime - 30);

      if (evictUpTo > bufferStart + 1) {
        try {
          if (!sourceBuffer.updating) {
            sourceBuffer.remove(bufferStart, evictUpTo);
            await this.waitForUpdateEnd(sourceBuffer, signal);
          }
        } catch (removeError) {
          console.warn('window-editor MSE eviction failed', removeError);
        }
      }

      try {
        if (!sourceBuffer.updating && this.mediaSource?.readyState === 'open') {
          sourceBuffer.appendBuffer(chunkBuffer);
          await this.waitForUpdateEnd(sourceBuffer, signal);

          const bufferedEndLocal = this.getMseBufferedLocalEndS();
          if (bufferedEndLocal > 0) {
            this.maxBufferedLocalEndS = Math.max(this.maxBufferedLocalEndS, bufferedEndLocal);
          }

          this.emitProgress(false);
          this.resolveFirstPlayable();
          return;
        }
      } catch (retryError) {
        console.warn('window-editor append retry failed', retryError);
      }
    }

    await this.sleep(100, signal);
  }

  private async setupMse(
    audio: HTMLAudioElement,
    signal: AbortSignal,
  ): Promise<void> {
    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    this.mseObjectUrl = URL.createObjectURL(mediaSource);
    audio.src = this.mseObjectUrl;
    this.usingMse = true;
    this.usingNative = false;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();

        if (!MediaSource.isTypeSupported('audio/mpeg')) {
          reject(new Error('audio/mpeg not supported by MSE'));
          return;
        }

        try {
          this.sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const cleanup = () => {
        mediaSource.removeEventListener('sourceopen', onOpen);
        signal.removeEventListener('abort', onAbort);
      };

      mediaSource.addEventListener('sourceopen', onOpen, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async waitForDirectAudioReady(
    audio: HTMLAudioElement,
    signal: AbortSignal,
  ): Promise<void> {
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const cleanup = () => {
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('loadedmetadata', onReady);
        signal.removeEventListener('abort', onAbort);
      };

      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('loadedmetadata', onReady, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private assignSourceAndSeek(
    audio: HTMLAudioElement,
    src: string,
    seekToS: number,
    wasPlaying: boolean,
    logPrefix: string,
  ): void {
    const applySeek = () => {
      try {
        audio.currentTime = Math.max(0, seekToS);
      } catch {}

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn(logPrefix, error);
        });
      }
    };

    audio.src = src;
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      applySeek();
      return;
    }

    const onLoadedMetadata = () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      applySeek();
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
  }

  private tearDownMse(): void {
    if (this.mediaSource?.readyState === 'open') {
      try {
        if (this.sourceBuffer?.updating) {
          try {
            this.sourceBuffer.abort();
          } catch {}
        }

        this.mediaSource.endOfStream();
      } catch {}
    }

    if (this.mseObjectUrl) {
      URL.revokeObjectURL(this.mseObjectUrl);
      this.mseObjectUrl = null;
    }

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.usingMse = false;
  }

  private tearDownBlob(): void {
    if (this.blobObjectUrl) {
      URL.revokeObjectURL(this.blobObjectUrl);
      this.blobObjectUrl = null;
    }

    this.usingBlob = false;
  }

  private tearDownNative(): void {
    this.nativeCleanup?.();
    this.nativeCleanup = null;
    this.usingNative = false;
  }

  private waitForUpdateEnd(
    sourceBuffer: SourceBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!sourceBuffer.updating) {
        resolve();
        return;
      }

      const onEnd = () => {
        cleanup();
        resolve();
      };

      const onAbort = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        sourceBuffer.removeEventListener('updateend', onEnd);
        signal.removeEventListener('abort', onAbort);
      };

      sourceBuffer.addEventListener('updateend', onEnd, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  private resetFirstPlayable(): void {
    this.firstPlayableResolved = false;
    this.firstPlayablePromise = new Promise<void>((resolve) => {
      this.firstPlayableResolve = resolve;
    });
  }

  private resolveFirstPlayable(): void {
    if (this.firstPlayableResolved) {
      return;
    }

    this.firstPlayableResolved = true;
    this.firstPlayableResolve?.();
    this.firstPlayableResolve = null;
  }
}