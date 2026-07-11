import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Large, centered "create" call-to-action card used for empty states
 * (e.g. first session, first board, first group). Emits `clicked` so the
 * host can open the relevant create flow.
 */
@Component({
  selector: 'ui-create-cta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-create-cta.component.html',
  styleUrl: './ui-create-cta.component.scss',
})
export class UiCreateCtaComponent {
  readonly label = input.required<string>();
  readonly ariaLabel = input('');
  readonly clicked = output<MouseEvent>();
}
