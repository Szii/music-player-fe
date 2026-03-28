import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-player-controls',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player">

      <!-- Play / Stop -->
      <button class="player__btn"
        [class.player__btn--stop]="status === 'PLAYING'"
        [disabled]="!hasTrack || disabled"
        (click)="status === 'PLAYING' ? stop.emit() : play.emit()">
        <span *ngIf="status !== 'PLAYING'">▶</span>
        <span *ngIf="status === 'PLAYING'">■</span>
      </button>

      <!-- Slider + times -->
      <div class="player__track">
        <input type="range" class="player__range"
          min="0" [max]="durationS || 1" [value]="positionS"
          [style.background]="sliderBackground"
          [disabled]="!hasTrack || disabled || durationS <= 0 || status === 'STOPPED'"
          (input)="seekPreview.emit(+$any($event.target).value)"
          (change)="seekCommit.emit(+$any($event.target).value)" />

        <div class="player__times">
          <span class="player__time">{{ formatTime(positionS) }}</span>
          <span *ngIf="status === 'BUFFERING'" class="player__buffering">buffering…</span>
          <span *ngIf="windowStartS != null && windowEndS != null" class="player__window-label">
            {{ formatTime(windowStartS) }} – {{ formatTime(windowEndS) }}
          </span>
          <span class="player__time">{{ formatTime(durationS) }}</span>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .player {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    /* ── Button ── */
    .player__btn {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: var(--app-primary);
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.1s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    .player__btn:hover:not(:disabled) {
      background: var(--app-primary-hover);
      transform: scale(1.05);
    }

    .player__btn:active:not(:disabled) { transform: scale(0.95); }
    .player__btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }

    .player__btn--stop { background: var(--app-danger); }
    .player__btn--stop:hover:not(:disabled) { background: #7a1f1f; }

    /* ── Track ── */
    .player__track {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    /* ── Slider ── */
    .player__range {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 7px;
      border-radius: 4px;
      outline: none;
      cursor: pointer;
      border: none;
    }

    .player__range:disabled { opacity: 0.4; cursor: not-allowed; }

    .player__range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 3px solid var(--app-surface);
      box-shadow: 0 0 0 1px var(--app-primary), 0 2px 4px rgba(0,0,0,0.2);
      cursor: pointer;
      transition: transform 0.1s;
    }

    .player__range:hover:not(:disabled)::-webkit-slider-thumb { transform: scale(1.25); }

    .player__range::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--app-primary);
      border: 3px solid var(--app-surface);
      box-shadow: 0 0 0 1px var(--app-primary);
      cursor: pointer;
    }

    .player__range::-moz-range-track {
      height: 7px;
      border-radius: 4px;
      background: transparent;
    }

    /* ── Times ── */
    .player__times {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .player__time {
      font-size: 12px;
      color: var(--app-text-muted);
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .player__window-label {
      font-size: 11px;
      color: var(--app-primary);
      font-variant-numeric: tabular-nums;
      background: var(--app-primary-soft);
      padding: 1px 6px;
      border-radius: 4px;
    }

    .player__buffering {
      font-size: 11px;
      color: var(--app-warning);
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

  @Output() play = new EventEmitter<void>();
  @Output() stop = new EventEmitter<void>();
  @Output() seekPreview = new EventEmitter<number>();
  @Output() seekCommit = new EventEmitter<number>();

  get sliderBackground(): string {
    const dur = this.durationS;
    if (dur <= 0) return 'var(--app-border-color)';

    const posPct  = Math.min(100, (this.positionS  / dur) * 100);
    const loadPct = Math.min(100, (this.seekableMaxS / dur) * 100);

    if (this.windowStartS == null || this.windowEndS == null) {
      return `linear-gradient(to right,
        var(--app-primary)      0%,        var(--app-primary)      ${posPct}%,
        var(--app-primary-soft) ${posPct}%, var(--app-primary-soft) ${loadPct}%,
        var(--app-border-color) ${loadPct}%, var(--app-border-color) 100%)`;
    }

    const winStart    = Math.max(0,   (this.windowStartS / dur) * 100);
    const winEnd      = Math.min(100, (this.windowEndS   / dur) * 100);
    const loadClamped = Math.min(loadPct, winEnd);

    return `linear-gradient(to right,
        transparent             0%,             transparent             ${winStart}%,
        var(--app-primary)      ${winStart}%,   var(--app-primary)      ${posPct}%,
        var(--app-primary-soft) ${posPct}%,     var(--app-primary-soft) ${loadClamped}%,
        var(--app-border-color) ${loadClamped}%, var(--app-border-color) ${winEnd}%,
        transparent             ${winEnd}%,     transparent             100%),
      repeating-linear-gradient(-45deg,
        var(--app-border-color) 0px,  var(--app-border-color) 3px,
        var(--app-bg-soft)      3px,  var(--app-bg-soft)      6px)`;
  }

  formatTime(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}