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
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import { UiVolumeSliderComponent } from '../../../../shared/ui/volume-slider/ui-volume-slider.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { BoardPlayerYtDeckComponent } from '../../../boards/components/board-player-yt-deck/board-player-yt-deck.component';
import {
  FADE_STEP_MS,
  clampFadeMs,
  formatFadeMs,
  maxFadeForWindow,
} from '../../utils/fade';

/** Result emitted when a window (or whole-track fades) is applied. */
export interface WindowEditorResult {
  name: string;
  positionFrom: number;
  positionTo: number;
  fadeInMs: number;
  fadeOutMs: number;
}

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';
type PreviewMode = 'selection' | 'full';

/** The crossfade slider sets fade-in and fade-out to the same length, so it steps
    by a single fade step. */
const CROSSFADE_STEP_MS = FADE_STEP_MS;

/**
 * YouTube IFrame-backed window editor (behind {@link USE_YT_IFRAME_PLAYER}).
 *
 * The timeline (ruler + draggable region handles) is rendered with the waveform
 * canvas (empty peaks). Playback is delegated to the real board player deck
 * ({@link BoardPlayerYtDeckComponent}) so the preview loops and crossfades
 * exactly like a board: the selection is fed as a repeating window and the
 * crossfade length comes from the same fade values.
 *
 * A single "Crossfade" slider sets the window's fades symmetrically — a 6 s
 * crossfade means the window fades in over 6 s and out over 6 s, and that 6 s is
 * also the loop/seam overlap.
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
    BoardPlayerYtDeckComponent,
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
        [audioReady]="durationS() > 0"
        [waveformReady]="true"
        [fadeInS]="fadeInMs() / 1000"
        [fadeOutS]="fadeOutMs() / 1000"
        [handlesDisabled]="durationS() <= 0 || lockRegion()"
        (regionChange)="onRegionChange($event)"
        (seekRequested)="onTimelineSeek($event)"
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
                  #fromInput
                  type="text"
                  class="we-card__time-input"
                  [value]="formatTime(regionFromS())"
                  [disabled]="lockRegion()"
                  (change)="onFromTextChange($any($event.target).value)"
                  aria-label="Selection start time"
                />
                <div class="we-card__nudge-group">
                  <button type="button" class="we-nudge" [disabled]="lockRegion()" (click)="nudgeFrom(-1)" aria-label="Decrease start by 1 second">−</button>
                  <button type="button" class="we-nudge" [disabled]="lockRegion()" (click)="nudgeFrom(1)" aria-label="Increase start by 1 second">+</button>
                </div>
              </div>
            </div>

            <div class="we-card">
              <span class="we-card__label">To</span>
              <div class="we-card__row">
                <input
                  #toInput
                  type="text"
                  class="we-card__time-input"
                  [value]="formatTime(regionToS())"
                  [disabled]="lockRegion()"
                  (change)="onToTextChange($any($event.target).value)"
                  aria-label="Selection end time"
                />
                <div class="we-card__nudge-group">
                  <button type="button" class="we-nudge" [disabled]="lockRegion()" (click)="nudgeTo(-1)" aria-label="Decrease end by 1 second">−</button>
                  <button type="button" class="we-nudge" [disabled]="lockRegion()" (click)="nudgeTo(1)" aria-label="Increase end by 1 second">+</button>
                </div>
              </div>
            </div>

            <div class="we-card">
              <span class="we-card__label">Length</span>
              <div class="we-card__row">
                <span class="we-card__time-display">{{ formatTime(regionToS() - regionFromS()) }}</span>
              </div>
            </div>

            <ui-volume-slider
              class="we-volume"
              [value]="volumePercent()"
              (preview)="onVolumeChange($event)"
              (commit)="onVolumeChange($event)"
            />
          </div>
        </div>
      }

      @if (durationS() > 0 && loopPreview()) {
        <div class="we-section we-fades">
          <div class="we-fade">
            <div class="we-fade__head">
              <span class="we-card__label">Crossfade strength (s)</span>
              <span class="we-fade__value">{{ formatFade(crossfadeMs()) }}</span>
            </div>
            <div class="we-fade__controls">
              <button type="button" class="we-nudge" [disabled]="crossfadeMs() <= 0" (click)="nudgeCrossfade(-1)" aria-label="Decrease crossfade">−</button>
              <input
                class="we-fade__range app-range"
                type="range"
                min="0"
                [max]="maxCrossfadeMs()"
                [step]="crossfadeStepMs"
                [value]="crossfadeMs()"
                (input)="onCrossfadeInput($any($event.target).value)"
                aria-label="Crossfade length"
              />
              <button type="button" class="we-nudge" [disabled]="crossfadeMs() >= maxCrossfadeMs()" (click)="nudgeCrossfade(1)" aria-label="Increase crossfade">+</button>
            </div>
            <span class="we-fade__hint">
              Fades in and out over {{ formatFade(crossfadeMs()) }} — the loop/seam overlap
            </span>
          </div>
        </div>
      }

      @if (durationS() > 0) {
        <div class="we-section we-preview">
          <div class="we-preview__modes" role="group" aria-label="Preview mode">
            <button
              type="button"
              class="we-pill"
              [class.we-pill--active]="previewMode() === 'selection'"
              (click)="setPreviewMode('selection')"
            >
              Selection
            </button>
            <button
              type="button"
              class="we-pill"
              [class.we-pill--active]="previewMode() === 'full'"
              (click)="setPreviewMode('full')"
            >
              Full track
            </button>

          </div>

          <app-board-player-yt-deck
            #deck
            class="we-preview__deck"
            [title]="windowName() || ''"
            [hasTrack]="!!videoId()"
            [trackId]="0"
            [videoId]="videoId()"
            [status]="status()"
            [durationS]="durationS()"
            [windowStartS]="previewMode() === 'selection' ? regionFromS() : null"
            [windowEndS]="previewMode() === 'selection' ? regionToS() : null"
            [hasSelectedWindow]="previewMode() === 'selection'"
            [windowFadeInMs]="fadeInMs()"
            [windowFadeOutMs]="fadeOutMs()"
            [repeat]="loopPreview()"
            [masterVolume]="masterVolume()"
            [masterFadeRampMs]="fadeInMs()"
            [showPrimaryButton]="true"
            [preservePositionOnWindowChange]="true"
            (playRequested)="onPlayRequested()"
            (stopRequested)="onStopRequested()"
            (ended)="onStopRequested()"
            (positionChange)="onDeckPosition($event)"
            (audioError)="onPreviewError()"
          />
        </div>
      }

      @if (durationS() > 0) {
        <div class="we-section we-bottom">
          <div class="we-bottom__name-block">
            <label class="we-bottom__name-label" for="we-yt-window-name">Window name</label>
            <div class="we-bottom__name-row">
              @if (lockName()) {
                <div class="we-bottom__name-input we-bottom__name-locked">
                  {{ windowName() }}
                </div>
              } @else {
                <ui-text-input
                  id="we-yt-window-name"
                  class="we-bottom__name-input"
                  [ngModel]="windowName()"
                  (ngModelChange)="windowName.set($event)"
                  placeholder="e.g. Intro"
                  [maxLength]="windowNameMaxLength"
                />
              }
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
        </div>
      }
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
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: stretch;
    }

    /* The volume takes the leftover space on the row and drops to its own line
       only when the cards no longer leave room for it. */
    .we-volume { flex: 1 1 200px; min-width: 200px; }

    @media (max-width: 900px) {
      .we-volume { flex-basis: 100%; }
    }

    .we-card {
      /* Size to content — no stretching to fill leftover width. */
      flex: 0 0 auto;
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

    .we-card__nudge-group { display: inline-flex; flex-direction: column-reverse; gap: 3px; }

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

    .we-nudge:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }
    .we-nudge:disabled { opacity: 0.45; cursor: not-allowed; }

    .we-fades { display: flex; flex-direction: column; gap: 6px; padding: 8px 14px; }
    .we-fade { display: flex; flex-direction: column; gap: 6px; }

    .we-fade__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .we-fade__value {
      font-size: 13px;
      font-weight: 700;
      color: var(--app-text);
      font-variant-numeric: tabular-nums;
    }

    .we-fade__controls { display: flex; align-items: center; gap: 8px; }
    .we-fade__range { flex: 1; min-width: 0; }

    .we-fade__hint {
      font-size: 11px;
      font-style: italic;
      color: var(--app-text-muted);
    }

    .we-preview {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .we-preview__modes { display: flex; align-items: center; gap: 8px; }
    .we-preview__deck { display: block; }

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
      transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

      .we-pill--active {
        background: var(--app-primary-soft);
        border-color: var(--app-primary);
        color: var(--app-primary);
      }

      @media (hover: hover) and (pointer: fine) {
        .we-pill:hover {
          background: var(--app-primary-soft);
          border-color: var(--app-primary);
          color: var(--app-primary);
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

    .we-bottom__name-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

    .we-bottom__name-label {
      font-family: var(--app-font-heading);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--app-heading);
    }

    /* Wrap so the apply button drops to its own line on narrow screens instead
       of colliding with the name field. The input keeps a real flex-basis so it
       never shrinks below its content (which made the locked name text overflow
       under the button). */
    .we-bottom__name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; }
    .we-bottom__name-input { flex: 1 1 200px; min-width: 0; }
    .we-bottom__name-locked {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      font-weight: 700;
      color: var(--app-text-muted);
      background: var(--app-bg-muted);
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
    }
    .we-bottom__apply { flex: 0 0 auto; }
  `],
})
export class WindowEditorYtComponent {
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('deck') private deck?: BoardPlayerYtDeckComponent;
  @ViewChild('waveformCanvas') private waveformCanvasRef?: WaveformCanvasComponent;
  @ViewChild('fromInput') private fromInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('toInput') private toInputRef?: ElementRef<HTMLInputElement>;

  readonly videoId = input<string | null>(null);
  readonly durationS = input(0);
  readonly initialFromS = input<number | null>(null);
  readonly initialToS = input<number | null>(null);
  readonly initialName = input('');
  readonly initialFadeInMs = input(0);
  readonly initialFadeOutMs = input(0);
  /** Lock the region bounds (whole-track window: only the crossfade is editable). */
  readonly lockRegion = input(false);
  /** Lock the window name (whole-track window uses a fixed name). */
  readonly lockName = input(false);
  readonly applyLabel = input('Apply window');
  /** Whether the preview loops with crossfade. Owned by the parent editor so it
      applies across all windows, not per-window. */
  readonly loopPreview = input(true);

  readonly apply = output<WindowEditorResult>();
  readonly ready = output<void>();

  readonly regionFromS = signal(0);
  readonly regionToS = signal(0);
  readonly fadeInMs = signal(0);
  readonly fadeOutMs = signal(0);
  readonly windowName = signal('');
  readonly windowNameMaxLength = FIELD_LIMITS.trackWindow.name;
  readonly masterVolume = signal(0.5);
  readonly status = signal<PlayerStatus>('STOPPED');
  readonly previewMode = signal<PreviewMode>('selection');
  /** Current playhead position (seconds) reported by the preview deck. */
  readonly positionS = signal(0);
  /** Playhead position on the timeline canvas, in pixels. */
  readonly playheadPx = signal(0);

  readonly crossfadeStepMs = CROSSFADE_STEP_MS;
  readonly volumePercent = computed(() => Math.round(this.masterVolume() * 100));

  /** Crossfade length: the window fades in and out over this same duration, so it
      equals each (kept-equal) fade edge — not their sum. */
  readonly crossfadeMs = computed(() => Math.max(this.fadeInMs(), this.fadeOutMs()));

  readonly maxCrossfadeMs = computed(
    () => maxFadeForWindow(this.regionToS() - this.regionFromS()),
  );

  readonly canApply = computed(() => {
    if (this.durationS() <= 0) {
      return false;
    }
    if (this.lockRegion()) {
      return true;
    }
    return (
      this.regionFromS() < this.regionToS() &&
      this.windowName().trim().length > 0
    );
  });

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

  private regionInitialized = false;
  private lastInitialStateKey: string | null = null;
  private readyEmitted = false;

  constructor() {
    // Initialise the region/fades from the selected window, re-running when the
    // editor is pointed at a different window while staying mounted.
    effect(() => {
      const duration = this.durationS();
      const videoId = this.videoId();
      const from = this.initialFromS();
      const to = this.initialToS();
      const name = this.initialName();
      const fadeInMs = this.initialFadeInMs();
      const fadeOutMs = this.initialFadeOutMs();

      if (duration <= 0) {
        return;
      }

      const key = JSON.stringify([
        videoId ?? '',
        this.roundToTenth(duration),
        from,
        to,
        name,
        fadeInMs,
        fadeOutMs,
      ]);

      if (key === this.lastInitialStateKey) {
        return;
      }

      this.lastInitialStateKey = key;
      this.initializeDefaults(duration);
      this.regionInitialized = true;
    });

    // The timeline is usable as soon as we have a video + duration; signal the
    // panel so it can reveal the window list.
    effect(() => {
      if (!this.readyEmitted && this.videoId() && this.durationS() > 0) {
        this.readyEmitted = true;
        this.ready.emit();
      }
    });
  }

  onRegionChange(event: RegionChangeEvent): void {
    this.regionFromS.set(event.fromS);
    this.regionToS.set(event.toS);
    this.clampFades();
    // The preview deck keeps playing from the current position while the caret
    // stays inside the resized window, and only jumps to the start when it falls
    // outside (see preservePositionOnWindowChange).
  }

  onTimelineSeek(_targetS: number): void {
    // Seeking is handled by the embedded deck's controls; the timeline click is
    // only used for region editing, so ignore bare seeks here.
  }

  /** Mirror the preview deck's playhead onto the waveform timeline. */
  onDeckPosition(positionS: number): void {
    this.setPlayhead(positionS);
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

  onCrossfadeInput(value: string): void {
    this.setCrossfadeMs(Number(value));
  }

  nudgeCrossfade(direction: number): void {
    this.setCrossfadeMs(this.crossfadeMs() + direction * CROSSFADE_STEP_MS);
  }

  onVolumeChange(value: string | number): void {
    const numeric = Math.max(0, Math.min(100, Number(value)));
    this.masterVolume.set(numeric / 100);
  }

  setPreviewMode(mode: PreviewMode): void {
    this.previewMode.set(mode);
  }

  onPlayRequested(): void {
    this.status.set('PLAYING');
  }

  onStopRequested(): void {
    this.status.set('STOPPED');
  }

  onPreviewError(): void {
    this.status.set('STOPPED');
    this.toast.error('YouTube preview failed to load.');
  }

  onApply(): void {
    this.commitPendingTimeInputs();

    if (!this.canApply()) {
      this.toast.warning('Pick a name and a valid selection first.');
      return;
    }

    this.apply.emit({
      name: this.windowName().trim(),
      positionFrom: this.regionFromS(),
      positionTo: this.regionToS(),
      fadeInMs: this.fadeInMs(),
      fadeOutMs: this.fadeOutMs(),
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

  formatFade(ms: number): string {
    return formatFadeMs(ms);
  }

  private setPlayhead(positionS: number): void {
    this.positionS.set(positionS);
    const width = this.waveformCanvasRef?.canvasWidth ?? 0;
    const duration = this.durationS();
    this.playheadPx.set(duration > 0 ? (positionS / duration) * width : 0);
  }

  /**
   * Commit any uncommitted text in the From/To fields. The Apply button suppresses
   * mousedown to avoid focus theft, so clicking it never blurs the time inputs and
   * their (change) handlers don't fire — read the raw values directly here instead.
   */
  private commitPendingTimeInputs(): void {
    if (this.lockRegion()) {
      return;
    }

    const fromText = this.fromInputRef?.nativeElement.value;
    if (fromText != null) {
      this.onFromTextChange(fromText);
    }

    const toText = this.toInputRef?.nativeElement.value;
    if (toText != null) {
      this.onToTextChange(toText);
    }
  }

  private setRegionFrom(seconds: number): void {
    const maxFrom = Math.max(0, this.regionToS() - 0.1);
    this.regionFromS.set(this.roundToTenth(this.clamp(seconds, 0, maxFrom)));
    this.clampFades();
  }

  private setRegionTo(seconds: number): void {
    const minTo = this.regionFromS() + 0.1;
    this.regionToS.set(this.roundToTenth(this.clamp(seconds, minTo, this.durationS())));
    this.clampFades();
  }

  /** Set the crossfade length, applied as an equal fade-in and fade-out. */
  private setCrossfadeMs(lengthMs: number): void {
    const maxMs = this.maxCrossfadeMs();
    const clamped = clampFadeMs(this.snapCrossfade(lengthMs), maxMs);
    this.fadeInMs.set(clamped);
    this.fadeOutMs.set(clamped);
  }

  private clampFades(): void {
    // Re-apply the current crossfade against the (possibly resized) region.
    this.setCrossfadeMs(this.crossfadeMs());
  }

  private initializeDefaults(duration: number): void {
    const safeDuration = Math.max(0, this.roundToTenth(duration));
    const minLength = 0.1;

    let from = this.initialFromS() ?? 0;
    let to = this.initialToS() ?? safeDuration;

    from = this.roundToTenth(this.clamp(from, 0, Math.max(0, safeDuration - minLength)));
    to = this.roundToTenth(this.clamp(to, from + minLength, safeDuration));

    if (to <= from) {
      from = 0;
      to = safeDuration;
    }

    this.regionFromS.set(from);
    this.regionToS.set(to);
    this.windowName.set(this.initialName());

    const maxHalf = maxFadeForWindow(to - from);
    this.fadeInMs.set(clampFadeMs(this.initialFadeInMs(), maxHalf));
    this.fadeOutMs.set(clampFadeMs(this.initialFadeOutMs(), maxHalf));

    this.status.set('STOPPED');
    this.setPlayhead(this.previewMode() === 'full' ? 0 : from);
  }

  private hasUnsavedChanges(): boolean {
    const initialFrom = this.roundToTenth(this.initialFromS() ?? 0);
    const initialTo = this.roundToTenth(this.initialToS() ?? this.durationS());

    return (
      initialFrom !== this.roundToTenth(this.regionFromS()) ||
      initialTo !== this.roundToTenth(this.regionToS()) ||
      this.initialName().trim() !== this.windowName().trim() ||
      this.initialFadeInMs() !== this.fadeInMs() ||
      this.initialFadeOutMs() !== this.fadeOutMs()
    );
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

  private snapCrossfade(ms: number): number {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.round(ms / CROSSFADE_STEP_MS) * CROSSFADE_STEP_MS;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  private roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
