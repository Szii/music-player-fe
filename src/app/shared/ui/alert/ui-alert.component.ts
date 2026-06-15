import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiAlertVariant = 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ui-alert',
  template: `
    <div
      class="app-alert"
      [class.app-alert--info]="variant() === 'info'"
      [class.app-alert--success]="variant() === 'success'"
      [class.app-alert--warning]="variant() === 'warning'"
      [class.app-alert--danger]="variant() === 'danger'"
    >
      <div class="app-alert__content">
        <ng-content></ng-content>
      </div>

      @if (actionSlot()) {
        <div class="app-alert__actions">
          <ng-content select="[alert-actions]"></ng-content>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ui-alert.component.scss'],
})
export class UiAlertComponent {
  readonly variant = input<UiAlertVariant>('info');
  readonly actionSlot = input(false);
}