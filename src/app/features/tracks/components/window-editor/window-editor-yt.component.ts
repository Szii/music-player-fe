import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { YoutubeIframeApiService } from '../../../../core/services/youtube-iframe-api.service';
import { WindowEditorResult } from './window-editor.component';

type PlayMode = 'full' | 'selection';

/**
 * YouTube IFrame-backed window editor (experimental, behind
 * {@link USE_YT_IFRAME_PLAYER}).
 *
 * A real amplitude waveform isn't obtainable for YouTube tracks (the backend is
 * IP-locked and the iframe never exposes PCM), so this is a timeline editor: a
 * whole-track ruler with draggable region handles and a playhead, with audio
 * preview (play full / play selection / seek) driven by a YouTube player. The
 * waveform canvas is reused with empty peaks to render the timeline.
 *
 * Mirrors {@link WindowEditorResult} on apply so the panel handles it
 * identically to the stream-based editor.
 */
@Component({
  selector: 'app-window-editor-yt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    WaveformCanvasComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    UiVolumeSliderComponent,
    UiPlayButtonComponent,
  ],
  template: `
    <div class="we-root">
      <app-waveform-canvas
        #waveformCanvas
        [durationS]="durationS()"
        [regionFromS]="regionFromS()"
        [regionToS]="regionToS()"
        [seekableMaxS]="durationS()"
        [playheadPx]="playheadPx()"
        [waveformPeaks]="[]"
        [fadeIn]="fadeIn()"
        [fadeOut]="fadeOut()"
        [audioReady]="audioReady()"
        [waveformReady]="true"
        [handlesDisabled]="!audioReady()"
        (regionChange)="onRegionChange($event)"
        (seekRequested)="seekLocal($event)"
      />

      @if (durationS() > 0) {
        <div class="we-ruler">
          @for (mark of rulerMarks(); track mark.pct) {
            <span class="we-ruler-mark" [style.left.%]="mark.pct">{{ mark.label }}</span>
          }
        </div>
      }

      @if (durationS() > 0) {
        <div class="we-section we-info">
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
                  <button type="button" class="we-nudge" (click)="nudgeFrom(-1)" aria-label="Decrease start by 1 second">−</button>
                  <button type="button" class="we-nudge" (click)="nudgeFrom(1)" aria-label="Increase start by 1 second">+</button>
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
                  <button type="button" class="we-nudge" (click)="nudgeTo(-1)" aria-label="Decrease end by 1 second">−</button>
                  <button type="button" class="we-nudge" (click)="nudgeTo(1)" aria-label="Increase end by 1 second">+</button>
                </div>
              </div>
            </div>

            <div class="we-card">
              <span class="we-card__label">Length</span>
              <div class="we-card__row">
                <span class="we-card__time-display">{{ formatTime(regionToS() - regionFromS()) }}</span>
              </div>
            </div>

            @if (audioReady()) {
              <ui-volume-slider
                class="we-volume"
                [value]="volumePercent()"
                (preview)="onVolumeChange($event)"
                (commit)="onVolumeChange($event)"
              />
            }
          </div>
        </div>
      }

      @if (audioReady() && durationS() > 0) {
        <div class="we-section we-transport">
          <div class="we-transport__actions">
            <ui-play-button
              size="sm"
              label="Play selection"
              [playing]="isPlaying() && playMode() === 'selection'"
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
              [value]="currentTimeS()"
              [style.--app-range-track]="seekBackground()"
              (input)="onSeekInput($any($event.target).value)"
              (change)="onSeekCommit($any($event.target).value)"
              (mouseup)="seekRange.blur()"
              (touchend)="seekRange.blur()"
            />
            <span class="we-playback__time">{{ formatTime(durationS()) }}</span>
          </div>
        </div>
      }

      @if (durationS() > 0) {
        <div class="we-section we-bottom">
          <div class="we-bottom__name-block">
            <label class="we-bottom__name-label" for="we-yt-window-name">Window name</label>
            <div class="we-bottom__name-row">
              <ui-text-input
                id="we-yt-window-name"
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

          @if (audioReady()) {
            <div class="we-bottom__tip-row">
              <span class="we-tip">
                <span class="we-tip__icon" aria-hidden="true">ⓘ</span>
                <span><strong>Tip:</strong> Play the full track to find the perfect part.</span>
              </span>

              <button
                type="button"
                class="we-pill we-pill--outline"
                (click)="togglePlayAll()"
                [class.we-pill--active]="isPlaying() && playMode() === 'full'"
              >
                {{ isPlaying() && playMode() === 'full' ? 'Stop full track' : 'Play full track' }}
              </button>
            </div>
          }
        </div>
      }

      <div class="we-yt-host" aria-hidden="true">
        <div #mount></div>
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

    .we-ruler-mark:first-child { transform: translateX(0); padding-left: 2px; }
    .we-ruler-mark:last-child { transform: translateX(-100%); padding-right: 2px; }

    .we-section {
      padding: 10px 14px;
      border-top: var(--app-border);
      background: var(--app-surface);
      flex-shrink: 0;
    }

    .we-info { padding: 8px 12px; }

    .we-info__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, max-content)) minmax(200px, 1fr);
      gap: 8px;
      align-items: stretch;
    }

    @media (max-width: 880px) {
      .we-info__grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .we-volume { grid-column: 1 / -1; }
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

    .we-card__row { display: flex; align-items: center; gap: 6px; min-height: 26px; }

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

    .we-card__nudge-group { display: inline-flex; gap: 3px; }

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

    .we-nudge:hover {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
    }

    .we-nudge:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

    .we-transport {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 8px 14px;
    }

    .we-transport__actions { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }

    .we-playback { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 260px; }

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

    .we-seek__range { flex: 1; min-width: 0; }

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
      transition: background 0.12s, border-color 0.12s, color 0.12s, transform 0.12s;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .we-pill:hover { transform: translateY(-1px); }
    .we-pill:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

    .we-pill--outline:hover,
    .we-pill--outline.we-pill--active {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
    }

    .we-bottom {
      background: var(--app-bg-soft);
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 14px 10px;
    }

    .we-bottom__name-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

    .we-bottom__name-label {
      font-family: var(--app-font-heading);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--app-heading);
    }

    .we-bottom__name-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .we-bottom__name-input { flex: 1 1 auto; min-width: 0; }
    .we-bottom__apply { flex: 0 0 auto; }

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

    .we-tip strong { font-style: normal; font-weight: 700; color: var(--app-text-muted); }

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

    .we-yt-host {
      position: fixed;
      left: -10000px;
      top: 0;
      width: 320px;
      height: 180px;
      pointer-events: none;
    }
  `],
})
export class WindowEditorYtComponent {
  private static readonly POLL_INTERVAL_MS = 50;
  private static readonly PREVIEW_FADE_S = 1.0;

  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly api = inject(YoutubeIframeApiService);

  readonly videoId = input<string | null>(null);
  readonly durationS = input(0);
  readonly initialFromS = input<number | null>(null);
  readonly initialToS = input<number | null>(null);
  readonly initialName = input('');
  readonly initialFadeIn = input(false);
  readonly initialFadeOut = input(false);
  readonly applyLabel = input('Apply window');

  readonly apply = output<WindowEditorResult>();
  readonly ready = output<void>();

  @ViewChild('waveformCanvas') waveformCanvasRef?: WaveformCanvasComponent;
  @ViewChild('mount', { static: true }) mountRef?: ElementRef<HTMLDivElement>;

  readonly regionFromS = signal(0);
  readonly regionToS = signal(0);
  readonly currentTimeS = signal(0);
  readonly playheadPx = signal(0);
  readonly isPlaying = signal(false);
  readonly playMode = signal<PlayMode>('full');
  readonly fadeIn = signal(false);
  readonly fadeOut = signal(false);
  readonly audioReady = signal(false);
  readonly masterVolume = signal(0.5);
  readonly windowName = signal('');

  readonly volumePercent = computed(() => Math.round(this.masterVolume() * 100));

  readonly canApply = computed(
    () =>
      this.regionFromS() < this.regionToS() &&
      this.audioReady() &&
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
      marks.push({ pct: (t / duration) * 100, label: this.formatTime(t) });
    }
    return marks;
  });

  readonly seekBackground = computed(() => {
    const duration = this.durationS();
    if (duration <= 0) return 'var(--app-border-color)';

    const startPct = Math.max(0, (this.regionFromS() / duration) * 100);
    const endPct = Math.min(100, (this.regionToS() / duration) * 100);

    return `linear-gradient(to right,
      var(--app-border-color) 0%, var(--app-border-color) ${startPct}%,
      var(--app-primary-soft) ${startPct}%, var(--app-primary-soft) ${endPct}%,
      var(--app-border-color) ${endPct}%, var(--app-border-color) 100%),
      linear-gradient(to right, var(--app-primary) 0%, var(--app-primary) 100%)`;
  });

  private player: YT.Player | null = null;
  private playerReady = false;
  private creating = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private playbackEndS = 0;
  private isScrubbing = false;
  private regionInitialized = false;
  private loadToken = 0;

  constructor() {
    // (Re)create the player when the video id changes.
    effect(() => {
      const id = this.videoId();
      this.onVideoIdChange(id);
    });

    // Initialise the region once a duration is known.
    effect(() => {
      const duration = this.durationS();
      if (duration > 0 && !this.regionInitialized) {
        this.initializeRegionDefaults(duration);
        this.regionInitialized = true;
      }
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  onRegionChange(event: RegionChangeEvent): void {
    this.regionFromS.set(event.fromS);
    this.regionToS.set(event.toS);
    this.syncSelectionBounds();
  }

  onFromTextChange(text: string): void {
    const parsed = this.parseTimeText(text);
    if (parsed !== null) this.setRegionFrom(parsed);
  }

  onToTextChange(text: string): void {
    const parsed = this.parseTimeText(text);
    if (parsed !== null) this.setRegionTo(parsed);
  }

  nudgeFrom(deltaSeconds: number): void {
    this.setRegionFrom(this.regionFromS() + deltaSeconds);
  }

  nudgeTo(deltaSeconds: number): void {
    this.setRegionTo(this.regionToS() + deltaSeconds);
  }

  onVolumeChange(value: string | number): void {
    const numeric = Math.max(0, Math.min(100, Number(value)));
    this.masterVolume.set(numeric / 100);
    this.applyFadeVolume(this.currentTimeS());
  }

  onSeekInput(value: string): void {
    this.isScrubbing = true;
    const clamped = this.clamp(Number(value), 0, this.durationS());
    this.currentTimeS.set(clamped);
    this.updatePlayhead(clamped);
  }

  onSeekCommit(value: string): void {
    this.isScrubbing = false;
    this.seekLocal(Number(value));
  }

  seekLocal(targetS: number): void {
    // Seeking is free across the whole track. If the user seeks outside the
    // selection while it's looping, leave selection mode so playback isn't
    // pulled back to the region start.
    const clamped = this.clamp(targetS, 0, this.durationS());

    if (
      this.isPlaying() &&
      this.playMode() === 'selection' &&
      (clamped < this.regionFromS() || clamped > this.regionToS())
    ) {
      this.playMode.set('full');
      this.playbackEndS = this.durationS();
    }

    this.currentTimeS.set(clamped);
    this.updatePlayhead(clamped);

    if (this.player && this.playerReady) {
      this.player.seekTo(clamped, true);
    }
  }

  togglePlayAll(): void {
    if (this.isPlaying() && this.playMode() === 'full') {
      this.stopPlayback();
      return;
    }
    this.startPlayback(0, this.durationS(), 'full');
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
      this.toast.warning('Pick a name and a valid selection first.');
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
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private startPlayback(fromS: number, toS: number, mode: PlayMode): void {
    if (!this.player || !this.playerReady) return;

    this.stopPlaybackTimerOnly();
    this.playMode.set(mode);

    const startFrom = this.clamp(fromS, 0, this.durationS());
    this.playbackEndS = Math.max(startFrom, Math.min(toS, this.durationS()));

    this.isPlaying.set(true);
    this.currentTimeS.set(startFrom);
    this.updatePlayhead(startFrom);

    this.player.seekTo(startFrom, true);
    this.applyFadeVolume(startFrom);
    this.player.playVideo();

    this.startPolling();
  }

  stopPlayback(): void {
    this.stopPlaybackTimerOnly();
    if (this.player && this.playerReady) {
      this.player.pauseVideo();
    }
    this.isPlaying.set(false);
  }

  private stopPlaybackTimerOnly(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling(): void {
    this.stopPlaybackTimerOnly();
    this.zone.runOutsideAngular(() => {
      this.pollTimer = setInterval(
        () => this.tick(),
        WindowEditorYtComponent.POLL_INTERVAL_MS,
      );
    });
  }

  private tick(): void {
    const player = this.player;
    if (!player || !this.playerReady) return;

    const current = player.getCurrentTime();

    // Loop the selection; stop at the end of a full-track preview.
    if (current >= this.playbackEndS - 0.03) {
      if (this.playMode() === 'selection') {
        player.seekTo(this.regionFromS(), true);
        this.zone.run(() => {
          this.currentTimeS.set(this.regionFromS());
          this.updatePlayhead(this.regionFromS());
        });
        return;
      }

      player.pauseVideo();
      this.zone.run(() => {
        this.isPlaying.set(false);
        this.currentTimeS.set(0);
        this.updatePlayhead(0);
      });
      this.stopPlaybackTimerOnly();
      return;
    }

    this.applyFadeVolume(current);

    if (!this.isScrubbing) {
      this.zone.run(() => {
        this.currentTimeS.set(current);
        this.updatePlayhead(current);
      });
    }
  }

  private onVideoIdChange(videoId: string | null): void {
    this.stopPlayback();
    this.audioReady.set(false);
    const token = ++this.loadToken;

    if (!videoId) {
      return;
    }

    void this.ensurePlayer().then((player) => {
      if (!player || token !== this.loadToken) return;
      player.loadVideoById(videoId, 0);
      // Pause immediately; preview only plays on explicit user action.
      player.pauseVideo();
    });
  }

  private ensurePlayer(): Promise<YT.Player | null> {
    if (this.player && this.playerReady) {
      return Promise.resolve(this.player);
    }
    if (this.creating) {
      return this.api.load().then(() => this.player);
    }

    const mount = this.mountRef?.nativeElement;
    if (!mount) {
      return Promise.resolve(null);
    }

    this.creating = true;

    return this.api
      .load()
      .then(
        (yt) =>
          new Promise<YT.Player | null>((resolve) => {
            const player = new yt.Player(mount, {
              width: 320,
              height: 180,
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
                onReady: () => {
                  this.zone.run(() => {
                    this.playerReady = true;
                    this.creating = false;
                    player.setVolume(Math.round(this.masterVolume() * 100));
                    this.onPlayerReady(player);
                    resolve(player);
                  });
                },
                onError: () => {
                  this.zone.run(() => {
                    this.toast.error('YouTube preview failed to load.');
                  });
                },
              },
            });
            this.player = player;
          }),
      )
      .catch(() => {
        this.creating = false;
        this.zone.run(() => this.toast.error('YouTube preview failed to load.'));
        return null;
      });
  }

  private onPlayerReady(player: YT.Player): void {
    const reportedDuration = player.getDuration();
    if ((this.durationS() <= 0) && reportedDuration > 0 && !this.regionInitialized) {
      this.initializeRegionDefaults(reportedDuration);
      this.regionInitialized = true;
    }

    this.audioReady.set(true);
    this.ready.emit();
  }

  private setRegionFrom(seconds: number): void {
    const maxFrom = Math.max(0, this.regionToS() - 0.1);
    this.regionFromS.set(this.roundToTenth(this.clamp(seconds, 0, maxFrom)));
    this.syncSelectionBounds();
  }

  private setRegionTo(seconds: number): void {
    const minTo = this.regionFromS() + 0.1;
    this.regionToS.set(this.roundToTenth(this.clamp(seconds, minTo, this.durationS())));
    this.syncSelectionBounds();
  }

  /**
   * Keeps selection-loop playback inside the (possibly just-moved) region:
   * refreshes the loop end and re-seeks to the region start if the playhead is
   * now outside the bounds.
   */
  private syncSelectionBounds(): void {
    if (!this.isPlaying() || this.playMode() !== 'selection') {
      return;
    }

    this.playbackEndS = this.regionToS();

    const player = this.player;
    if (!player || !this.playerReady) {
      return;
    }

    const current = player.getCurrentTime();
    if (current < this.regionFromS() || current >= this.regionToS()) {
      player.seekTo(this.regionFromS(), true);
      this.currentTimeS.set(this.regionFromS());
      this.updatePlayhead(this.regionFromS());
    }
  }

  private initializeRegionDefaults(duration: number): void {
    if (this.initialFromS() == null && this.initialToS() == null) {
      this.regionFromS.set(0);
      this.regionToS.set(this.roundToTenth(duration));
    } else {
      if (this.initialFromS() != null) this.regionFromS.set(this.initialFromS()!);
      if (this.initialToS() != null) this.regionToS.set(this.initialToS()!);
    }

    this.windowName.set(this.initialName());
    this.fadeIn.set(this.initialFadeIn());
    this.fadeOut.set(this.initialFadeOut());
  }

  private hasUnsavedChanges(): boolean {
    const initialFrom = this.roundToTenth(this.initialFromS() ?? 0);
    const initialTo = this.roundToTenth(this.initialToS() ?? this.durationS());

    return (
      initialFrom !== this.roundToTenth(this.regionFromS()) ||
      initialTo !== this.roundToTenth(this.regionToS()) ||
      this.initialName().trim() !== this.windowName().trim() ||
      this.initialFadeIn() !== this.fadeIn() ||
      this.initialFadeOut() !== this.fadeOut()
    );
  }

  private applyFadeVolume(currentS: number): void {
    if (!this.player || !this.playerReady) return;

    let volume = 1;
    const [start, end] =
      this.playMode() === 'selection'
        ? [this.regionFromS(), this.regionToS()]
        : [0, this.durationS()];

    const fadeDuration = Math.min(
      WindowEditorYtComponent.PREVIEW_FADE_S,
      Math.max(0, (end - start) / 2),
    );

    if (fadeDuration > 0) {
      if (this.fadeIn()) {
        volume = Math.min(volume, this.clamp((currentS - start) / fadeDuration, 0, 1));
      }
      if (this.fadeOut()) {
        volume = Math.min(volume, this.clamp((end - currentS) / fadeDuration, 0, 1));
      }
    }

    this.player.setVolume(Math.round(volume * this.masterVolume() * 100));
  }

  private updatePlayhead(positionS: number): void {
    const canvasWidth = this.waveformCanvasRef?.canvasWidth ?? 0;
    const duration = this.durationS();
    this.playheadPx.set(duration > 0 ? (positionS / duration) * canvasWidth : 0);
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

    return /^\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  private roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private teardown(): void {
    this.loadToken++;
    this.stopPlaybackTimerOnly();
    this.playerReady = false;
    const player = this.player;
    this.player = null;
    if (player) {
      try {
        player.destroy();
      } catch {
        // ignore teardown races
      }
    }
  }
}
