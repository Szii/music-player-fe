import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export type CloseButtonSize = 'sm' | 'md';
export type CloseButtonTone = 'default' | 'danger' | 'muted';

@Component({
  selector: 'ui-close-button',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-close-button.component.html',
  styleUrls: ['./ui-close-button.component.scss'],
})
export class UiCloseButtonComponent {
  /** Empty falls back to the translated default. */
  readonly ariaLabel = input('');
  readonly size = input<CloseButtonSize>('md');
  readonly tone = input<CloseButtonTone>('default');
  readonly disabled = input(false);

  readonly clicked = output<void>();

  readonly classes = computed(
    () => `ui-close-button ui-close-button--${this.size()} ui-close-button--${this.tone()}`,
  );
}
