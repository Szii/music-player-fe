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
        <div
          class="player__range-wrap"
          [class.player__range-wrap--has-seek-guard]="hasSeekGuard()"
          [style.--seek-guard-left]="seekGuardLeftCss()"
          [style.--seek-guard-width]="seekGuardWidthCss()"
        >
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

          @if (hasSeekGuard()) {
            <span
              class="player__seek-guard"
              aria-hidden="true"
              title="This ending section is protected from seeking to keep loop crossfade stable"
            ></span>
          }
        </div>

        <div class="player__times">
          <span class="player__time player__time--current">{{ formatTime(positionS()) }}</span>

          <div class="player__meta">
            @if (windowLabel(); as label) {
              <span class="player__window-label">{{ label }}</span>
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

    .player__seek-guard {
      position: absolute;
      z-index: 2;
      left: var(--seek-guard-left, 100%);
      width: var(--seek-guard-width, 0%);
      top: 50%;
      height: 6px;
      transform: translateY(-50%);
      border-radius: 999px;
      pointer-events: none;
      background:
        repeating-linear-gradient(
          135deg,
          rgba(88, 24, 13, 0.44) 0px,
          rgba(88, 24, 13, 0.44) 3px,
          rgba(201, 164, 76, 0.28) 3px,
          rgba(201, 164, 76, 0.28) 7px
        );
      box-shadow:
        inset 0 0 0 1px rgba(88, 24, 13, 0.35),
        0 0 0 1px rgba(248, 242, 228, 0.45);
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

  readonly hasSeekGuard = computed(() => {
    const dur = this.durationS();
    const seekableMax = this.seekableMaxS();
    const guardEnd = this.guardEndS();

    // The hatch marks the not-yet-seekable region. When stopped on the whole
    // track seekableMax is 0, which must still hatch the whole bar (matching the
    // windowed case), so don't require seekableMax > 0 here.
    return (
      dur > 0 &&
      guardEnd > 0 &&
      seekableMax >= 0 &&
      seekableMax < guardEnd - 0.01
    );
  });

  readonly seekGuardLeftCss = computed(() => `${this.seekGuardStartPct()}%`);

  readonly seekGuardWidthCss = computed(() => {
    const width = Math.max(0, this.seekGuardEndPct() - this.seekGuardStartPct());
    return `${width}%`;
  });

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
    const loadPct = Math.min(100, (this.seekableMaxS() / dur) * 100);

    const windowStartS = this.windowStartS();
    const windowEndS = this.windowEndS();

    if (windowStartS == null || windowEndS == null) {
      return `linear-gradient(to right,
        var(--app-primary) 0%,
        var(--app-primary) ${posPct}%,
        color-mix(in srgb, var(--app-primary) 22%, white) ${posPct}%,
        color-mix(in srgb, var(--app-primary) 22%, white) ${loadPct}%,
        color-mix(in srgb, var(--app-warning) 22%, white) ${loadPct}%,
        color-mix(in srgb, var(--app-warning) 22%, white) 100%)`;
    }

    const winStart = Math.max(0, (windowStartS / dur) * 100);
    const winEnd = Math.min(100, (windowEndS / dur) * 100);
    const posClamped = Math.max(winStart, Math.min(posPct, winEnd));
    // Keep stops monotonic: when seekableMaxS lags behind the window (e.g. right
    // after a window switch), loadPct can fall below the current position. Clamp
    // it up so the gradient stops never go backwards.
    const loadClamped = Math.max(posClamped, Math.min(loadPct, winEnd));

    return `linear-gradient(to right,
      transparent 0%,
      transparent ${winStart}%,
      var(--app-primary) ${winStart}%,
      var(--app-primary) ${posClamped}%,
      color-mix(in srgb, var(--app-primary) 22%, white) ${posClamped}%,
      color-mix(in srgb, var(--app-primary) 22%, white) ${loadClamped}%,
      color-mix(in srgb, var(--app-warning) 22%, white) ${loadClamped}%,
      color-mix(in srgb, var(--app-warning) 22%, white) ${winEnd}%,
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

  private guardEndS(): number {
    const dur = this.durationS();
    const windowEnd = this.windowEndS();
    return Math.max(0, Math.min(windowEnd ?? dur, dur));
  }

  private seekGuardStartPct(): number {
    const dur = this.durationS();
    if (dur <= 0) return 100;

    const seekableMax = Math.max(0, Math.min(this.seekableMaxS(), this.guardEndS()));
    return Math.max(0, Math.min(100, (seekableMax / dur) * 100));
  }

  private seekGuardEndPct(): number {
    const dur = this.durationS();
    if (dur <= 0) return 100;

    return Math.max(0, Math.min(100, (this.guardEndS() / dur) * 100));
  }
}
