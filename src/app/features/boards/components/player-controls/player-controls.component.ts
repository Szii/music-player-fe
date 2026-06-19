import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { UiPlayButtonComponent } from '../../../../shared/ui/play-button/ui-play-button.component';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';

@Component({
  selector: 'app-player-controls',
  imports: [UiPlayButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-controls.component.html',
  styleUrl: './player-controls.component.scss',
})
export class PlayerControlsComponent {
  readonly title = input('');
  readonly hasTrack = input(false);
  readonly status = input<PlayerStatus>('STOPPED');
  readonly positionS = input(0);
  readonly durationS = input(0);
  readonly seekableMaxS = input(0);
  readonly windowStartS = input<number | null>(null);
  readonly windowEndS = input<number | null>(null);
  /** Crossfade (fade-out) length in seconds — marks the non-seekable end. */
  readonly fadeOutS = input(0);
  readonly disabled = input(false);
  readonly showPrimaryButton = input(true);

  readonly play = output<void>();
  readonly stop = output<void>();
  readonly seekPreview = output<number>();
  readonly seekCommit = output<number>();

  readonly clampedPosition = computed(() => {
    const max = this.durationS() || 1;
    return Math.max(0, Math.min(this.positionS() || 0, max));
  });

  readonly windowLabel = computed(() => {
    const start = this.windowStartS();
    const end = this.windowEndS();
    if (start == null || end == null) return null;
    return `Window ${this.formatTime(start)} – ${this.formatTime(end)}`;
  });

  // Crossfade overlay: a band at the window/track end (not seekable) marking
  // the crossfade region. There is no ramp at the start, so no start band.
  // Positions are percentages of the full duration.
  private fadeRegionStartS(): number {
    return this.windowStartS() ?? 0;
  }

  private fadeRegionEndS(): number {
    return this.windowEndS() ?? this.durationS();
  }

  readonly showCrossfade = computed(() => this.durationS() > 0 && this.fadeOutS() > 0);

  /** Start of the non-seekable crossfade tail (window end minus the fade-out). */
  private readonly crossfadeStartS = computed(() => {
    const end = this.fadeRegionEndS();
    const region = Math.max(0, end - this.fadeRegionStartS());
    const len = Math.min(this.fadeOutS(), region);
    return end - len;
  });

  // The stripes begin at the later of the crossfade-tail start and the current
  // playhead, so the band never sits under the seek pin (the CSS adds a further
  // pin-radius offset).
  private readonly stripeStartS = computed(() =>
    Math.max(this.crossfadeStartS(), this.clampedPosition()),
  );

  readonly stripeLeftCss = computed(() => `${this.toPct(this.stripeStartS())}%`);

  readonly stripeWidthCss = computed(() =>
    `${this.toPct(this.fadeRegionEndS() - this.stripeStartS())}%`,
  );

  // Offset the band by the pin radius only once the playhead reaches the crossfade
  // tail, so it clears the pin there without zeroing out short crossfade regions
  // when the pin is parked elsewhere.
  readonly stripeGapCss = computed(() =>
    this.clampedPosition() >= this.crossfadeStartS() ? '11px' : '0px',
  );

  private toPct(seconds: number): number {
    const dur = this.durationS();
    if (dur <= 0) return 0;
    return Math.max(0, Math.min(100, (seconds / dur) * 100));
  }

  readonly sliderBackground = computed(() => {
    const dur = this.durationS();

    if (dur <= 0) {
      return `linear-gradient(
        to right,
        var(--app-border-color) 0%,
        var(--app-border-color) 100%
      )`;
    }

    const posPct = Math.min(100, (this.positionS() / dur) * 100);
    const rest = `color-mix(in srgb, var(--app-primary) 20%, white)`;

    const windowStartS = this.windowStartS();
    const windowEndS = this.windowEndS();

    if (windowStartS == null || windowEndS == null) {
      return `linear-gradient(to right,
        var(--app-primary) 0%,
        var(--app-primary) ${posPct}%,
        ${rest} ${posPct}%,
        ${rest} 100%)`;
    }

    const winStart = Math.max(0, (windowStartS / dur) * 100);
    const winEnd = Math.min(100, (windowEndS / dur) * 100);
    const posClamped = Math.max(winStart, Math.min(posPct, winEnd));

    return `linear-gradient(to right,
      transparent 0%,
      transparent ${winStart}%,
      var(--app-primary) ${winStart}%,
      var(--app-primary) ${posClamped}%,
      ${rest} ${posClamped}%,
      ${rest} ${winEnd}%,
      transparent ${winEnd}%,
      transparent 100%),
      linear-gradient(to right,
      color-mix(in srgb, var(--app-bg-soft) 72%, white) 0%,
      color-mix(in srgb, var(--app-bg-soft) 72%, white) 100%)`;
  });

  private clampToSeekable(value: number): number {
    const min = this.windowStartS() ?? 0;
    const seekableMax = this.seekableMaxS();
    const max = seekableMax > min
      ? seekableMax
      : (this.windowEndS() ?? this.durationS());
    return Math.max(min, Math.min(value, max));
  }

  onSeekInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const clamped = this.clampToSeekable(value);
    (event.target as HTMLInputElement).value = String(clamped);
    this.seekPreview.emit(clamped);
  }

  onSeekChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.seekCommit.emit(this.clampToSeekable(value));
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
