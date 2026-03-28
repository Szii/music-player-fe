import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioStreamManager } from '../../../../shared/features/audio-stream-manager/audio-stream-manager';
import { PlaybackPositionTracker } from '../../../../shared/features/audio-stream-manager/playback-position-tracker';
import { WaveformCanvasComponent, RegionChangeEvent } from '../waveform-canvas/waveform-canvas.component';
import { WindowTransportComponent } from '../window-transport/window-transport.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiFormRowComponent } from '../../../../shared/ui/form-row/ui-form-row.component';
import { UiFormActionsComponent } from '../../../../shared/ui/form-actions/ui-form-actions.component';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="we-root">
      <audio
        #audio
        hidden
        preload="none"
        (ended)="onAudioEnded()"
        (error)="onAudioElementError()"
      ></audio>

      <app-waveform-canvas
        #waveformCanvas
        [durationS]="durationS"
        [regionFromS]="regionFromS"
        [regionToS]="regionToS"
        [seekableMaxS]="tracker.seekableMaxS"
        [playheadPx]="playheadPx"
        [waveformPeaks]="waveformPeaks"
        [fadeIn]="fadeIn"
        [fadeOut]="fadeOut"
        [audioReady]="audioReady"
        [loadingStream]="loadingStream"
        [downloadProgress]="downloadProgress"
        [streamError]="streamError"
        [waveformLoading]="waveformLoading"
        [waveformReady]="waveformReady"
        [waveformError]="waveformError"
        [handlesDisabled]="!streamComplete"
        (regionChange)="onRegionChange($event)"
        (seekRequested)="seekLocal($event)"
      />

      <div class="we-ruler" *ngIf="durationS > 0">
        <span
          class="we-ruler-mark"
          *ngFor="let m of rulerMarks"
          [style.left.%]="m.pct"
        >
          {{ m.label }}
        </span>
      </div>

      <div class="we-section we-section--compact" *ngIf="durationS > 0">
        <ui-form-row>
          <div class="we-duration">
            <span class="we-duration__label">Selection length</span>
            <span class="we-duration__value">{{ formatTime(regionToS - regionFromS) }}</span>
          </div>

          <div class="we-times">
            <div class="we-time-chip">
              <span class="we-time-chip__label">From</span>
              <span class="we-time-chip__value">{{ formatTime(regionFromS) }}</span>
            </div>

            <div class="we-time-chip">
              <span class="we-time-chip__label">To</span>
              <span class="we-time-chip__value">{{ formatTime(regionToS) }}</span>
            </div>
          </div>
        </ui-form-row>
      </div>

      <div class="we-seek we-section" *ngIf="audioReady && durationS > 0">
        <span class="we-seek__time">{{ formatTime(currentTimeS) }}</span>
        <input
          class="we-seek__range"
          type="range"
          min="0"
          [max]="durationS"
          step="0.1"
          [value]="tracker.displayPositionS"
          [style.background]="seekBackground"
          (input)="onSeekInput($any($event.target).value)"
          (change)="onSeekCommit($any($event.target).value)"
        />
        <span class="we-seek__time">{{ formatTime(durationS) }}</span>
      </div>

      <app-window-transport
        *ngIf="audioReady"
        [isPlaying]="isPlaying"
        [playMode]="playMode"
        [fadeIn]="fadeIn"
        [fadeOut]="fadeOut"
        [playSelectionDisabled]="!streamComplete"
        (playAll)="togglePlayAll()"
        (playSelection)="togglePlaySelection()"
        (fadeInChange)="fadeIn = $event; redrawCanvas()"
        (fadeOutChange)="fadeOut = $event; redrawCanvas()"
      />

      <div class="we-section we-bottom" *ngIf="durationS > 0">
        <ui-form-row>
          <div class="we-name-field">
            <ui-form-field label="Window name">
              <ui-text-input [(ngModel)]="windowName" placeholder="e.g. Intro" />
            </ui-form-field>
          </div>

          <ui-form-actions>
            <normal-button
              type="button"
              variant="success"
              [disabled]="regionFromS >= regionToS || !streamComplete"
              (clicked)="onApply()"
            >
              {{ applyLabel }}
            </normal-button>
          </ui-form-actions>
        </ui-form-row>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
      height: 100%;
    }

    .we-root {
      background: var(--app-surface);
      overflow: auto;
      font: inherit;
      color: var(--app-text);
      min-width: 0;
      min-height: 0;
      height: 100%;
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

    .we-duration {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
      justify-content: flex-end;
    }

    .we-duration__label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .we-duration__value {
      font-size: 14px;
      font-weight: 700;
      color: var(--app-primary);
      font-variant-numeric: tabular-nums;
    }

    .we-times {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .we-time-chip {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--app-bg-soft);
      min-width: 82px;
    }

    .we-time-chip__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--app-text-muted);
    }

    .we-time-chip__value {
      font-size: 13px;
      font-weight: 700;
      color: var(--app-text);
      font-variant-numeric: tabular-nums;
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

    .we-name-field {
      flex: 1;
      min-width: 220px;
    }

    .we-bottom {
      background: var(--app-bg-soft);
    }
  `],
})
export class WindowEditorComponent implements OnChanges, OnDestroy, AfterViewInit {
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @Input() streamUrl: string | null = null;
  @Input() durationS = 0;
  @Input() waveformPeaks: number[] = [];
  @Input() waveformLoading = false;
  @Input() waveformError: string | null = null;
  @Input() initialFromS: number | null = null;
  @Input() initialToS: number | null = null;
  @Input() initialName = '';
  @Input() initialFadeIn = false;
  @Input() initialFadeOut = false;
  @Input() applyLabel = 'Apply window';

  @Output() apply = new EventEmitter<WindowEditorResult>();
  @Output() streamCompleted = new EventEmitter<void>();

  @ViewChild('audio') audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('waveformCanvas') waveformCanvasRef!: WaveformCanvasComponent;

  loadingStream = false;
  audioReady = false;
  streamError: string | null = null;
  downloadProgress = 0;

  regionFromS = 0;
  regionToS = 0;
  windowName = '';
  fadeIn = false;
  fadeOut = false;

  currentTimeS = 0;
  playheadPx = 0;
  isPlaying = false;
  playMode: 'full' | 'selection' = 'full';

  rulerMarks: { pct: number; label: string }[] = [];

  readonly tracker = new PlaybackPositionTracker(() => this.audioRef?.nativeElement ?? null);

  get waveformReady(): boolean { return this.waveformPeaks.length > 0 && this.durationS > 0; }
  get streamComplete(): boolean { return this.stream.streamComplete; }

  get seekBackground(): string {
    const dur = this.durationS;
    if (dur <= 0) return 'var(--app-border-color)';
    const loadedPct = Math.min((this.tracker.seekableMaxS / dur) * 100, 100);
    const selStartPct = Math.max(0, (this.regionFromS / dur) * 100);
    const selEndPct = Math.min(100, (this.regionToS / dur) * 100);
    return `linear-gradient(to right,
      var(--app-border-color) 0%, var(--app-border-color) ${selStartPct}%,
      var(--app-primary-soft) ${selStartPct}%, var(--app-primary-soft) ${selEndPct}%,
      var(--app-border-color) ${selEndPct}%, var(--app-border-color) 100%),
      linear-gradient(to right,
      var(--app-primary) 0%, var(--app-primary) ${loadedPct}%,
      var(--app-border-color) ${loadedPct}%, var(--app-border-color) 100%)`;
  }

  private stream = new AudioStreamManager();
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private playbackEndS = 0;
  private isScrubbing = false;
  private suppressNextError = false;
  private suppressSelectionBoundaryUntil = 0;
  private suppressTimeSyncUntil = 0;
  private suppressSegmentEndUntil = 0;
  private readonly previewFadeDurationS = 1.0;

  private viewReady = false;
  private pendingStreamUrl: string | null = null;
  private editorStateInitialized = false;
  private lastEditorKey = '';

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.pendingStreamUrl) {
      const url = this.pendingStreamUrl;
      this.pendingStreamUrl = null;
      this.initStream(url);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const nextKey = this.buildEditorKey();
    const identityChanged = nextKey !== this.lastEditorKey
      || ('streamUrl' in changes && !changes['streamUrl'].firstChange);

    if (identityChanged) {
      this.lastEditorKey = nextKey;
      this.editorStateInitialized = false;
    }

    if (!this.editorStateInitialized && this.durationS > 0) {
      this.initializeRegionDefaults();
      this.editorStateInitialized = true;
    }

    if ('durationS' in changes) {
      this.tracker.setDuration(this.durationS);
      this.tracker.setWindow(0, this.durationS);
      this.buildRulerMarks();
    }

    if ('streamUrl' in changes) {
      if (!this.streamUrl) {
        this.stopPlayback();
        this.stream.destroy();
        this.audioReady = false;
        this.loadingStream = false;
        this.streamError = null;
        return;
      }

      if (!this.viewReady) {
        this.pendingStreamUrl = this.streamUrl;
      } else {
        this.initStream(this.streamUrl);
      }
    }
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    this.stream.destroy();
    const audio = this.audioRef?.nativeElement;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }

  onRegionChange(e: RegionChangeEvent): void {
    this.regionFromS = e.fromS;
    this.regionToS = e.toS;

    if (this.isPlaying && this.playMode === 'selection') {
      this.syncPlaybackToSelectionBounds();
    }

    this.cdr.markForCheck();
  }

  redrawCanvas(): void {
    this.waveformCanvasRef?.drawWaveform();
    this.cdr.markForCheck();
  }

  onSeekInput(value: string): void {
    this.isScrubbing = true;
    this.tracker.displayPositionS = this.clampToRegionBounds(Number(value));
    const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playheadPx = this.durationS > 0 ? (this.tracker.displayPositionS / this.durationS) * cw : 0;
    this.cdr.markForCheck();
  }

  onSeekCommit(value: string): void {
    this.isScrubbing = false;
    this.seekLocal(this.clampToRegionBounds(Number(value)));
  }

  seekLocal(targetS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio || !this.audioReady) return;

    const requested = this.clampToRegionBounds(targetS);
    const wasPlaying = this.isPlaying && !audio.paused;

    if (this.stream.usingBlob) {
      if (this.stream.isBlobSeekable(requested)) {
        audio.currentTime = requested;
      } else {
        this.suppressNextError = true;
        this.stream.switchToBlobSrc(requested, wasPlaying);
      }
    } else if (this.stream.usingMse) {
      if (this.stream.isInMseBuffer(requested)) {
        audio.currentTime = requested;
      } else {
        this.suppressNextError = true;
        this.stream.switchToBlobSrc(requested, wasPlaying);
      }
    } else {
      audio.currentTime = requested;
    }

    this.currentTimeS = requested;
    this.tracker.displayPositionS = requested;
    const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playheadPx = this.durationS > 0 ? (requested / this.durationS) * cw : 0;
    this.applyPreviewFadeVolume(requested);
    this.suppressTimeSyncUntil = Date.now() + 120;
    this.cdr.markForCheck();
  }

  togglePlayAll(): void {
    if (this.isPlaying && this.playMode === 'full') {
      this.stopPlayback();
    } else {
      this.startPlayback(0, this.durationS, 'full');
    }
  }

  togglePlaySelection(): void {
    if (this.isPlaying && this.playMode === 'selection') {
      this.stopPlayback();
    } else {
      this.startPlayback(this.regionFromS, this.regionToS, 'selection');
    }
  }

  private startPlayback(fromS: number, toS: number, mode: 'full' | 'selection'): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio || !this.audioReady) return;

    const startFrom = this.clampToRegionBounds(fromS);
    const endAt = Math.max(startFrom, Math.min(toS, this.durationS));

    this.stopPlayback();
    this.playMode = mode;
    this.playbackEndS = endAt;
    this.isPlaying = true;

    this.seekLocal(startFrom);
    this.applyPreviewFadeVolume(startFrom);

    audio.play().catch(err => console.warn('WindowEditor play failed', err));

    this.playbackTimer = setInterval(() => {
      this.zone.run(() => {
        const cur = audio.currentTime || 0;

        if (
          this.playMode === 'selection' &&
          Date.now() >= this.suppressSelectionBoundaryUntil &&
          (cur < this.regionFromS || cur >= this.regionToS)
        ) {
          this.syncPlaybackToSelectionBounds();
          return;
        }

        this.applyPreviewFadeVolume(cur);

        if (
          Date.now() >= this.suppressSegmentEndUntil &&
          (cur >= this.playbackEndS || (audio.ended && this.stream.streamComplete))
        ) {
          this.onPlaybackSegmentEnded();
          return;
        }

        this.currentTimeS = cur;

        if (!this.isScrubbing && Date.now() >= this.suppressTimeSyncUntil) {
          this.tracker.displayPositionS = cur;
        }

        const w = this.waveformCanvasRef?.canvasWidth ?? 0;
        if (this.durationS > 0 && w > 0) {
          this.playheadPx = ((this.isScrubbing ? this.tracker.displayPositionS : cur) / this.durationS) * w;
        }

        this.cdr.markForCheck();
      });
    }, 30);

    this.cdr.markForCheck();
  }

  stopPlayback(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    const audio = this.audioRef?.nativeElement;
    if (audio && this.isPlaying) {
      audio.pause();
      this.currentTimeS = audio.currentTime || 0;
      this.tracker.displayPositionS = this.currentTimeS;
    }

    if (audio) {
      audio.volume = 1;
    }

    this.isPlaying = false;
    const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
    if (this.durationS > 0 && cw > 0) {
      this.playheadPx = (this.currentTimeS / this.durationS) * cw;
    }

    this.cdr.markForCheck();
  }

  onAudioEnded(): void {
    this.onPlaybackSegmentEnded();
  }

  onAudioElementError(): void {
    if (this.suppressNextError) {
      this.suppressNextError = false;
      return;
    }
    console.warn('WindowEditor audio element error');
  }

  private onPlaybackSegmentEnded(): void {
    const rewindTo = this.playMode === 'selection' ? this.regionFromS : 0;
    const shouldContinue = this.playMode === 'selection';
    const audio = this.audioRef?.nativeElement;

    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    if (audio) {
      audio.pause();
      audio.volume = 1;
    }

    this.isPlaying = false;
    this.suppressSelectionBoundaryUntil = Date.now() + 300;
    this.suppressTimeSyncUntil = Date.now() + 250;
    this.suppressSegmentEndUntil = Date.now() + 300;
    this.currentTimeS = rewindTo;
    this.tracker.displayPositionS = rewindTo;

    const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playheadPx = this.durationS > 0 ? (rewindTo / this.durationS) * cw : 0;
    this.cdr.markForCheck();

    if (!shouldContinue || !audio) return;

    const startAfterSeek = () => {
      if (this.playMode === 'selection') {
        this.startPlayback(this.regionFromS, this.regionToS, 'selection');
      }
    };

    if (Math.abs(audio.currentTime - rewindTo) < 0.05) {
      setTimeout(startAfterSeek, 16);
    } else {
      audio.addEventListener('seeked', startAfterSeek, { once: true });
      audio.currentTime = rewindTo;
    }
  }

  private syncPlaybackToSelectionBounds(): void {
    if (!this.isPlaying || this.playMode !== 'selection') return;
    if (Date.now() < this.suppressSelectionBoundaryUntil) return;

    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    const actualMax = this.getCurrentPlayableMaxS();
    const cur = audio.currentTime || 0;
    const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
    this.playbackEndS = this.regionToS;

    if (actualMax < this.regionFromS) {
      audio.pause();
      this.isPlaying = false;
      this.currentTimeS = actualMax;
      this.tracker.displayPositionS = actualMax;
      this.playheadPx = this.durationS > 0 ? (actualMax / this.durationS) * cw : 0;
      this.cdr.markForCheck();
      return;
    }

    if (cur < this.regionFromS || cur >= this.regionToS) {
      this.seekLocal(this.regionFromS);

      if (this.regionFromS <= actualMax + 0.05) {
        this.suppressSelectionBoundaryUntil = Date.now() + 220;
        this.suppressTimeSyncUntil = Date.now() + 180;
        audio.play().catch(err => console.warn('play after boundary sync failed', err));
        this.isPlaying = true;
      } else {
        audio.pause();
        this.isPlaying = false;
      }

      this.cdr.markForCheck();
      return;
    }

    this.currentTimeS = cur;
    if (!this.isScrubbing && Date.now() >= this.suppressTimeSyncUntil) {
      this.tracker.displayPositionS = cur;
    }

    this.playheadPx = this.durationS > 0
      ? ((this.isScrubbing ? this.tracker.displayPositionS : cur) / this.durationS) * cw
      : 0;

    this.cdr.markForCheck();
  }

  private initStream(url: string): void {
    this.stopPlayback();
    this.stream.destroy();

    this.loadingStream = true;
    this.audioReady = false;
    this.streamError = null;
    this.downloadProgress = 0;
    this.currentTimeS = 0;
    this.tracker.displayPositionS = 0;
    this.playheadPx = 0;
    this.tracker.setWindow(0, this.durationS);
    this.tracker.setDuration(this.durationS);
    this.tracker.reset();

    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    audio.pause();
    this.suppressNextError = true;
    audio.removeAttribute('src');
    audio.load();

    this.stream.onProgress = (_bytes, complete, seekableMaxS) => {
      this.zone.run(() => {
        this.downloadProgress = Math.round(this.stream.downloadedPercent);
        this.tracker.updateSeekable(seekableMaxS, complete);

        if (this.isPlaying && this.playMode === 'selection') {
          this.syncPlaybackToSelectionBounds();
        }

        if (seekableMaxS > 0) {
          this.loadingStream = false;
        }

        if (complete) {
          this.downloadProgress = 100;
          this.streamCompleted.emit();
        }

        this.cdr.markForCheck();
      });
    };

    this.stream.onError = (message) => {
      this.zone.run(() => {
        this.streamError = message;
        this.loadingStream = false;
        this.cdr.markForCheck();
      });
    };

    this.stream.load(url, {
      audioElement: audio,
      useMse: 'MediaSource' in window,
      estimatedDurationS: this.durationS || 0,
      windowStartS: 0,
    }).catch(e => {
      console.error('WindowEditor stream load failed', e);
      this.zone.run(() => {
        this.streamError = 'Failed to load audio stream.';
        this.loadingStream = false;
        this.cdr.markForCheck();
      });
    });

    audio.onloadedmetadata = () => {
      this.zone.run(() => {
        if ((!this.durationS || this.durationS <= 0) && isFinite(audio.duration) && audio.duration > 0) {
          this.durationS = audio.duration;
          this.tracker.setDuration(this.durationS);
          this.tracker.setWindow(0, this.durationS);
        }

        this.audioReady = true;
        this.loadingStream = false;

        if (!this.editorStateInitialized) {
          this.initializeRegionDefaults();
          this.editorStateInitialized = true;
        }

        this.buildRulerMarks();
        this.cdr.markForCheck();
      });
    };

    audio.ontimeupdate = () => {
      if (this.isScrubbing || Date.now() < this.suppressTimeSyncUntil) return;

      this.zone.run(() => {
        const cur = audio.currentTime || 0;
        this.currentTimeS = cur;
        this.tracker.displayPositionS = cur;
        this.tracker.updateSeekable(this.tracker.seekableMaxS, false);

        const cw = this.waveformCanvasRef?.canvasWidth ?? 0;
        if (this.durationS > 0 && cw > 0) {
          this.playheadPx = (cur / this.durationS) * cw;
        }

        this.cdr.markForCheck();
      });
    };
  }

  onApply(): void {
    this.apply.emit({
      name: this.windowName,
      positionFrom: this.regionFromS,
      positionTo: this.regionToS,
      fadeIn: this.fadeIn,
      fadeOut: this.fadeOut,
    });
  }

  private initializeRegionDefaults(): void {
    if (this.durationS <= 0) return;

    if (this.initialFromS == null && this.initialToS == null) {
      this.regionFromS = 0;
      this.regionToS = Math.round(this.durationS * 10) / 10;
    } else {
      if (this.initialFromS != null) this.regionFromS = this.initialFromS;
      if (this.initialToS != null) this.regionToS = this.initialToS;
    }

    this.windowName = this.initialName;
    this.fadeIn = this.initialFadeIn;
    this.fadeOut = this.initialFadeOut;
  }

  private buildRulerMarks(): void {
    const dur = this.durationS;
    if (dur <= 0) {
      this.rulerMarks = [];
      return;
    }

    const stepS = dur <= 15 ? 1 : dur <= 60 ? 5 : dur <= 300 ? 15 : dur <= 600 ? 30 : 60;
    const marks: { pct: number; label: string }[] = [];

    for (let t = 0; t <= dur; t += stepS) {
      marks.push({ pct: (t / dur) * 100, label: this.formatTime(t) });
    }

    this.rulerMarks = marks;
  }

  private buildEditorKey(): string {
    return [
      this.streamUrl ?? '',
      this.initialFromS ?? '',
      this.initialToS ?? '',
      this.initialName ?? '',
      this.initialFadeIn ?? '',
      this.initialFadeOut ?? '',
    ].join('|');
  }

  private applyPreviewFadeVolume(currentS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    let volume = 1;

    const applyFade = (start: number, end: number) => {
      const fadeDur = Math.min(this.previewFadeDurationS, Math.max(0, (end - start) / 2));

      if (this.fadeIn && fadeDur > 0) {
        volume = Math.min(volume, Math.max(0, Math.min(1, (currentS - start) / fadeDur)));
      }

      if (this.fadeOut && fadeDur > 0) {
        volume = Math.min(volume, Math.max(0, Math.min(1, (end - currentS) / fadeDur)));
      }
    };

    if (this.playMode === 'selection') {
      applyFade(this.regionFromS, this.regionToS);
    } else {
      applyFade(0, this.durationS);
    }

    audio.volume = volume;
  }

  private getCurrentPlayableMaxS(): number {
    const bufferedEnd = this.tracker.getActualBufferedEndS();
    return bufferedEnd > 0
      ? Math.min(this.durationS, bufferedEnd)
      : Math.min(this.durationS, Math.max(0, this.tracker.seekableMaxS));
  }

  private clampToRegionBounds(posS: number): number {
    const minS = this.playMode === 'selection' ? this.regionFromS : 0;
    const maxS = this.playMode === 'selection' ? this.regionToS : this.durationS;
    return Math.max(minS, Math.min(posS, maxS));
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}