// window-transport.component.ts
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-window-transport',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="we-transport">
      <div class="we-transport-left">
        <button
          type="button"
          class="we-btn"
          (click)="playAll.emit()"
          [class.active]="isPlaying && playMode === 'full'"
        >
          <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
            <polygon
              *ngIf="!(isPlaying && playMode === 'full')"
              points="4,2 18,10 4,18"
              fill="currentColor"
            />
            <rect
              *ngIf="isPlaying && playMode === 'full'"
              x="3"
              y="3"
              width="14"
              height="14"
              rx="2"
              fill="currentColor"
            />
          </svg>
          {{ isPlaying && playMode === 'full' ? 'Stop' : 'Play all' }}
        </button>

        <button
          type="button"
          class="we-btn we-btn--accent"
          (click)="playSelection.emit()"
          [class.active]="isPlaying && playMode === 'selection'"
          [disabled]="playSelectionDisabled && !(isPlaying && playMode === 'selection')"
        >
          <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
            <polygon
              *ngIf="!(isPlaying && playMode === 'selection')"
              points="4,2 18,10 4,18"
              fill="currentColor"
            />
            <rect
              *ngIf="isPlaying && playMode === 'selection'"
              x="3"
              y="3"
              width="14"
              height="14"
              rx="2"
              fill="currentColor"
            />
          </svg>
          {{ isPlaying && playMode === 'selection' ? 'Stop' : 'Play selection' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .we-transport {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 14px;
      border: var(--app-border);
      border-radius: 12px;
      background: var(--app-bg-soft);
      flex-wrap: wrap;
    }

    .we-transport-left,
    .we-transport-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .we-transport-right {
      padding-left: 6px;
    }

    .we-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 13px;
      border: var(--app-border);
      border-radius: 10px;
      background: var(--app-surface);
      color: var(--app-text);
      font-size: 12px;
      font-family: inherit;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      transition:
        border-color 0.12s,
        color 0.12s,
        background 0.12s,
        transform 0.12s,
        box-shadow 0.12s;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .we-btn:hover:not(:disabled) {
      border-color: var(--app-primary);
      color: var(--app-primary);
      background: var(--app-primary-soft);
      transform: translateY(-1px);
    }

    .we-btn.active {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
      box-shadow: 0 0 0 1px rgba(122, 92, 46, 0.08);
    }

    .we-btn--accent {
      background: var(--app-primary);
      color: #fff;
      border-color: var(--app-primary);
    }

    .we-btn--accent:hover:not(:disabled),
    .we-btn--accent.active {
      background: var(--app-primary-hover);
      border-color: var(--app-primary-hover);
      color: #fff;
    }

    .we-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .we-check {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: var(--app-text-muted);
      cursor: pointer;
      user-select: none;
      padding: 6px 8px;
      border-radius: 8px;
      transition: background 0.12s, color 0.12s;
    }

    .we-check:hover {
      background: rgba(122, 92, 46, 0.06);
      color: var(--app-text);
    }

    .we-check input {
      margin: 0;
      accent-color: var(--app-primary);
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    @media (max-width: 700px) {
      .we-transport {
        align-items: stretch;
      }

      .we-transport-left,
      .we-transport-right {
        width: 100%;
      }

      .we-transport-right {
        padding-left: 0;
      }
    }
  `],
})
export class WindowTransportComponent {
  @Input() isPlaying = false;
  @Input() playMode: 'full' | 'selection' = 'full';
  @Input() fadeIn = false;
  @Input() fadeOut = false;
  @Input() playSelectionDisabled = false;

  @Output() playAll = new EventEmitter<void>();
  @Output() playSelection = new EventEmitter<void>();
  @Output() fadeInChange = new EventEmitter<boolean>();
  @Output() fadeOutChange = new EventEmitter<boolean>();
}