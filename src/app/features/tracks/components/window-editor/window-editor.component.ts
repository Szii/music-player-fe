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
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { UiVolumeSliderComponent } from '../../../../shared/ui/volume-slider/ui-volume-slider.component';
import { UiPlayButtonComponent } from '../../../../shared/ui/play-button/ui-play-button.component';
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
    UiTextInputComponent,
    NormalButtonComponent,
    UiVolumeSliderComponent,
    UiPlayButtonComponent,
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

      <div class="we-section we-info" *ngIf="durationS() > 0">
        <div class="we-info__grid">
          <div class="we-card">
            <span class="we-card__label">From</span>
            <div class="we-card__row">
              <input
                type="text"
                class="we-card__time-input"
                [value]="formatTime(regionFromS())"
                (change)="onFromTextChange($any($event.target).value)"
                aria-label="Selection start time"
              />
              <div class="we-card__nudge-group">
                <button
                  type="button"
                  class="we-nudge"
                  (click)="nudgeFrom(-1)"
                  aria-label="Decrease start by 1 second"
                >−</button>
                <button
                  type="button"
                  class="we-nudge"
                  (click)="nudgeFrom(1)"
                  aria-label="Increase start by 1 second"
                >+</button>
              </div>
            </div>
          </div>

          <div class="we-card">
            <span class="we-card__label">To</span>
            <div class="we-card__row">
              <input
                type="text"
                class="we-card__time-input"
                [value]="formatTime(regionToS())"
                (change)="onToTextChange($any($event.target).value)"
                aria-label="Selection end time"
              />
              <div class="we-card__nudge-group">
                <button
                  type="button"
                  class="we-nudge"
                  (click)="nudgeTo(-1)"
                  aria-label="Decrease end by 1 second"
                >−</button>
                <button
                  type="button"
                  class="we-nudge"
                  (click)="nudgeTo(1)"
                  aria-label="Increase end by 1 second"
                >+</button>
              </div>
            </div>
          </div>

          <div class="we-card">
            <span class="we-card__label">Length</span>
            <div class="we-card__row">
              <span class="we-card__time-display">
                {{ formatTime(regionToS() - regionFromS()) }}
              </span>
            </div>
          </div>

          <ui-volume-slider
            class="we-volume"
            *ngIf="audioReady()"
            [value]="volumePercent()"
            (preview)="onVolumeChange($event)"
            (commit)="onVolumeChange($event)"
          />
        </div>
      </div>

      <div
        class="we-section we-transport"
        *ngIf="audioReady() && durationS() > 0"
      >
        <div class="we-transport__actions">
          <ui-play-button
            size="sm"
            label="Play selection"
            [playing]="isPlaying() && playMode() === 'selection'"
            [disabled]="!streamComplete() && !(isPlaying() && playMode() === 'selection')"
            (clicked)="togglePlaySelection()"
          />
        </div>

        <div class="we-playback">
          <span class="we-playback__label">Playback</span>
          <span class="we-playback__time">{{ formatTime(currentTimeS()) }}</span>
          <input
            #seekRange
            class="we-seek__range app-range app-range--seek"
            type="range"
            min="0"
            [max]="durationS()"
            step="0.1"
            [value]="tracker.displayPositionS"
            [style.--app-range-track]="seekBackground()"
            (input)="onSeekInput($any($event.target).value)"
            (change)="onSeekCommit($any($event.target).value)"
            (mouseup)="seekRange.blur()"
            (touchend)="seekRange.blur()"
          />
          <span class="we-playback__time">{{ formatTime(durationS()) }}</span>
        </div>
      </div>

      <div class="we-section we-bottom" *ngIf="durationS() > 0">
        <div class="we-bottom__name-block">
          <label class="we-bottom__name-label" for="we-window-name">Window name</label>
          <div class="we-bottom__name-row">
            <ui-text-input
              id="we-window-name"
              class="we-bottom__name-input"
              [ngModel]="windowName()"
              (ngModelChange)="windowName.set($event)"
              placeholder="e.g. Intro"
            />
            <normal-button
              class="we-bottom__apply"
              type="button"
              variant="success"
              [disabled]="!canApply()"
              (clicked)="onApply()"
            >
              {{ applyLabel() }}
            </normal-button>
          </div>
        </div>

        <div class="we-bottom__tip-row" *ngIf="audioReady()">
          <span class="we-tip">
            <span class="we-tip__icon" aria-hidden="true">ⓘ</span>
            <span><strong>Tip:</strong> You can also play the full track to find the perfect part.</span>
          </span>

          <button
            type="button"
            class="we-pill we-pill--outline"
            (click)="togglePlayAll()"
            [class.we-pill--active]="isPlaying() && playMode() === 'full'"
            [disabled]="
              !canPlayAll() && !(isPlaying() && playMode() === 'full')
            "
          >
            <svg viewBox="0 0 20 20" width="11" height="11" aria-hidden="true">
              <polygon
                *ngIf="!(isPlaying() && playMode() === 'full')"
                points="4,2 18,10 4,18"
                fill="currentColor"
              />
              <rect
                *ngIf="isPlaying() && playMode() === 'full'"
                x="4"
                y="4"
                width="12"
                height="12"
                rx="1"
                fill="currentColor"
              />
            </svg>
            {{
              isPlaying() && playMode() === 'full'
                ? 'Stop full track'
                : 'Play full track'
            }}
          </button>
        </div>
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
      height: 16px;
      background: var(--app-surface);
      border-top: var(--app-border);
      overflow: hidden;
      flex-shrink: 0;
    }

    .we-ruler-mark {
      position: absolute;
      top: 1px;
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--app-text-muted);
      white-space: nowrap;
    }

    .we-ruler-mark:first-child {
      transform: translateX(0);
      padding-left: 2px;
    }

    .we-ruler-mark:last-child {
      transform: translateX(-100%);
      padding-right: 2px;
    }

    .we-section {
      padding: 10px 14px;
      border-top: var(--app-border);
      background: var(--app-surface);
      flex-shrink: 0;
    }

    .we-info {
      padding: 8px 12px;
    }

    .we-info__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, max-content)) minmax(200px, 1fr);
      gap: 8px;
      align-items: stretch;
    }

    @media (max-width: 880px) {
      .we-info__grid {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }
    }

    .we-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 10px 7px;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background: var(--app-surface-elevated);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
    }

    .we-card__label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-text-muted);
    }

    .we-card__row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
    }

    .we-card__time-input {
      flex: 0 0 auto;
      width: 56px;
      padding: 2px 4px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      color: var(--app-text);
      background: var(--app-bg-soft);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .we-card__time-input:focus-visible {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .we-card__time-display {
      font-size: 15px;
      font-weight: 700;
      color: var(--app-text);
      font-variant-numeric: tabular-nums;
      padding: 0 2px;
    }

    .we-card__nudge-group {
      display: inline-flex;
      gap: 3px;
    }

    .we-nudge {
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      color: var(--app-text);
      background: var(--app-bg-soft);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .we-nudge:hover:not(:disabled) {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
    }

    .we-nudge:focus-visible {
      outline: none;
      box-shadow: var(--app-focus-ring);
    }

    .we-nudge:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .we-transport {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 8px 14px;
    }

    .we-transport__actions {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .we-playback {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 260px;
    }

    .we-playback__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-text-muted);
    }

    .we-playback__time {
      font-size: 12px;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: center;
    }

    .we-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1;
      color: var(--app-text);
      background: var(--app-surface-elevated);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      cursor: pointer;
      white-space: nowrap;
      transition:
        background 0.12s,
        border-color 0.12s,
        color 0.12s,
        transform 0.12s,
        box-shadow 0.12s;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .we-pill:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .we-pill:focus-visible {
      outline: none;
      box-shadow: var(--app-focus-ring);
    }

    .we-pill:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .we-pill--outline:hover:not(:disabled),
    .we-pill--outline.we-pill--active {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
    }

    .we-pill--danger {
      background: var(--app-danger);
      color: #fff;
      border-color: var(--app-danger);
    }

    .we-pill--danger:hover:not(:disabled) {
      background: #8a1414;
      border-color: #8a1414;
      color: #fff;
    }

    .we-seek__range {
      flex: 1;
      min-width: 0;
    }

    .we-seek__time {
      font-size: 11px;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: center;
    }

    .we-volume {
      min-width: 0;
    }

    @media (max-width: 880px) {
      .we-volume {
        grid-column: 1 / -1;
      }
    }

    .we-bottom {
      background: var(--app-bg-soft);
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 14px 10px;
    }

    .we-bottom__name-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .we-bottom__name-label {
      font-family: var(--app-font-heading);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--app-heading);
    }

    .we-bottom__name-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .we-bottom__name-input {
      flex: 1 1 auto;
      min-width: 0;
    }

    .we-bottom__apply {
      flex: 0 0 auto;
    }

    .we-bottom__tip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding-top: 8px;
      border-top: 1px dashed var(--app-border-color-soft);
    }

    .we-tip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-style: italic;
      color: var(--app-text-muted);
    }

    .we-tip strong {
      font-style: normal;
      font-weight: 700;
      color: var(--app-text-muted);
    }

    .we-tip__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--app-bg-muted);
      color: var(--app-primary);
      font-size: 12px;
      font-weight: 700;
      font-style: normal;
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
    () =>
      this.regionFromS() < this.regionToS() &&
      this.streamComplete() &&
      this.windowName().trim().length > 0,
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

  readonly windowName = signal('');

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

  onFromTextChange(text: string): void {
    const parsed = this.parseTimeText(text);
    if (parsed === null) {
      this.cdr.markForCheck();
      return;
    }
    this.setRegionFrom(parsed);
  }

  onToTextChange(text: string): void {
    const parsed = this.parseTimeText(text);
    if (parsed === null) {
      this.cdr.markForCheck();
      return;
    }
    this.setRegionTo(parsed);
  }

  nudgeFrom(deltaSeconds: number): void {
    this.setRegionFrom(this.regionFromS() + deltaSeconds);
  }

  nudgeTo(deltaSeconds: number): void {
    this.setRegionTo(this.regionToS() + deltaSeconds);
  }

  private setRegionFrom(seconds: number): void {
    const maxFrom = Math.max(0, this.regionToS() - 0.1);
    const next = this.roundToTenth(Math.max(0, Math.min(maxFrom, seconds)));
    this.regionFromS.set(next);

    if (this.isPlaying() && this.playMode() === 'selection') {
      this.syncPlaybackToSelectionBounds();
    }

    this.waveformCanvasRef?.drawWaveform();
    this.cdr.markForCheck();
  }

  private setRegionTo(seconds: number): void {
    const minTo = this.regionFromS() + 0.1;
    const maxTo = this.durationS();
    const next = this.roundToTenth(Math.max(minTo, Math.min(maxTo, seconds)));
    this.regionToS.set(next);

    if (this.isPlaying() && this.playMode() === 'selection') {
      this.syncPlaybackToSelectionBounds();
    }

    this.waveformCanvasRef?.drawWaveform();
    this.cdr.markForCheck();
  }

  private parseTimeText(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const colonMatch = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(trimmed);
    if (colonMatch) {
      const minutes = Number(colonMatch[1]);
      const seconds = Number(colonMatch[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
        return null;
      }
      return minutes * 60 + seconds;
    }

    const plainMatch = /^\d+(?:\.\d+)?$/.exec(trimmed);
    if (plainMatch) {
      return Number(trimmed);
    }

    return null;
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
      name: this.windowName().trim(),
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
      this.initialName().trim() !== this.windowName().trim() ||
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

    this.windowName.set(this.initialName());
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