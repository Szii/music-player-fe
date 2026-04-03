export interface BoardPlayerAudioSourceLoadOptions {
  audioElement: HTMLAudioElement;
  useMse?: boolean;
  estimatedDurationS?: number;
  windowStartS?: number;
  bytesPerSecond?: number;
  maxStoredBytes?: number;
}

export class BoardPlayerAudioSourceManager {
  private static readonly BUFFER_EPSILON_S = 1;
  private static readonly DEFAULT_BYTES_PER_SECOND = 24_000;

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
  private bytesPerSecond = BoardPlayerAudioSourceManager.DEFAULT_BYTES_PER_SECOND;
  private maxStoredBytes =
    60 * BoardPlayerAudioSourceManager.DEFAULT_BYTES_PER_SECOND;
  private evictedHeadBytes = 0;
  private expectedTotalBytes: number | null = null;

  private blobSnapshotStoredBytes = 0;
  private blobSnapshotEvictedHeadBytes = 0;
  private mseAppendDisabled = false;

  private loadToken = 0;
  private firstPlayableResolved = false;
  private firstPlayablePromise: Promise<void> = Promise.resolve();
  private firstPlayableResolve: (() => void) | null = null;

  private nativeCleanup: (() => void) | null = null;

  private get downloadedLocalEndS(): number {
    if (this.streamComplete) {
      return this.estimatedDurationS;
    }

    return this.totalDownloadedBytes / this.bytesPerSecond;
  }

  private get retainedLocalStartS(): number {
    return this.evictedHeadBytes / this.bytesPerSecond;
  }

  private get retainedLocalEndS(): number {
    return this.retainedLocalStartS + this.totalStoredBytes / this.bytesPerSecond;
  }

  private toBlobLocalTime(trackLocalTimeS: number): number {
    return Math.max(0, trackLocalTimeS - this.retainedLocalStartS);
  }

  async load(
    url: string,
    options: BoardPlayerAudioSourceLoadOptions,
  ): Promise<void> {
    this.destroy();

    const token = ++this.loadToken;

    this.activeUrl = url;
    this.audioElement = options.audioElement;
    this.estimatedDurationS = options.estimatedDurationS ?? 0;
    this.windowStartS = options.windowStartS ?? 0;

    this.bytesPerSecond = BoardPlayerAudioSourceManager.DEFAULT_BYTES_PER_SECOND;
    if (
      Number.isFinite(options.bytesPerSecond) &&
      (options.bytesPerSecond ?? 0) > 0
    ) {
      this.bytesPerSecond = options.bytesPerSecond!;
    }

    this.maxStoredBytes =
      options.maxStoredBytes ??
      Math.max(
        60 * this.bytesPerSecond,
        Math.ceil(this.bytesPerSecond * Math.max(this.estimatedDurationS, 0)),
      );

    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.totalDownloadedBytes = 0;
    this.evictedHeadBytes = 0;
    this.expectedTotalBytes = null;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = this.windowStartS;
    this.usingBlob = false;
    this.usingMse = false;
    this.usingNative = false;
    this.blobSnapshotStoredBytes = 0;
    this.blobSnapshotEvictedHeadBytes = 0;
    this.mseAppendDisabled = false;

    this.resetFirstPlayable();

    const abort = new AbortController();
    this.fetchAbort = abort;

    const audio = this.audioElement;
    if (!audio) {
      return;
    }

    const canUseMse =
      options.useMse !== false &&
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

    if (this.hasFullBlob()) {
      this.cachedBlob = blob;
    }

    return blob;
  }

  hasFullBlob(): boolean {
    return this.streamComplete && this.evictedHeadBytes === 0;
  }

  hasBufferedLoopRange(loopDurationS = this.estimatedDurationS): boolean {
    if (loopDurationS <= 0) {
      return false;
    }

    if (this.hasFullBlob()) {
      return true;
    }

    const headPresent =
      this.retainedLocalStartS <= BoardPlayerAudioSourceManager.BUFFER_EPSILON_S;
    const endCovered =
      this.retainedLocalEndS >=
      loopDurationS - BoardPlayerAudioSourceManager.BUFFER_EPSILON_S;

    return headPresent && endCovered;
  }

  getBufferedLoopBlob(loopDurationS = this.estimatedDurationS): Blob | null {
    if (!this.hasBufferedLoopRange(loopDurationS)) {
      return null;
    }

    if (this.cachedBlob && this.hasFullBlob()) {
      return this.cachedBlob;
    }

    if (this.storedChunks.length === 0) {
      return null;
    }

    const blob = new Blob(this.storedChunks, { type: 'audio/mpeg' });

    if (this.hasFullBlob()) {
      this.cachedBlob = blob;
    }

    return blob;
  }

  cloneBufferedLoopTo(
    target: BoardPlayerAudioSourceManager,
    audioElement: HTMLAudioElement,
    seekToS: number,
    estimatedDurationS: number,
    windowStartS: number,
  ): boolean {
    const blob = this.getBufferedLoopBlob(estimatedDurationS);
    if (!blob) {
      return false;
    }

    target.initFromBlob(
      blob,
      audioElement,
      seekToS,
      estimatedDurationS,
      windowStartS,
    );

    return true;
  }

  seekWithinCurrentSource(targetS: number, wasPlaying: boolean): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    if (this.usingNative) {
      try {
        audio.currentTime = Math.max(0, targetS);
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player native seek play failed', error);
        });
      }

      return true;
    }

    if (this.usingBlob) {
      if (!this.isBlobSeekable(targetS)) {
        return false;
      }

      const blobTimeS = this.toBlobLocalTime(targetS);

      if (!this.isCurrentBlobSnapshotFresh()) {
        const src = this.rebuildBlobObjectUrl();
        if (!src) {
          return false;
        }

        this.assignSourceAndSeek(
          audio,
          src,
          blobTimeS,
          wasPlaying,
          'board-player blob seek play failed',
        );

        return true;
      }

      try {
        audio.currentTime = blobTimeS;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player blob seek play failed', error);
        });
      }

      return true;
    }

    if (this.usingMse && this.isInMseBuffer(targetS)) {
      try {
        audio.currentTime = Math.max(0, targetS);
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player MSE seek play failed', error);
        });
      }

      return true;
    }

    return false;
  }

  switchToBlobSrc(seekToS: number, wasPlaying: boolean): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    if (this.usingNative) {
      try {
        audio.currentTime = Math.max(0, seekToS);
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player native play after seek failed', error);
        });
      }

      return true;
    }

    if (!this.isBlobSeekable(seekToS)) {
      return false;
    }

    const blobTimeS = this.toBlobLocalTime(seekToS);

    if (this.usingBlob && this.blobObjectUrl && this.isCurrentBlobSnapshotFresh()) {
      try {
        audio.currentTime = blobTimeS;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player blob play after seek failed', error);
        });
      }

      return true;
    }

    this.tearDownMse();
    this.usingMse = false;
    this.usingBlob = true;
    this.usingNative = false;

    const src = this.rebuildBlobObjectUrl();
    if (!src) {
      return false;
    }

    this.assignSourceAndSeek(
      audio,
      src,
      blobTimeS,
      wasPlaying,
      'board-player play after blob switch failed',
    );

    return true;
  }

  restartFromBuffer(
    wasPlaying: boolean,
    loopDurationS = this.estimatedDurationS,
  ): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    const loopBlob = this.getBufferedLoopBlob(loopDurationS);
    if (loopBlob) {
      if (this.blobObjectUrl) {
        URL.revokeObjectURL(this.blobObjectUrl);
      }

      this.tearDownMse();
      this.usingMse = false;
      this.usingBlob = true;
      this.usingNative = false;
      this.blobObjectUrl = URL.createObjectURL(loopBlob);
      this.blobSnapshotStoredBytes = loopBlob.size;
      this.blobSnapshotEvictedHeadBytes = 0;

      this.assignSourceAndSeek(
        audio,
        this.blobObjectUrl,
        0,
        wasPlaying,
        'board-player restart from buffer failed',
      );

      return true;
    }

    if (this.usingBlob) {
      const src = this.isCurrentBlobSnapshotFresh()
        ? this.blobObjectUrl
        : this.rebuildBlobObjectUrl();

      if (!src) {
        return false;
      }

      this.assignSourceAndSeek(
        audio,
        src,
        0,
        wasPlaying,
        'board-player blob restart failed',
      );

      return true;
    }

    if (this.usingMse && this.isInMseBuffer(0)) {
      try {
        audio.currentTime = 0;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player MSE restart failed', error);
        });
      }

      return true;
    }

    if (this.usingNative && this.isNativeBufferedFromStart(loopDurationS)) {
      try {
        audio.currentTime = 0;
      } catch {
        return false;
      }

      if (wasPlaying) {
        audio.play().catch((error) => {
          console.warn('board-player native buffered restart failed', error);
        });
      }

      return true;
    }

    return false;
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

    return (
      targetS >= this.retainedLocalStartS - 0.5 &&
      targetS <= this.retainedLocalEndS + 0.5
    );
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

    if (this.expectedTotalBytes && this.expectedTotalBytes > 0) {
      if (this.streamComplete) {
        return 100;
      }

      return Math.max(
        0,
        Math.min(99, (this.totalDownloadedBytes / this.expectedTotalBytes) * 100),
      );
    }

    if (this.estimatedDurationS <= 0 || this.totalDownloadedBytes === 0) {
      return 0;
    }

    if (this.streamComplete) {
      return 100;
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
    this.evictedHeadBytes = 0;
    this.expectedTotalBytes = null;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.seekableMaxS = 0;
    this.usingMse = false;
    this.usingBlob = false;
    this.usingNative = false;
    this.bytesPerSecond = BoardPlayerAudioSourceManager.DEFAULT_BYTES_PER_SECOND;
    this.maxStoredBytes =
      60 * BoardPlayerAudioSourceManager.DEFAULT_BYTES_PER_SECOND;
    this.blobSnapshotStoredBytes = 0;
    this.blobSnapshotEvictedHeadBytes = 0;
    this.mseAppendDisabled = false;

    this.resetFirstPlayable();
  }

  initFromBlob(
    blob: Blob,
    audioElement: HTMLAudioElement,
    seekToS: number,
    estimatedDurationS: number,
    windowStartS: number,
  ): void {
    this.destroy();

    this.audioElement = audioElement;
    this.estimatedDurationS = estimatedDurationS;
    this.windowStartS = windowStartS;
    this.streamComplete = true;
    this.usingBlob = true;
    this.usingMse = false;
    this.usingNative = false;

    this.cachedBlob = blob;
    this.totalStoredBytes = blob.size;
    this.totalDownloadedBytes = blob.size;
    this.expectedTotalBytes = blob.size;
    this.evictedHeadBytes = 0;
    this.updateBytesPerSecondFromExpectedSize();

    if (this.blobObjectUrl) {
      URL.revokeObjectURL(this.blobObjectUrl);
    }

    this.blobObjectUrl = URL.createObjectURL(blob);
    this.blobSnapshotStoredBytes = this.totalStoredBytes;
    this.blobSnapshotEvictedHeadBytes = this.evictedHeadBytes;

    this.assignSourceAndSeek(
      audioElement,
      this.blobObjectUrl,
      seekToS,
      false,
      'board-player initFromBlob play failed',
    );

    this.seekableMaxS = windowStartS + estimatedDurationS;
    this.resetFirstPlayable();
    this.resolveFirstPlayable();
    this.onProgress?.(this.totalDownloadedBytes, true, this.seekableMaxS);
  }

  private isCurrentBlobSnapshotFresh(): boolean {
    return (
      !!this.blobObjectUrl &&
      this.blobSnapshotStoredBytes === this.totalStoredBytes &&
      this.blobSnapshotEvictedHeadBytes === this.evictedHeadBytes
    );
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
    this.blobSnapshotEvictedHeadBytes = this.evictedHeadBytes;
    this.usingBlob = true;
    this.usingNative = false;

    return this.blobObjectUrl;
  }

  private updateBytesPerSecondFromExpectedSize(): void {
    if (
      !Number.isFinite(this.expectedTotalBytes) ||
      this.expectedTotalBytes == null ||
      this.expectedTotalBytes <= 0 ||
      !Number.isFinite(this.estimatedDurationS) ||
      this.estimatedDurationS <= 0
    ) {
      return;
    }

    const computed = this.expectedTotalBytes / this.estimatedDurationS;

    if (Number.isFinite(computed) && computed > 0) {
      this.bytesPerSecond = computed;
    }
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

  private isNativeBufferedFromStart(loopDurationS: number): boolean {
    const audio = this.audioElement;
    if (!audio) {
      return false;
    }

    try {
      const ranges = audio.buffered;
      for (let i = 0; i < ranges.length; i++) {
        const start = ranges.start(i);
        const end = ranges.end(i);

        if (
          start <= BoardPlayerAudioSourceManager.BUFFER_EPSILON_S &&
          end >= loopDurationS - BoardPlayerAudioSourceManager.BUFFER_EPSILON_S
        ) {
          return true;
        }
      }
    } catch {}

    return false;
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

  private getMseBufferedEndS(): number {
    const sb = this.sourceBuffer;
    if (sb) {
      try {
        if (sb.buffered.length > 0) {
          return this.windowStartS + sb.buffered.end(sb.buffered.length - 1);
        }
      } catch {}
    }

    const audio = this.audioElement;
    if (audio) {
      try {
        if (audio.buffered.length > 0) {
          return this.windowStartS + audio.buffered.end(audio.buffered.length - 1);
        }
      } catch {}
    }

    return this.windowStartS;
  }

  private emitProgress(complete: boolean): void {
    let seekable = this.windowStartS;

    if (complete) {
      seekable = this.windowStartS + this.estimatedDurationS;
    } else if (this.usingNative) {
      seekable = this.getNativeSeekableEndS();
    } else if (this.usingMse) {
      seekable = Math.max(this.getMseBufferedEndS(), this.estimatedDownloadedS);
    } else if (this.usingBlob) {
      seekable = this.windowStartS + this.retainedLocalEndS;
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

      const contentLengthHeader = response.headers.get('Content-Length');
      const contentRangeHeader = response.headers.get('Content-Range');

      const totalBytesFromContentLength = contentLengthHeader
        ? Number(contentLengthHeader)
        : NaN;

      const totalBytesFromContentRange =
        this.parseContentRangeTotal(contentRangeHeader);

      const actualTotalBytes =
        Number.isFinite(totalBytesFromContentRange) && totalBytesFromContentRange > 0
          ? totalBytesFromContentRange
          : Number.isFinite(totalBytesFromContentLength) && totalBytesFromContentLength > 0
            ? totalBytesFromContentLength
            : null;

      if (actualTotalBytes != null) {
        this.expectedTotalBytes = actualTotalBytes;
        this.maxStoredBytes = Math.max(this.maxStoredBytes, actualTotalBytes);
        this.updateBytesPerSecondFromExpectedSize();
      }

      if (!response.ok || !response.body) {
        this.onError?.(`Stream fetch failed: HTTP ${response.status}`);
        return;
      }

      reader = response.body.getReader();

      while (true) {
        if (
          abort.signal.aborted ||
          this.activeUrl !== url ||
          token !== this.loadToken
        ) {
          break;
        }

        const { done, value } = await reader.read();

        if (done) {
          this.streamComplete = true;

          if (this.hasFullBlob() && this.storedChunks.length > 0) {
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
              console.warn('board-player MSE duration finalize failed', error);
            }

            try {
              if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
              }
            } catch (error) {
              console.warn('board-player endOfStream failed', error);
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

        this.cachedBlob = null;
        this.storedChunks.push(chunkBuffer);
        this.totalStoredBytes += value.byteLength;
        this.totalDownloadedBytes += value.byteLength;

        while (
          this.storedChunks.length > 1 &&
          this.totalStoredBytes > this.maxStoredBytes
        ) {
          const evicted = this.storedChunks.shift()!;
          this.totalStoredBytes -= evicted.byteLength;
          this.evictedHeadBytes += evicted.byteLength;
        }

        if (
          this.usingMse &&
          !this.mseAppendDisabled &&
          this.sourceBuffer &&
          this.mediaSource?.readyState === 'open'
        ) {
          const sb = this.sourceBuffer;

          try {
            if (sb.updating) {
              await this.waitForUpdateEnd(sb, abort.signal);
            }

            if (
              abort.signal.aborted ||
              this.activeUrl !== url ||
              token !== this.loadToken
            ) {
              break;
            }

            if (this.mediaSource?.readyState === 'open' && this.usingMse) {
              sb.appendBuffer(chunkBuffer);
              await this.waitForUpdateEnd(sb, abort.signal);
              this.emitProgress(false);
              this.resolveFirstPlayable();
            }
          } catch (error) {
            if ((error as DOMException)?.name === 'QuotaExceededError') {
              const audio = this.audioElement;

              if (audio && sb.buffered.length > 0) {
                const currentTime = audio.currentTime || 0;
                const evictUpTo = Math.max(0, currentTime - 10);
                const bufferStart = sb.buffered.start(0);

                if (evictUpTo > bufferStart + 1) {
                  try {
                    if (!sb.updating) {
                      sb.remove(bufferStart, evictUpTo);
                      await this.waitForUpdateEnd(sb, abort.signal);
                    }
                  } catch (removeError) {
                    console.warn('board-player MSE eviction failed', removeError);
                  }
                }

                try {
                  if (!sb.updating && this.mediaSource?.readyState === 'open') {
                    sb.appendBuffer(chunkBuffer);
                    await this.waitForUpdateEnd(sb, abort.signal);
                    this.emitProgress(false);
                    this.resolveFirstPlayable();
                  }
                } catch {
                  // MSE buffer permanently full — stop appending but keep downloading
                  this.mseAppendDisabled = true;
                  this.emitProgress(false);
                  this.resolveFirstPlayable();
                }
              } else {
                this.mseAppendDisabled = true;
                this.emitProgress(false);
                this.resolveFirstPlayable();
              }
            } else {
              console.warn('board-player appendBuffer error', error);
            }
          }
        } else {
          this.emitProgress(false);
          this.resolveFirstPlayable();
        }
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('board-player stream fetch error', error);
        this.onError?.('Stream fetch error');
      }
    } finally {
      try {
        await reader?.cancel();
      } catch {}
    }
  }

  private parseContentRangeTotal(header: string | null): number {
    if (!header) {
      return NaN;
    }

    const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(header);
    if (!match) {
      return NaN;
    }

    const total = Number(match[1]);
    return Number.isFinite(total) ? total : NaN;
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

    this.blobSnapshotStoredBytes = 0;
    this.blobSnapshotEvictedHeadBytes = 0;
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