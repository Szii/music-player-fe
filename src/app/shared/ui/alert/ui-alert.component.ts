import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiAlertVariant = 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ui-alert',
  templateUrl: './ui-alert.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ui-alert.component.scss'],
})
export class UiAlertComponent {
  readonly variant = input<UiAlertVariant>('info');
  readonly actionSlot = input(false);
}