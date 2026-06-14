import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ui-volume-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-volume-slider" [class.ui-volume-slider--vertical]="vertical()">
      <span class="ui-volume-slider__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="14" height="14">
          <path d="M3 8v4h3l4 3V5L6 8H3z" fill="currentColor" />
          <path
            d="M13.5 7.5c1.2 1 1.8 2 1.8 3s-0.6 2-1.8 3"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </span>
      <span class="ui-volume-slider__track-wrap">
        <input
          #range
          type="range"
          class="ui-volume-slider__range app-range"
          min="0"
          max="100"
          step="1"
          [value]="value()"
          [style.--app-range-fill.%]="value()"
          [disabled]="disabled()"
          [attr.aria-label]="ariaLabel()"
          (input)="onInput($event)"
          (change)="onCommit($event)"
          (mouseup)="range.blur()"
          (touchend)="range.blur()"
        />
      </span>
      <span class="ui-volume-slider__value">{{ value() }}%</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .ui-volume-slider {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        height: 36px;
        padding: 0 12px;
        border-radius: var(--app-radius-sm);
        border: 1px solid var(--app-border-color-soft);
        background: var(--app-surface-elevated);
      }

      .ui-volume-slider__icon {
        display: inline-flex;
        align-items: center;
        color: var(--app-primary);
      }

      .ui-volume-slider__track-wrap {
        min-width: 0;
        display: flex;
        align-items: center;
      }

      .ui-volume-slider__range {
        width: 100%;
      }

      .ui-volume-slider__value {
        font-size: 12px;
        font-weight: 700;
        color: var(--app-primary);
        font-variant-numeric: tabular-nums;
        min-width: 36px;
        text-align: right;
      }

      /* Vertical fader — the horizontal range is rotated so all the existing
         track/thumb styling carries over unchanged. */
      .ui-volume-slider--vertical {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: auto;
        width: 48px;
        padding: 10px 4px;
        gap: 8px;
      }

      .ui-volume-slider--vertical .ui-volume-slider__track-wrap {
        width: 24px;
        height: 93px;
        justify-content: center;
      }

      .ui-volume-slider--vertical .ui-volume-slider__range {
        width: 93px;
        transform: rotate(-90deg);
      }

      .ui-volume-slider--vertical .ui-volume-slider__value {
        min-width: 0;
        text-align: center;
      }
    `,
  ],
})
export class UiVolumeSliderComponent {
  readonly value = input<number>(100);
  readonly disabled = input<boolean>(false);
  readonly ariaLabel = input<string>('Volume');
  /** Render as an upright fader (used in the compact mobile board layout). */
  readonly vertical = input<boolean>(false);

  readonly preview = output<number>();
  readonly commit = output<number>();

  onInput(event: Event): void {
    const v = this.readValue(event);
    if (v !== null) this.preview.emit(v);
  }

  onCommit(event: Event): void {
    const v = this.readValue(event);
    if (v !== null) this.commit.emit(v);
  }

  private readValue(event: Event): number | null {
    const target = event.target as HTMLInputElement | null;
    if (!target) return null;
    const v = Number(target.value);
    return Number.isFinite(v) ? v : null;
  }
}
