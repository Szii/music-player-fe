import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type PlayButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-play-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-play-button.component.html',
  styleUrl: './ui-play-button.component.scss',
})
export class UiPlayButtonComponent {
  readonly playing = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly size = input<PlayButtonSize>('md');
  readonly label = input<string | null>(null);
  readonly stopLabel = input<string>('Stop');
  readonly ariaLabel = input<string | null>(null);

  readonly clicked = output<void>();

  effectiveAriaLabel(): string {
    const explicit = this.ariaLabel();
    if (explicit) return explicit;
    return this.playing() ? this.stopLabel() : (this.label() ?? 'Play');
  }
}