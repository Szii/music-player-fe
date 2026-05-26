import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WindowEditorAudioSourceManager } from '../../../../shared/features/audio-stream-manager/window-audio-stream-manager';
import { PlaybackPositionTracker } from '../../../../shared/features/audio-stream-manager/playback-position-tracker';
import {
  WaveformCanvasComponent,
  RegionChangeEvent,
} from '../waveform-canvas/waveform-canvas.component';
import { WindowTransportComponent } from '../window-transport/window-transport.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormRowComponent } from '../../../../shared/ui/form-row/ui-form-row.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

export interface WindowEditorResult {
  name: string;
  positionFrom: number;
  positionTo: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

@Component({
  selector: 'app-window-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    WaveformCanvasComponent,
    WindowTransportComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    UiFormRowComponent,
    UiFormActionsComponent,
    NormalButtonComponent,
  ],
  template: `
    <div class="we-root">
      <audio #audio hidden preload="auto"></audio>

      <app-waveform-canvas
        #waveformCanvas
        [durationS]="durationS()"
        [regionFromS]="regionFromS()"
        [regionToS]="regionToS()"
        [seekableMaxS]="tracker.seekableMaxS"
        [playheadPx]="playheadPx()"
        [waveformPeaks]="waveformPeaks()"
        [fadeIn]="fadeIn()"
        [fadeOut]="fadeOut()"
        [audioReady]="audioReady()"
        [loadingStream]="loadingStream()"
        [downloadProgress]="downloadProgress()"
        [streamError]="streamError()"
        [waveformLoading]="waveformLoading()"
        [waveformReady]="waveformReady()"
        [waveformError]="waveformError()"
        [handlesDisabled]="!streamComplete()"
        (regionChange)="onRegionChange($event)"
        (seekRequested)="seekLocal($event)"
      />

      <div class="we-ruler" *ngIf="durationS() > 0">
        <span
          class="we-ruler-mark"
          *ngFor="let mark of rulerMarks()"
          [style.left.%]="mark.pct"
        >
          {{ mark.label }}
        </span>
      </div>

      <div class="we-section we-section--compact" *ngIf="durationS() > 0">
        <div class="we-meta-row">
          <div class="we-meta-chips">
            <div class="we-meta-chip">
              <span class="we-meta-chip__label">Selection length</span>
              <span class="we-meta-chip__value we-meta-chip__value--accent">
                {{ formatTime(regionToS() - regionFromS()) }}
              </span>
            </div>

            <div class="we-meta-chip">
              <span class="we-meta-chip__label">From</span>
              <span class="we-meta-chip__value">{{ formatTime(regionFromS()) }}</span>
            </div>

            <div class="we-meta-chip">
              <span class="we-meta-chip__label">To</span>
              <span class="we-meta-chip__value">{{ formatTime(regionToS()) }}</span>
            </div>
          </div>

          <div class="we-volume" *ngIf="audioReady()">
            <span class="we-volume__label">Volume</span>

            <input
              class="we-volume__range"
              type="range"
              min="0"
              max="100"
              step="1"
              [value]="volumePercent()"
              (input)="onVolumeChange($any($event.target).value)"
              aria-label="Volume"
            />

            <span class="we-volume__value">{{ volumePercent() }}%</span>
          </div>
        </div>
      </div>

      <div class="we-seek we-section" *ngIf="audioReady() && durationS() > 0">
        <span class="we-seek__time">{{ formatTime(currentTimeS()) }}</span>

        <input
          class="we-seek__range"
          type="range"
          min="0"
          [max]="durationS()"
          step="0.1"
          [value]="tracker.displayPositionS"
          [style.background]="seekBackground()"
          (input)="onSeekInput($any($event.target).value)"
          (change)="onSeekCommit($any($event.target).value)"
        />

        <span class="we-seek__time">{{ formatTime(durationS()) }}</span>
      </div>

      <app-window-transport
        *ngIf="audioReady()"
        [isPlaying]="isPlaying()"
        [playMode]="playMode()"
        [fadeIn]="fadeIn()"
        [fadeOut]="fadeOut()"
        [playSelectionDisabled]="!streamComplete()"
        (playAll)="togglePlayAll()"
        (playSelection)="togglePlaySelection()"
        (fadeInChange)="onFadeInChange($event)"
        (fadeOutChange)="onFadeOutChange($event)"
      />

      <div class="we-section we-bottom" *ngIf="durationS() > 0">
        <ui-form-row>
          <div class="we-name-field">
            <ui-form-field label="Window name">
              <ui-text-input
                [(ngModel)]="windowName"
                placeholder="e.g. Intro"
              />
            </ui-form-field>
          </div>

          <ui-form-actions>
            <normal-button
              type="button"
              variant="success"
              [disabled]="!canApply()"
              (clicked)="onApply()"
            >
              {{ applyLabel() }}
            </normal-button>
          </ui-form-actions>
        </ui-form-row>
      </div>
    </div>
  `,
  styles: [`
    .we-root {
      background: var(--app-surface);
      overflow: hidden;
      font: inherit;
      color: var(--app-text);
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .we-ruler {
      position: relative;
      height: 20px;
      background: var(--app-surface);
      border-top: var(--app-border);
      overflow: hidden;
      flex-shrink: 0;
    }

    .we-ruler-mark {
      position: absolute;
      top: 2px;
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--app-text-muted);
      white-space: nowrap;
    }

    .we-section {
      padding: 12px 16px;
      border-top: var(--app-border);
      background: var(--app-surface);
      flex-shrink: 0;
    }

    .we-section--compact {
      padding-top: 10px;
      padding-bottom: 10px;
    }

    .we-meta-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .we-meta-chips {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .we-meta-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 12px;
      border-radius: 10px;
      background: var(--app-bg-soft);
      min-width: 96px;
      text-align: center;
    }

    .we-meta-chip__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .we-meta-chip__value {
      font-size: 13px;
      font-weight: 700;
      color: var(--app-text);
      font-variant-numeric: tabular-nums;
    }

    .we-meta-chip__value--accent {
      font-size: 14px;
      color: var(--app-primary);
    }

    .we-seek {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .we-seek__range {
      flex: 1;
      min-width: 0;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      height: 5px;
      border-radius: 3px;
      border: none;
      outline: none;
    }

    .we-seek__range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 2px solid var(--app-surface);
      box-shadow: 0 0 0 1px var(--app-primary);
      cursor: pointer;
    }

    .we-seek__range::-moz-range-thumb {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 2px solid var(--app-surface);
      cursor: pointer;
    }

    .we-seek__time {
      font-size: 11px;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: center;
    }

    .we-volume {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 200px;
      margin-left: auto;
    }

    .we-volume__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .we-volume__range {
      flex: 1;
      min-width: 0;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      height: 5px;
      border-radius: 3px;
      border: none;
      outline: none;
      background: var(--app-border-color);
    }

    .we-volume__range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 2px solid var(--app-surface);
      box-shadow: 0 0 0 1px var(--app-primary);
      cursor: pointer;
    }

    .we-volume__range::-moz-range-thumb {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 2px solid var(--app-surface);
      cursor: pointer;
    }

    .we-volume__value {
      font-size: 11px;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: right;
    }

    .we-name-field {
      flex: 1;
      min-width: 220px;
    }

    .we-bottom {
      background: var(--app-bg-soft);
      margin-top: auto;
    }
  `],
})
export class WindowEditorComponent implements OnChanges, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly streamUrl = input<string | null>(null);
  readonly durationS = input(0);
  readonly waveformPeaks = input<number[]>([]);
  readonly waveformLoading = input(false);
  readonly waveformError = input<string | null>(null);
  readonly initialFromS = input<number | null>(null);
  readonly initialToS = input<number | null>(null);
  readonly initialName = input('');
  readonly initialFadeIn = input(false);
  readonly initialFadeOut = input(false);
  readonly applyLabel = input('Apply window');

  readonly apply = output<WindowEditorResult>();
  readonly streamCompleted = output<void>();

  @ViewChild('audio', { static: true }) audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('waveformCanvas') waveformCanvasRef!: WaveformCanvasComponent;

  readonly loadingStream = signal(false);
  readonly audioReady = signal(false);
  readonly streamError = signal<string | null>(null);
  readonly downloadProgress = signal(0);
  readonly regionFromS = signal(0);
  readonly regionToS = signal(0);
  readonly currentTimeS = signal(0);
  readonly playheadPx = signal(0);
  readonly isPlaying = signal(false);
  readonly playMode = signal<'full' | 'selection'>('full');
  readonly fadeIn = signal(false);
  readonly fadeOut = signal(false);
  readonly streamComplete = signal(false);
  readonly masterVolume = signal(0.5);
  readonly volumePercent = computed(() => Math.round(this.masterVolume() * 100));

  readonly waveformReady = computed(
    () => this.waveformPeaks().length > 0 && this.durationS() > 0,
  );

  readonly canApply = computed(
    () => this.regionFromS() < this.regionToS() && this.streamComplete(),
  );

  readonly rulerMarks = computed(() => {
    const duration = this.durationS();
    if (duration <= 0) return [];

    const stepS =
      duration <= 15 ? 1 :
      duration <= 60 ? 5 :
      duration <= 300 ? 15 :
      duration <= 600 ? 30 :
      60;

    const marks: Array<{ pct: number; label: string }> = [];

    for (let t = 0; t <= duration; t += stepS) {
      marks.push({
        pct: (t / duration) * 100,
        label: this.formatTime(t),
      });
    }

    return marks;
  });

  readonly seekBackground = computed(() => {
    const duration = this.durationS();
    if (duration <= 0) {
      return 'var(--app-border-color)';
    }

    const loadedPct = Math.min((this.tracker.seekableMaxS / duration) * 100, 100);
    const selectionStartPct = Math.max(0, (this.regionFromS() / duration) * 100);
    const selectionEndPct = Math.min(100, (this.regionToS() / duration) * 100);

    return `linear-gradient(to right,
      var(--app-border-color) 0%, var(--app-border-color) ${selectionStartPct}%,
      var(--app-primary-soft) ${selectionStartPct}%, var(--app-primary-soft) ${selectionEndPct}%,
      var(--app-border-color) ${selectionEndPct}%, var(--app-border-color) 100%),
      linear-gradient(to right,
      var(--app-primary) 0%, var(--app-primary) ${loadedPct}%,
      var(--app-border-color) ${loadedPct}%, var(--app-border-color) 100%)`;
  });

  windowName = '';

  readonly tracker = new PlaybackPositionTracker(
    () => this.audioRef?.nativeElement ?? null,
  );

  private stream = new WindowEditorAudioSourceManager();
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private playbackEndS = 0;
  private isScrubbing = false;
  private suppressNextError = false;
  private suppressBoundaryUntil = 0;
  private suppressTimeSyncUntil = 0;
  private suppressSegmentEndUntil = 0;
  private readonly previewFadeDurationS = 1.0;

  private audioListeners: Array<{ type: string; fn: EventListener }> = [];

  private editorStateInitialized = false;
  private lastEditorKey = '';
  private lastToastErrorMessage: string | null = null;
  private connectGeneration = 0;
  private playbackRequestToken = 0;

  readonly canPlayAll = computed(() => this.getCurrentPlayableMaxS() > 0.05);

  ngOnChanges(changes: SimpleChanges): void {
    const nextKey = this.buildEditorKey();
    const identityChanged = nextKey !== this.lastEditorKey;

    if (identityChanged) {
      this.lastEditorKey = nextKey;
      this.editorStateInitialized = false;
    }

    if (!this.editorStateInitialized && this.durationS() > 0) {
      this.initializeRegionDefaults();
      this.editorStateInitialized = true;
    }

    if ('durationS' in changes) {
      this.tracker.setDuration(this.durationS());
      this.tracker.setWindow(0, this.durationS());
    }

    if ('streamUrl' in changes) {
      if (!this.streamUrl()) {
        this.stopPlayback();
        this.destroyStream();
        return;
      }

      void this.initStream(this.streamUrl()!);
    }
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    this.destroyStream();
  }

  onRegionChange(event: RegionChangeEvent): void {
    const bufferedMax = this.stream.streamComplete ? Infinity : this.tracker.seekableMaxS;
    this.regionFromS.set(Math.min(event.fromS, bufferedMax));
    this.regionToS.set(Math.min(event.toS, bufferedMax));

    if (this.isPlaying() && this.playMode() === 'selection') {
      this.syncPlaybackToSelectionBounds();
    }

    this.cdr.markForCheck();
  }

  onFadeInChange(value: boolean): void {
    this.fadeIn.set(value);
    this.waveformCanvasRef?.drawWaveform();
    this.cdr.markForCheck();
  }

  onFadeOutChange(value: boolean): void {
    this.fadeOut.set(value);
    this.waveformCanvasRef?.drawWaveform();
    this.cdr.markForCheck();
  }

  onVolumeChange(value: string | number): void {
    const numeric = Math.max(0, Math.min(100, Number(value)));
    this.masterVolume.set(numeric / 100);

    const audio = this.audioRef?.nativeElement;
    if (audio && this.audioReady()) {
      this.applyPreviewFadeVolume(audio.currentTime || 0);
    }

    this.cdr.markForCheck();
  }

  onSeekInput(value: string): void {
    this.isScrubbing = true;
    this.tracker.displayPositionS = this.clampToRegionBounds(Number(value));

    const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playheadPx.set(
      this.durationS() > 0
        ? (this.tracker.displayPositionS / this.durationS()) * canvasWidth
        : 0,
    );

    this.cdr.markForCheck();
  }

  onSeekCommit(value: string): void {
    this.isScrubbing = false;
    this.seekLocal(this.clampToRegionBounds(Number(value)));
  }

  seekLocal(targetS: number): void {
  const audio = this.audioRef?.nativeElement;
  if (!audio || !this.audioReady()) return;

  const requested = this.clampToRegionBounds(targetS);
  const wasPlaying = !audio.paused && !audio.ended;

  this.suppressNextError = true;

  const canSeekStartInPlace =
    requested <= 0.05 &&
    (
      this.stream.streamComplete ||
      this.stream.usingNative ||
      this.stream.isInMseBuffer(0)
    );

  if (canSeekStartInPlace) {
    try {
      audio.currentTime = 0;
    } catch {}
  } else {
    const canSeekInPlace =
      !this.stream.usingBlob && this.stream.isInMseBuffer(requested);

    if (canSeekInPlace) {
      try {
        audio.currentTime = requested;
      } catch {}
    } else {
      const switched = this.stream.switchToBlobSrc(requested, wasPlaying);

      if (!switched) {
        if (this.stream.usingMse || this.stream.usingNative) {
          try {
            audio.currentTime = requested;
          } catch {}
        }
      }
    }
  }

  this.currentTimeS.set(requested);
  this.tracker.displayPositionS = requested;

  const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
  this.playheadPx.set(
    this.durationS() > 0 ? (requested / this.durationS()) * canvasWidth : 0,
  );

  this.applyPreviewFadeVolume(requested);
  this.suppressTimeSyncUntil = Date.now() + 120;
  this.cdr.markForCheck();
}

togglePlayAll(): void {
  if (this.isPlaying() && this.playMode() === 'full') {
    this.stopPlayback();
    return;
  }

  const playableMax = this.getCurrentPlayableMaxS();

  if (playableMax <= 0.05) {
    this.toast.warning('Track is not ready to play yet.');
    return;
  }

  const endAt = this.stream.streamComplete
    ? this.durationS()
    : playableMax;

  this.startPlayback(0, endAt, 'full');
}

  togglePlaySelection(): void {
    if (this.isPlaying() && this.playMode() === 'selection') {
      this.stopPlayback();
      return;
    }

    this.startPlayback(this.regionFromS(), this.regionToS(), 'selection');
  }

  onApply(): void {
    if (!this.canApply()) {
      this.toast.warning('Audio preview is not fully ready yet.');
      return;
    }

    this.apply.emit({
      name: this.windowName.trim(),
      positionFrom: this.regionFromS(),
      positionTo: this.regionToS(),
      fadeIn: this.fadeIn(),
      fadeOut: this.fadeOut(),
    });
  }

  async confirmDiscardChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }

    return this.confirmDialog.confirm({
      title: 'Discard changes?',
      message: 'You have unsaved window changes. They will be lost if you continue.',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      variant: 'danger',
    });
  }

  formatTime(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private hasUnsavedChanges(): boolean {
    const initialFrom = this.roundToTenth(this.initialFromS() ?? 0);
    const initialTo = this.roundToTenth(this.initialToS() ?? this.durationS());
    const currentFrom = this.roundToTenth(this.regionFromS());
    const currentTo = this.roundToTenth(this.regionToS());

    return (
      initialFrom !== currentFrom ||
      initialTo !== currentTo ||
      this.initialName().trim() !== this.windowName.trim() ||
      this.initialFadeIn() !== this.fadeIn() ||
      this.initialFadeOut() !== this.fadeOut()
    );
  }

private startPlayback(fromS: number, toS: number, mode: 'full' | 'selection'): void {
  const audio = this.audioRef?.nativeElement;
  if (!audio || !this.audioReady()) return;

  this.stopPlayback();
  const requestToken = ++this.playbackRequestToken;

  this.playMode.set(mode);

  const startFrom = this.clampToRegionBounds(fromS);
  const endAt = Math.max(startFrom, Math.min(toS, this.durationS()));

  this.playbackEndS = endAt;
  this.isPlaying.set(true);

  this.seekLocal(startFrom);
  this.applyPreviewFadeVolume(startFrom);

  let tickerStarted = false;

  const startTicker = () => {
    if (tickerStarted || requestToken !== this.playbackRequestToken) {
      return;
    }

    tickerStarted = true;

    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    this.zone.runOutsideAngular(() => {
      this.playbackTimer = setInterval(() => {
        const currentTime = audio.currentTime || 0;
        let dirty = false;

        if (
          this.playMode() === 'selection' &&
          Date.now() >= this.suppressBoundaryUntil &&
          (currentTime < this.regionFromS() || currentTime >= this.regionToS())
        ) {
          this.zone.run(() => this.syncPlaybackToSelectionBounds());
          return;
        }

        this.applyPreviewFadeVolume(currentTime);

        if (
          Date.now() >= this.suppressSegmentEndUntil &&
          (currentTime >= this.playbackEndS || (audio.ended && this.stream.streamComplete))
        ) {
          this.zone.run(() => this.onPlaybackSegmentEnded());
          return;
        }

        if (!this.isScrubbing && Date.now() >= this.suppressTimeSyncUntil) {
          this.tracker.displayPositionS = currentTime;
          dirty = true;
        }

        const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
        if (this.durationS() > 0 && canvasWidth > 0) {
          const displayPosition = this.isScrubbing
            ? this.tracker.displayPositionS
            : currentTime;

          this.playheadPx.set((displayPosition / this.durationS()) * canvasWidth);
          dirty = true;
        }

        this.currentTimeS.set(currentTime);

        if (dirty) {
          this.cdr.markForCheck();
        }
      }, 30);
    });

    this.cdr.markForCheck();
  };

  const onPlaying = () => {
    audio.removeEventListener('playing', onPlaying);
    startTicker();
  };

  audio.addEventListener('playing', onPlaying, { once: true });

  audio.play()
    .then(() => {
      if (requestToken !== this.playbackRequestToken) {
        return;
      }

      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        startTicker();
      }
    })
    .catch((error) => {
      audio.removeEventListener('playing', onPlaying);

      if (requestToken !== this.playbackRequestToken) {
        return;
      }

      console.warn('WindowEditor play failed', error);
      this.toast.error('Playback could not be started.');
      this.isPlaying.set(false);
      this.cdr.markForCheck();
    });

  this.cdr.markForCheck();
}

  stopPlayback(): void {
    this.playbackRequestToken++;

    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    const audio = this.audioRef?.nativeElement;
    if (audio) {
      try {
        audio.pause();
      } catch {}

      const currentTime = audio.currentTime || 0;
      this.currentTimeS.set(currentTime);
      this.tracker.displayPositionS = currentTime;
      audio.volume = this.masterVolume();
    }

    this.isPlaying.set(false);

    const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
    if (this.durationS() > 0 && canvasWidth > 0) {
      this.playheadPx.set((this.currentTimeS() / this.durationS()) * canvasWidth);
    }

    this.cdr.markForCheck();
  }

  private onPlaybackSegmentEnded(): void {
    const rewindTo = this.playMode() === 'selection' ? this.regionFromS() : 0;
    const shouldLoop = this.playMode() === 'selection';
    const audio = this.audioRef?.nativeElement;

    this.playbackRequestToken++;

    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    if (audio) {
      audio.pause();
      audio.volume = this.masterVolume();
    }

    this.isPlaying.set(false);
    this.suppressBoundaryUntil = Date.now() + 300;
    this.suppressTimeSyncUntil = Date.now() + 250;
    this.suppressSegmentEndUntil = Date.now() + 300;
    this.currentTimeS.set(rewindTo);
    this.tracker.displayPositionS = rewindTo;

    const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playheadPx.set(
      this.durationS() > 0 ? (rewindTo / this.durationS()) * canvasWidth : 0,
    );

    this.cdr.markForCheck();

    if (!shouldLoop || !audio) return;

    const restart = () => {
      if (this.playMode() === 'selection') {
        this.startPlayback(this.regionFromS(), this.regionToS(), 'selection');
      }
    };

    if (Math.abs(audio.currentTime - rewindTo) < 0.05) {
      setTimeout(restart, 16);
    } else {
      audio.addEventListener('seeked', restart, { once: true });
      audio.currentTime = rewindTo;
    }
  }

  private syncPlaybackToSelectionBounds(): void {
    if (!this.isPlaying() || this.playMode() !== 'selection') return;
    if (Date.now() < this.suppressBoundaryUntil) return;

    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    const playableMax = this.getCurrentPlayableMaxS();
    const currentTime = audio.currentTime || 0;
    const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;

    this.playbackEndS = this.regionToS();

    if (playableMax < this.regionFromS()) {
      audio.pause();
      this.isPlaying.set(false);
      this.currentTimeS.set(playableMax);
      this.tracker.displayPositionS = playableMax;
      this.playheadPx.set(
        this.durationS() > 0 ? (playableMax / this.durationS()) * canvasWidth : 0,
      );
      this.cdr.markForCheck();
      return;
    }

    if (currentTime < this.regionFromS() || currentTime >= this.regionToS()) {
      this.seekLocal(this.regionFromS());

      if (this.regionFromS() <= playableMax + 0.05) {
        this.suppressBoundaryUntil = Date.now() + 220;
        this.suppressTimeSyncUntil = Date.now() + 180;
        audio.play().catch((error) => {
          console.warn('Play after boundary sync failed', error);
          this.toast.error('Playback could not continue.');
          this.isPlaying.set(false);
          this.cdr.markForCheck();
        });
        this.isPlaying.set(true);
      } else {
        audio.pause();
        this.isPlaying.set(false);
      }

      this.cdr.markForCheck();
      return;
    }

    this.currentTimeS.set(currentTime);

    if (!this.isScrubbing && Date.now() >= this.suppressTimeSyncUntil) {
      this.tracker.displayPositionS = currentTime;
    }

    this.playheadPx.set(
      this.durationS() > 0
        ? ((this.isScrubbing ? this.tracker.displayPositionS : currentTime) / this.durationS()) * canvasWidth
        : 0,
    );

    this.cdr.markForCheck();
  }

  private async initStream(url: string): Promise<void> {
    this.stopPlayback();
    this.destroyStream();
    this.lastToastErrorMessage = null;

    const generation = ++this.connectGeneration;

    this.loadingStream.set(true);
    this.audioReady.set(false);
    this.streamError.set(null);
    this.downloadProgress.set(0);
    this.streamComplete.set(false);
    this.currentTimeS.set(0);
    this.playheadPx.set(0);
    this.tracker.setWindow(0, this.durationS());
    this.tracker.setDuration(this.durationS());
    this.tracker.reset();

    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    audio.pause();
    audio.volume = 0;
    this.suppressNextError = true;
    audio.removeAttribute('src');
    audio.load();

this.stream.onProgress = (_bytes, complete, seekableMaxS) => {
  if (generation !== this.connectGeneration) return;

  this.zone.run(() => {
    this.downloadProgress.set(Math.round(this.stream.downloadedPercent));
    this.tracker.updateSeekable(seekableMaxS, complete);

    if (this.isPlaying()) {
      if (this.playMode() === 'selection') {
        this.syncPlaybackToSelectionBounds();
      } else {
        const playableMax = this.getCurrentPlayableMaxS();

        if (playableMax > this.playbackEndS) {
          this.playbackEndS = Math.min(this.durationS(), playableMax);
        }

        if (complete) {
          this.playbackEndS = this.durationS();
        }
      }
    }

    if (seekableMaxS > 0) {
      this.loadingStream.set(false);
    }

    if (complete) {
      this.downloadProgress.set(100);
      this.streamComplete.set(true);
      this.streamCompleted.emit();
    }

    this.cdr.markForCheck();
  });
};

    this.stream.onError = (message) => {
      if (generation !== this.connectGeneration) return;

      this.zone.run(() => {
        this.streamError.set(message);
        this.loadingStream.set(false);

        if (message && message !== this.lastToastErrorMessage) {
          this.lastToastErrorMessage = message;
          this.toast.error(message);
        }

        this.cdr.markForCheck();
      });
    };

    const onTimeUpdate = () => {
      if (this.isScrubbing || Date.now() < this.suppressTimeSyncUntil) return;

      this.zone.run(() => {
        const currentTime = audio.currentTime || 0;
        this.currentTimeS.set(currentTime);
        this.tracker.displayPositionS = currentTime;
        this.tracker.updateSeekable(this.tracker.seekableMaxS, false);

        const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
        if (this.durationS() > 0 && canvasWidth > 0) {
          this.playheadPx.set((currentTime / this.durationS()) * canvasWidth);
        }

        this.cdr.markForCheck();
      });
    };

    const onEnded = () => {
      this.zone.run(() => this.onPlaybackSegmentEnded());
    };

    const onError = () => {
      if (this.suppressNextError) {
        this.suppressNextError = false;
        return;
      }

      this.toast.error('Audio playback encountered an error.');
      console.warn('WindowEditor audio element error');
    };

    this.addAudioListener(audio, 'timeupdate', onTimeUpdate);
    this.addAudioListener(audio, 'ended', onEnded);
    this.addAudioListener(audio, 'error', onError);

    try {
      await this.stream.load(url, {
        audioElement: audio,
        useMse: 'MediaSource' in window,
        estimatedDurationS: this.durationS() || 0,
        windowStartS: 0,
        nativeForLongTracksOverS: Infinity,
        keepAllChunks: true,
        maxStoredBytes: Math.max(96 * 1024 * 1024, Math.ceil((this.durationS() || 0) * 40_000)),
      });
    } catch (error) {
      if (generation !== this.connectGeneration) return;

      console.error('WindowEditor stream load failed', error);
      this.zone.run(() => {
        const message = 'Failed to load audio stream.';
        this.streamError.set(message);
        this.loadingStream.set(false);
        this.toast.error(message);
        this.cdr.markForCheck();
      });
      return;
    }

    if (generation !== this.connectGeneration) return;

    const ready = await this.waitForAudioReady(audio, generation);
    if (!ready || generation !== this.connectGeneration) return;

    try {
      audio.currentTime = 0;
    } catch {}

    this.zone.run(() => {
      const duration = this.durationS();
      if ((!duration || duration <= 0) && isFinite(audio.duration) && audio.duration > 0) {
        this.tracker.setDuration(audio.duration);
        this.tracker.setWindow(0, audio.duration);
      }

      audio.volume = this.masterVolume();
      this.audioReady.set(true);
      this.loadingStream.set(false);

      if (!this.editorStateInitialized) {
        this.initializeRegionDefaults();
        this.editorStateInitialized = true;
      }

      this.cdr.markForCheck();
    });
  }

  private waitForAudioReady(
    audio: HTMLAudioElement,
    generation: number,
  ): Promise<boolean> {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve(generation === this.connectGeneration);
    }

    return new Promise<boolean>((resolve) => {
      const onReady = () => {
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          return;
        }

        cleanup();
        resolve(generation === this.connectGeneration);
      };

      const onError = () => {
        cleanup();
        resolve(false);
      };

      const poll = setInterval(() => {
        if (generation !== this.connectGeneration) {
          cleanup();
          resolve(false);
          return;
        }

        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          cleanup();
          resolve(true);
        }
      }, 30);

      const cleanup = () => {
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('playing', onReady);
        audio.removeEventListener('error', onError);
        clearInterval(poll);
      };

      audio.addEventListener('loadeddata', onReady);
      audio.addEventListener('canplay', onReady);
      audio.addEventListener('playing', onReady);
      audio.addEventListener('error', onError, { once: true });
    });
  }

  private addAudioListener(
    audio: HTMLAudioElement,
    type: string,
    fn: EventListener,
  ): void {
    audio.addEventListener(type, fn);
    this.audioListeners.push({ type, fn });
  }

  private destroyStream(): void {
    this.connectGeneration++;

    const audio = this.audioRef?.nativeElement;
    if (audio) {
      for (const listener of this.audioListeners) {
        audio.removeEventListener(listener.type, listener.fn);
      }

      this.audioListeners = [];

      audio.pause();
      audio.volume = this.masterVolume();
      this.suppressNextError = true;
      audio.removeAttribute('src');
      audio.load();
    }

    this.stream.destroy();
    this.audioReady.set(false);
    this.loadingStream.set(false);
    this.streamError.set(null);
    this.streamComplete.set(false);
  }

  private initializeRegionDefaults(): void {
    const duration = this.durationS();
    if (duration <= 0) return;

    if (this.initialFromS() == null && this.initialToS() == null) {
      this.regionFromS.set(0);
      this.regionToS.set(this.roundToTenth(duration));
    } else {
      if (this.initialFromS() != null) {
        this.regionFromS.set(this.initialFromS()!);
      }

      if (this.initialToS() != null) {
        this.regionToS.set(this.initialToS()!);
      }
    }

    this.windowName = this.initialName();
    this.fadeIn.set(this.initialFadeIn());
    this.fadeOut.set(this.initialFadeOut());
  }

  private buildEditorKey(): string {
    return [
      this.streamUrl() ?? '',
      this.initialFromS() ?? '',
      this.initialToS() ?? '',
      this.initialName() ?? '',
      this.initialFadeIn() ? '1' : '0',
      this.initialFadeOut() ? '1' : '0',
    ].join('|');
  }

  private applyPreviewFadeVolume(currentS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    let volume = 1;

    const applyFade = (start: number, end: number) => {
      const fadeDuration = Math.min(
        this.previewFadeDurationS,
        Math.max(0, (end - start) / 2),
      );

      if (fadeDuration <= 0) {
        return;
      }

      if (this.fadeIn()) {
        volume = Math.min(
          volume,
          Math.max(0, Math.min(1, (currentS - start) / fadeDuration)),
        );
      }

      if (this.fadeOut()) {
        volume = Math.min(
          volume,
          Math.max(0, Math.min(1, (end - currentS) / fadeDuration)),
        );
      }
    };

    if (this.playMode() === 'selection') {
      applyFade(this.regionFromS(), this.regionToS());
    } else {
      applyFade(0, this.durationS());
    }

    audio.volume = volume * this.masterVolume();
  }

  private getCurrentPlayableMaxS(): number {
    const bufferedEnd = this.tracker.getActualBufferedEndS();
    return bufferedEnd > 0
      ? Math.min(this.durationS(), bufferedEnd)
      : Math.min(this.durationS(), Math.max(0, this.tracker.seekableMaxS));
  }

  private clampToRegionBounds(positionS: number): number {
    const minS = this.playMode() === 'selection' ? this.regionFromS() : 0;
    const maxS = this.playMode() === 'selection' ? this.regionToS() : this.durationS();
    const bufferedMax = this.stream.streamComplete ? maxS : Math.min(maxS, this.tracker.seekableMaxS);
    return Math.max(minS, Math.min(positionS, bufferedMax));
  }

  private roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
  }
}