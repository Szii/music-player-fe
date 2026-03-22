import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-board-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border rounded p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>{{ title || 'Player' }}</strong>
        <span class="text-muted small">{{ localStatus }}</span>
      </div>

      <div class="position-relative mb-1" style="height: 24px;">
        <div class="position-absolute w-100" style="top: 8px; height: 8px; background: #e9ecef; border-radius: 4px;">
          <div
            [style.width.%]="downloadedPercent"
            style="height: 100%; background: #adb5bd; border-radius: 4px; transition: width 0.3s;">
          </div>
        </div>
        <input
          type="range"
          class="form-range position-absolute w-100"
          style="top: 0; margin: 0;"
          min="0"
          [max]="seekableMaxS"
          [value]="displayPositionS"
          [disabled]="!hasTrack || seekableMaxS <= 0 || localStatus === 'STOPPED'"
          (input)="onSliderInput($any($event.target).value)"
          (change)="onSliderCommit($any($event.target).value)"
        />
      </div>

      <div class="mb-3 text-center">
        <small>
          {{ formatTime(displayPositionS) }} / {{ formatTime(durationS ?? 0) }}
          <span class="text-muted ms-2" *ngIf="localStatus !== 'STOPPED'">
            ({{ streamComplete ? 'fully loaded' : 'downloading ' + downloadedPercent.toFixed(0) + '%' }})
          </span>
        </small>
      </div>

      <div class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary"
          (click)="onPlay()" [disabled]="!hasTrack || localStatus === 'PLAYING'">
          Play
        </button>
        <button type="button" class="btn btn-outline-warning"
          (click)="onPause()" [disabled]="localStatus !== 'PLAYING'">
          Pause
        </button>
        <button type="button" class="btn btn-outline-success"
          (click)="onResume()" [disabled]="localStatus !== 'PAUSED'">
          Resume
        </button>
        <button type="button" class="btn btn-outline-danger"
          (click)="stopRequested.emit()" [disabled]="localStatus === 'STOPPED'">
          Stop
        </button>
      </div>

      <audio #audio hidden preload="none"
        (ended)="onAudioEnded()"
        (error)="onAudioElementError()">
      </audio>
    </div>
  `,
})
export class BoardPlayerComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() hasTrack = false;
  @Input() status = 'STOPPED';
  @Input() streamUrl: string | null = null;
  @Input() durationS: number | null = null;
  @Input() repeat = false;

  @Output() playRequested = new EventEmitter<void>();
  @Output() stopRequested = new EventEmitter<void>();
  @Output() ended = new EventEmitter<void>();
  @Output() audioError = new EventEmitter<void>();

  @ViewChild('audio') audioRef?: ElementRef<HTMLAudioElement>;

  localStatus: 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' = 'STOPPED';
  displayPositionS = 0;
  downloadedPercent = 0;
  streamComplete = false;
  seekableMaxS = 0;

  private isScrubbing = false;
  private suppressNextError = false;

  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private mseObjectUrl: string | null = null;

  private usingBlob = false;
  private blobObjectUrl: string | null = null;
  private cachedBlob: Blob | null = null;

  private fetchAbortController: AbortController | null = null;
  private activeStreamUrl: string | null = null;
  private positionInterval: ReturnType<typeof setInterval> | null = null;

  private storedChunks: ArrayBuffer[] = [];
  private totalStoredBytes = 0;

  constructor(private zone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('status' in changes || 'streamUrl' in changes) {
      this.syncWithBackend();
    }
  }

  ngOnDestroy(): void {
    this.tearDown();
  }

  onPlay(): void {
    this.playRequested.emit();
  }

  onPause(): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    audio.pause();
    this.localStatus = 'PAUSED';
  }

  onResume(): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    audio.play().catch(err => console.warn('resume failed', err));
    this.localStatus = 'PLAYING';
  }

  onSliderInput(value: string): void {
    this.isScrubbing = true;
    this.displayPositionS = Math.floor(Number(value));
  }

  onSliderCommit(value: string): void {
    this.isScrubbing = false;
    this.seekLocal(Math.floor(Number(value)));
  }

  onAudioEnded(): void {
    if (this.repeat) {
      const audio = this.audioRef?.nativeElement;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => console.warn('repeat play failed', err));
        this.displayPositionS = 0;
        this.localStatus = 'PLAYING';
        return;
      }
    }
    this.localStatus = 'STOPPED';
    this.ended.emit();
  }

  onAudioElementError(): void {
    if (this.suppressNextError) {
      this.suppressNextError = false;
      return;
    }
    console.warn('audio element error');
    this.audioError.emit();
  }

  private syncWithBackend(): void {
    if (this.status === 'PLAYING' && this.streamUrl) {
      if (this.activeStreamUrl !== this.streamUrl) {
        this.tearDown();
        this.localStatus = 'BUFFERING';
        this.connectStream(this.streamUrl);
      }
      return;
    }
    this.tearDown();
  }

  private seekLocal(targetS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    // Clamp to downloaded extent
    const downloadedS = this.estimateDownloadedDurationS();
    const clamped = Math.min(Math.max(0, targetS), downloadedS);

    if (this.usingBlob) {
      if (!this.streamComplete && !this.isBlobSeekable(clamped, audio)) {
        this.switchToBlob(clamped);
      } else {
        audio.currentTime = clamped;
        this.displayPositionS = clamped;
      }
      return;
    }

    if (this.isInMseBuffer(clamped, audio)) {
      audio.currentTime = clamped;
      this.displayPositionS = clamped;
      return;
    }

    this.switchToBlob(clamped);
  }

  private isInMseBuffer(targetS: number, audio: HTMLAudioElement): boolean {
    for (let i = 0; i < audio.buffered.length; i++) {
      if (audio.buffered.start(i) - 0.5 <= targetS && audio.buffered.end(i) + 0.5 >= targetS) {
        return true;
      }
    }
    return false;
  }

  private isBlobSeekable(targetS: number, audio: HTMLAudioElement): boolean {
    return isFinite(audio.duration) && targetS <= audio.duration + 0.5;
  }

  private switchToBlob(targetS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio || this.storedChunks.length === 0) return;

    const wasPlaying = this.localStatus === 'PLAYING';

    this.tearDownMse();

    const blob = this.cachedBlob ?? new Blob(this.storedChunks, { type: 'audio/mpeg' });
    if (this.streamComplete) this.cachedBlob = blob;

    if (this.blobObjectUrl) URL.revokeObjectURL(this.blobObjectUrl);
    this.blobObjectUrl = URL.createObjectURL(blob);
    this.usingBlob = true;

    this.suppressNextError = true;
    audio.src = this.blobObjectUrl;
    audio.currentTime = targetS;
    this.displayPositionS = targetS;

    if (wasPlaying) {
      audio.play().catch(err => console.warn('play after blob switch failed', err));
      this.localStatus = 'PLAYING';
    } else {
      this.localStatus = 'PAUSED';
    }
  }


  private connectStream(url: string): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    this.activeStreamUrl = url;
    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.usingBlob = false;
    this.seekableMaxS = 0;

    const abort = new AbortController();
    this.fetchAbortController = abort;

    this.startFetch(url, abort).catch(() => {});

    if (!('MediaSource' in window)) {
      audio.src = url;
      audio.load();
      audio.play().catch(err => console.warn('play failed', err));
      this.localStatus = 'PLAYING';
      this.startPositionTimer();
      return;
    }

    const ms = new MediaSource();
    this.mediaSource = ms;
    const objUrl = URL.createObjectURL(ms);
    this.mseObjectUrl = objUrl;
    audio.src = objUrl;

    ms.addEventListener('sourceopen', () => {
      if (!MediaSource.isTypeSupported('audio/mpeg')) {
        console.error('audio/mpeg not supported by MSE');
        ms.endOfStream('decode');
        return;
      }
      if (this.durationS && this.durationS > 0) {
        ms.duration = this.durationS;
      }
      this.sourceBuffer = ms.addSourceBuffer('audio/mpeg');
    }, { once: true });

    audio.play().catch(err => console.warn('play failed', err));
    this.localStatus = 'PLAYING';
    this.startPositionTimer();
  }

  private async startFetch(url: string, abort: AbortController): Promise<void> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok || !response.body) {
        console.error('stream fetch failed', response.status);
        return;
      }

      reader = response.body.getReader();

      while (true) {
        if (abort.signal.aborted || this.activeStreamUrl !== url) break;

        const { done, value } = await reader.read();

        if (done) {
          this.zone.run(() => {
            this.streamComplete = true;
            this.downloadedPercent = 100;
            this.seekableMaxS = this.durationS ?? Math.floor(this.totalStoredBytes / 24000);
            this.cachedBlob = new Blob(this.storedChunks, { type: 'audio/mpeg' });
          });

          const ms = this.mediaSource;
          const sb = this.sourceBuffer;
          if (ms && ms.readyState === 'open') {
            if (sb?.updating) await this.waitForUpdateEnd(sb, abort.signal);
            try { ms.endOfStream(); } catch (_) {}
          }
          break;
        }

        if (abort.signal.aborted || this.activeStreamUrl !== url) break;

        const chunkBuffer = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ) as ArrayBuffer;
        this.storedChunks.push(chunkBuffer);
        this.totalStoredBytes += value.byteLength;

        this.zone.run(() => {
          this.downloadedPercent = this.estimateDownloadedPercent();
          this.seekableMaxS = Math.floor(this.estimateDownloadedDurationS());
        });

        if (!this.usingBlob && this.sourceBuffer && this.mediaSource?.readyState === 'open') {
          try {
            const sb = this.sourceBuffer;
            if (sb.updating) await this.waitForUpdateEnd(sb, abort.signal);
            if (abort.signal.aborted || this.activeStreamUrl !== url) break;
            if (this.mediaSource?.readyState === 'open' && !this.usingBlob) {
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
      }
    } finally {
      try { await reader?.cancel(); } catch (_) {}
    }
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.positionInterval = setInterval(() => {
      this.zone.run(() => this.updateDisplay());
    }, 250);
  }

  private stopPositionTimer(): void {
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  private updateDisplay(): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    if (!this.isScrubbing) {
      this.displayPositionS = Math.floor(audio.currentTime);
    }
    if (!this.streamComplete) {
      this.downloadedPercent = this.estimateDownloadedPercent();
      this.seekableMaxS = Math.floor(this.estimateDownloadedDurationS());
    }
  }

  private estimateDownloadedPercent(): number {
    const dur = this.durationS ?? 0;
    if (dur <= 0 || this.totalStoredBytes === 0) return 0;
    if (this.streamComplete) return 100;
    const estimatedTotal = 24000 * dur; 
    return Math.min(99, (this.totalStoredBytes / estimatedTotal) * 100);
  }

  private estimateDownloadedDurationS(): number {
    if (this.streamComplete) return this.durationS ?? this.totalStoredBytes / 24000;
    if (this.totalStoredBytes === 0) return 0;
    return this.totalStoredBytes / 24000; // 192kbps
  }

  private tearDown(): void {
    this.stopPositionTimer();
    this.fetchAbortController?.abort();
    this.fetchAbortController = null;

    const audio = this.audioRef?.nativeElement;
    if (audio) {
      audio.pause();
      if (this.activeStreamUrl) this.suppressNextError = true;
      audio.removeAttribute('src');
      audio.load();
    }

    this.tearDownMse();
    this.tearDownBlob();

    this.activeStreamUrl = null;
    this.storedChunks = [];
    this.totalStoredBytes = 0;
    this.streamComplete = false;
    this.cachedBlob = null;
    this.usingBlob = false;
    this.localStatus = 'STOPPED';
    this.displayPositionS = 0;
    this.downloadedPercent = 0;
    this.seekableMaxS = 0;
  }

  private tearDownMse(): void {
    if (this.mediaSource?.readyState === 'open') {
      try { this.mediaSource.endOfStream(); } catch (_) {}
    }
    if (this.mseObjectUrl) {
      URL.revokeObjectURL(this.mseObjectUrl);
      this.mseObjectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
  }

  private tearDownBlob(): void {
    if (this.blobObjectUrl) {
      URL.revokeObjectURL(this.blobObjectUrl);
      this.blobObjectUrl = null;
    }
  }

  private waitForUpdateEnd(sb: SourceBuffer, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (!sb.updating) { resolve(); return; }
      const onEnd = () => { done(); resolve(); };
      const onAbort = () => { done(); resolve(); };
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

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':');
  }
}