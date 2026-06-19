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
  template: `
    <div class="player" [class.player--buttonless]="!showPrimaryButton()">
      @if (showPrimaryButton()) {
        <ui-play-button
          size="lg"
          [playing]="status() === 'PLAYING'"
          [disabled]="!hasTrack() || disabled()"
          (clicked)="status() === 'PLAYING' ? stop.emit() : play.emit()"
        />
      }

      <div class="player__track">
        <div class="player__range-wrap">
          <input
            #seek
            type="range"
            class="player__range app-range app-range--seek"
            min="0"
            [max]="durationS() || 1"
            step="0.01"
            [value]="clampedPosition()"
            [style.--app-range-track]="sliderBackground()"
            [disabled]="!hasTrack() || disabled() || durationS() <= 0 || status() === 'STOPPED'"
            (input)="onSeekInput($event)"
            (change)="onSeekChange($event)"
            (mouseup)="seek.blur()"
            (touchend)="seek.blur()" />

          @if (showCrossfade()) {
            <span
              class="player__crossfade"
              aria-hidden="true"
              [style.--stripe-left]="stripeLeftCss()"
              [style.--stripe-width]="stripeWidthCss()"
              [style.--stripe-gap]="stripeGapCss()"
              title="Crossfade region — not seekable"
            ></span>
          }
        </div>

        <div class="player__times">
          <span class="player__time player__time--current">{{ formatTime(positionS()) }}</span>

          <div class="player__meta">
            @if (windowLabel(); as label) {
             <!-- <span class="player__window-label">{{ label }}</span>  -->
            }
            @if (status() === 'BUFFERING') {
              <span class="player__buffering">buffering…</span>
            }
          </div>

          <span class="player__time player__time--total">{{ formatTime(durationS()) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .player {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .player--buttonless {
      gap: 0;
    }

    .player__track {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .player__range-wrap {
      position: relative;
      display: flex;
      align-items: center;
      height: 22px;
      min-width: 0;
    }

    .player__range {
      position: relative;
      z-index: 1;
    }

    /* Crossfade marker: app-tinted diagonal stripes over the non-seekable tail.
       The element spans the full bar height and captures pointer events so the
       crossfade region can't be clicked; the visible band is drawn by ::before.
       It starts a thumb-radius (--pin-gap) past the playhead so it never sits
       under the seek pin. */
    .player__crossfade {
      position: absolute;
      z-index: 2;
      top: 0;
      bottom: 0;
      left: calc(var(--stripe-left, 100%) + var(--stripe-gap, 0px));
      width: max(0px, calc(var(--stripe-width, 0%) - var(--stripe-gap, 0px)));
      pointer-events: auto;
      cursor: not-allowed;
    }

    .player__crossfade::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 8px;
      transform: translateY(-50%);
      border-radius: 2px;
      background: repeating-linear-gradient(
        45deg,
        color-mix(in srgb, var(--app-primary) 65%, transparent) 0 3px,
        transparent 3px 7px
      );
    }

    .player__times {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    /* Holds the window label + transient buffering pill between the time
       readouts. Keeps a stable min-height so the pill appearing/disappearing
       never reflows the slider. */
    .player__meta {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 22px;
      overflow: hidden;
    }

    .player__window-label {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 3px;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--app-primary);
      background: var(--app-primary-soft);
      border: 1px solid rgba(88, 24, 13, 0.2);
      font-variant-numeric: tabular-nums;
    }

    .player__buffering {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 3px;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--app-warning);
      background: var(--app-warning-soft);
      border: 1px solid rgba(158, 110, 16, 0.2);
    }

    .player__time {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .player__time--current {
      color: var(--app-text);
      background: color-mix(in srgb, var(--app-surface) 94%, black 6%);
    }

    .player__time--total {
      color: var(--app-text-muted);
      background: transparent;
      padding-right: 0;
    }
  `],
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
