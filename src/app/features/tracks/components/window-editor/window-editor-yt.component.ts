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
 * YouTube IFrame-backed window editor.
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
  templateUrl: './window-editor-yt.component.html',
  styleUrl: './window-editor-yt.component.scss',
})
export class WindowEditorYtComponent {
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('deck') private deck?: BoardPlayerYtDeckComponent;
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
  /** Current playhead position (seconds) reported by the preview deck. Fed to the
      timeline, which derives the pixel position itself so it tracks resizes. */
  readonly positionS = signal(0);

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
    // outside (see preservePositionOnWindowChange). The displayed playhead is only
    // re-anchored once the drag is released (onRegionCommit), not on every frame.
  }

  /** A region edit has settled (drag released). Re-anchor the preview playhead to
      the real position so it snaps into the committed window. */
  onRegionCommit(): void {
    this.requestPlayheadResync();
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
    this.requestPlayheadResync();
  }

  private setRegionTo(seconds: number): void {
    const minTo = this.regionFromS() + 0.1;
    this.regionToS.set(this.roundToTenth(this.clamp(seconds, minTo, this.durationS())));
    this.clampFades();
    this.requestPlayheadResync();
  }

  /**
   * Apply a committed region edit to the preview deck: reposition playback to the
   * new window start when the playhead now falls outside it, and re-anchor the
   * displayed playhead. Called when an edit is committed (drag released, or a
   * text/nudge change) — not on each live drag frame.
   */
  private requestPlayheadResync(): void {
    this.deck?.commitWindowReposition();
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
