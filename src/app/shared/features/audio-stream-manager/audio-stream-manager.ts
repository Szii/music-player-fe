export class AudioStreamManager {
  storedChunks: ArrayBuffer[] = [];
  totalStoredBytes = 0;
  streamComplete = false;
  cachedBlob: Blob | null = null;

  seekableMaxS = 0;

  usingMse = false;
  usingBlob = false;

  onProgress: ((totalBytes: number, complete: boolean, seekableMaxS: number) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private mseObjectUrl: string | null = null;
  private blobObjectUrl: string | null = null;

  private fetchAbort: AbortController | null = null;
  private activeUrl: string | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private estimatedDurationS = 0;
  private windowStartS = 0;
  private bytesPerSecond = 24_000; // 192 kbps default

  async load(
    url: string,
    options: {
      audioElement?: HTMLAudioElement;
      useMse?: boolean;
      estimatedDurationS?: number;
      windowStartS?: number;
      bytesPerSecond?: number;
    } = {},
  ): Promise<void> {
    this.destroy();

    this.activeUrl = url;
    this.audioElement = options.audioElement ?? null;
    this.estimatedDurationS = options.estimatedDurationS ?? 0;
    this.windowStartS = options.windowStartS ?? 0;
    if (options.bytesPerSecond) this.bytesPerSecond = options.bytesPerSecond;

    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = this.windowStartS;
    this.usingBlob = false;
    this.usingMse = false;

    const abort = new AbortController();
    this.fetchAbort = abort;

    if (options.useMse && this.audioElement && ('MediaSource' in window)) {
      this.setupMse(this.audioElement);
    }

    await this.fetchStream(url, abort);
  }

  getBlob(): Blob | null {
    if (this.storedChunks.length === 0) return null;
    if (this.cachedBlob) return this.cachedBlob;

    const blob = new Blob(this.storedChunks, { type: 'audio/mpeg' });
    if (this.streamComplete) this.cachedBlob = blob;
    return blob;
  }

  getArrayBuffer(): ArrayBuffer | null {
    if (this.storedChunks.length === 0) return null;

    const total = this.totalStoredBytes;
    const result = new ArrayBuffer(total);
    const view = new Uint8Array(result);

    let offset = 0;
    for (const chunk of this.storedChunks) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return result;
  }

  getBlobUrl(): string | null {
    const blob = this.getBlob();
    if (!blob) return null;
    if (this.blobObjectUrl) return this.blobObjectUrl;

    this.blobObjectUrl = URL.createObjectURL(blob);
    return this.blobObjectUrl;
  }

  switchToBlobSrc(seekToS: number, wasPlaying: boolean): void {
    const audio = this.audioElement;
    if (!audio || this.storedChunks.length === 0) return;

    this.tearDownMse();
    this.usingMse = false;

    if (this.blobObjectUrl) URL.revokeObjectURL(this.blobObjectUrl);

    const blob = this.getBlob()!;
    this.blobObjectUrl = URL.createObjectURL(blob);
    this.usingBlob = true;

    audio.src = this.blobObjectUrl;
    audio.currentTime = seekToS;

    if (wasPlaying) {
      audio.play().catch(err => console.warn('play after blob switch failed', err));
    }
  }

  isInMseBuffer(targetS: number): boolean {
    const audio = this.audioElement;
    if (!audio) return false;

    for (let i = 0; i < audio.buffered.length; i++) {
      if (audio.buffered.start(i) - 0.5 <= targetS && audio.buffered.end(i) + 0.5 >= targetS) {
        return true;
      }
    }
    return false;
  }

  isBlobSeekable(targetS: number): boolean {
    const audio = this.audioElement;
    if (!audio) return false;
    return isFinite(audio.duration) && targetS <= audio.duration + 0.5;
  }

  get downloadedPercent(): number {
    const effDur = this.estimatedDurationS;
    if (effDur <= 0 || this.totalStoredBytes === 0) return 0;
    if (this.streamComplete) return 100;

    const estimatedTotal = this.bytesPerSecond * effDur;
    return Math.min(99, (this.totalStoredBytes / estimatedTotal) * 100);
  }

  get estimatedDownloadedS(): number {
    if (this.streamComplete) return this.windowStartS + this.estimatedDurationS;
    if (this.totalStoredBytes === 0) return this.windowStartS;
    return this.windowStartS + (this.totalStoredBytes / this.bytesPerSecond);
  }

  abort(): void {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
  }

  destroy(): void {
    this.abort();
    this.tearDownMse();
    this.tearDownBlob();

    this.activeUrl = null;
    this.audioElement = null;
    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = 0;
    this.usingMse = false;
    this.usingBlob = false;
  }

  private async fetchStream(url: string, abort: AbortController): Promise<void> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok || !response.body) {
        this.onError?.(`Stream fetch failed: HTTP ${response.status}`);
        return;
      }

      reader = response.body.getReader();

      while (true) {
        if (abort.signal.aborted || this.activeUrl !== url) break;

        const { done, value } = await reader.read();

        if (done) {

          console.log('[fetch done reached]', {
            totalStoredBytes: this.totalStoredBytes,
            estimatedDurationS: this.estimatedDurationS,
            usingMse: this.usingMse,
            mediaSourceReadyState: this.mediaSource?.readyState ?? null,
            sourceBufferUpdating: this.sourceBuffer?.updating ?? null,
            sourceBufferBufferedEnd:
              this.sourceBuffer && this.sourceBuffer.buffered.length > 0
                ? this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1)
                : null,
          });


          this.streamComplete = true;
          this.cachedBlob = new Blob(this.storedChunks, { type: 'audio/mpeg' });
          this.seekableMaxS = this.windowStartS + this.estimatedDurationS;
          this.onProgress?.(this.totalStoredBytes, true, this.seekableMaxS);

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
            } catch (e) {
              console.warn('failed to finalize MSE duration', e);
            }

            try {
              if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
              }
            } catch (e) {
              console.warn('endOfStream failed', e);
            }
          }

          break;
        }

        if (abort.signal.aborted || this.activeUrl !== url) break;

        const chunkBuffer = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ) as ArrayBuffer;

        this.storedChunks.push(chunkBuffer);
        this.totalStoredBytes += value.byteLength;

              if (this.estimatedDurationS - this.estimatedDownloadedS < 10) {
        console.log('[chunk near end]', {
          chunkBytes: value.byteLength,
          totalStoredBytes: this.totalStoredBytes,
          estimatedDownloadedS: this.estimatedDownloadedS,
          seekableMaxS: this.seekableMaxS,
          activeUrlMatches: this.activeUrl === url,
          aborted: abort.signal.aborted,
        });
      }

        this.seekableMaxS = Math.floor(this.estimatedDownloadedS);
        this.onProgress?.(this.totalStoredBytes, false, this.seekableMaxS);

        if (this.usingMse && this.sourceBuffer && this.mediaSource?.readyState === 'open') {
          try {
            const sb = this.sourceBuffer;

            if (sb.updating) {
              await this.waitForUpdateEnd(sb, abort.signal);
            }

            if (abort.signal.aborted || this.activeUrl !== url) break;

            if (this.mediaSource?.readyState === 'open' && this.usingMse) {
              sb.appendBuffer(chunkBuffer);
            }
          } catch (e) {
            if ((e as DOMException)?.name !== 'QuotaExceededError') {
              console.warn('appendBuffer error', e);
            }
            await this.sleep(50, abort.signal);
          }
        }
      }
    } catch (e: unknown) {
      if (!(e instanceof Error && e.name === 'AbortError')) {
        console.error('stream fetch error', e);
        this.onError?.('Stream fetch error');
      }
    } finally {
      try {
        await reader?.cancel();
      } catch (_) {
        // ignore
      }
    }
  }

  private setupMse(audio: HTMLAudioElement): void {
    const ms = new MediaSource();
    this.mediaSource = ms;
    this.mseObjectUrl = URL.createObjectURL(ms);
    audio.src = this.mseObjectUrl;
    this.usingMse = true;

    ms.addEventListener('sourceopen', () => {
      if (!MediaSource.isTypeSupported('audio/mpeg')) {
        console.error('audio/mpeg not supported by MSE');
        try {
          ms.endOfStream('decode');
        } catch (_) {
          // ignore
        }
        return;
      }

      this.sourceBuffer = ms.addSourceBuffer('audio/mpeg');
    }, { once: true });
  }

  private tearDownMse(): void {
    if (this.mediaSource?.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch (_) {
        // ignore
      }
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

  private waitForUpdateEnd(sb: SourceBuffer, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (!sb.updating) {
        resolve();
        return;
      }

      const onEnd = () => {
        done();
        resolve();
      };

      const onAbort = () => {
        done();
        resolve();
      };

      const done = () => {
        sb.removeEventListener('updateend', onEnd);
        signal.removeEventListener('abort', onAbort);
      };

      sb.addEventListener('updateend', onEnd, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}