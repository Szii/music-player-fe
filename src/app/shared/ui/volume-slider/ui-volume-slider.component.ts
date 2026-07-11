import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ui-volume-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-volume-slider.component.html',
  styleUrl: './ui-volume-slider.component.scss',
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
