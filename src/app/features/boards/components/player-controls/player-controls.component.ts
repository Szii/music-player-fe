import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiPlayButtonComponent } from '../../../../shared/ui/play-button/ui-play-button.component';

@Component({
  selector: 'app-player-controls',
  standalone: true,
  imports: [CommonModule, UiPlayButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player" [class.player--buttonless]="!showPrimaryButton">
      <ui-play-button
        *ngIf="showPrimaryButton"
        size="lg"
        [playing]="status === 'PLAYING'"
        [disabled]="!hasTrack || disabled"
        (clicked)="status === 'PLAYING' ? stop.emit() : play.emit()"
      />

      <div class="player__track">
        <div class="player__topline" *ngIf="(windowStartS != null && windowEndS != null) || status === 'BUFFERING'">
          <span
            *ngIf="windowStartS != null && windowEndS != null"
            class="player__window-label">
            Window {{ formatTime(windowStartS) }} – {{ formatTime(windowEndS) }}
          </span>

          <span *ngIf="status === 'BUFFERING'" class="player__buffering">
            buffering…
          </span>
        </div>

        <input
          type="range"
          class="player__range app-range app-range--seek"
          min="0"
          [max]="durationS || 1"
          step="0.01"
          [value]="clampedPosition"
          [style.--app-range-track]="sliderBackground"
          [disabled]="!hasTrack || disabled || durationS <= 0 || status === 'STOPPED'"
          (input)="onSeekInput($event)"
          (change)="onSeekChange($event)" />

        <div class="player__times">
          <span class="player__time player__time--current">{{ formatTime(positionS) }}</span>
          <span class="player__time player__time--total">{{ formatTime(durationS) }}</span>
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

    .player__topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 22px;
      flex-wrap: wrap;
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
      color: var(--app-primary);
      background: var(--app-primary-soft);
      border: 1px solid rgba(88, 24, 13, 0.2);
      font-variant-numeric: tabular-nums;
    }

    .player__buffering {
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
      color: var(--app-warning);
      background: var(--app-warning-soft);
      border: 1px solid rgba(158, 110, 16, 0.2);
    }

    .player__times {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .player__time {
      display: inline-flex;
      align-items: center;
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
  @Input() title = '';
  @Input() hasTrack = false;
  @Input() status: 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR' = 'STOPPED';
  @Input() positionS = 0;
  @Input() durationS = 0;
  @Input() seekableMaxS = 0;
  @Input() windowStartS: number | null = null;
  @Input() windowEndS: number | null = null;
  @Input() disabled = false;
  @Input() showPrimaryButton = true;

  @Output() play = new EventEmitter<void>();
  @Output() stop = new EventEmitter<void>();
  @Output() seekPreview = new EventEmitter<number>();
  @Output() seekCommit = new EventEmitter<number>();

  get clampedPosition(): number {
    const max = this.durationS || 1;
    return Math.max(0, Math.min(this.positionS || 0, max));
  }

  private clampToSeekable(value: number): number {
    const min = this.windowStartS ?? 0;
    const max = this.seekableMaxS > min
      ? this.seekableMaxS
      : (this.windowEndS ?? this.durationS);
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

  get sliderBackground(): string {
    const dur = this.durationS;

    if (dur <= 0) {
      return `linear-gradient(
        to right,
        var(--app-border-color) 0%,
        var(--app-border-color) 100%
      )`;
    }

    const posPct = Math.min(100, (this.positionS / dur) * 100);
    const loadPct = Math.min(100, (this.seekableMaxS / dur) * 100);

    if (this.windowStartS == null || this.windowEndS == null) {
      return `linear-gradient(to right,
        var(--app-primary) 0%,
        var(--app-primary) ${posPct}%,
        color-mix(in srgb, var(--app-primary) 22%, white) ${posPct}%,
        color-mix(in srgb, var(--app-primary) 22%, white) ${loadPct}%,
        color-mix(in srgb, var(--app-border-color) 75%, white) ${loadPct}%,
        color-mix(in srgb, var(--app-border-color) 75%, white) 100%)`;
    }

    const winStart = Math.max(0, (this.windowStartS / dur) * 100);
    const winEnd = Math.min(100, (this.windowEndS / dur) * 100);
    const loadClamped = Math.min(loadPct, winEnd);
    const posClamped = Math.max(winStart, Math.min(posPct, winEnd));

    return `linear-gradient(to right,
      transparent 0%,
      transparent ${winStart}%,
      var(--app-primary) ${winStart}%,
      var(--app-primary) ${posClamped}%,
      color-mix(in srgb, var(--app-primary) 22%, white) ${posClamped}%,
      color-mix(in srgb, var(--app-primary) 22%, white) ${loadClamped}%,
      color-mix(in srgb, var(--app-border-color) 75%, white) ${loadClamped}%,
      color-mix(in srgb, var(--app-border-color) 75%, white) ${winEnd}%,
      transparent ${winEnd}%,
      transparent 100%),
      linear-gradient(to right,
      color-mix(in srgb, var(--app-bg-soft) 72%, white) 0%,
      color-mix(in srgb, var(--app-bg-soft) 72%, white) 100%)`;
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