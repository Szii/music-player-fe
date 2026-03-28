import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type UiAlertVariant = 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ui-alert',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-alert" [class.app-alert--info]="variant === 'info'"
         [class.app-alert--success]="variant === 'success'"
         [class.app-alert--warning]="variant === 'warning'"
         [class.app-alert--danger]="variant === 'danger'">
      <div class="app-alert__content">
        <ng-content></ng-content>
      </div>

      <div *ngIf="actionSlot" class="app-alert__actions">
        <ng-content select="[alert-actions]"></ng-content>
      </div>
    </div>
  `,
  styleUrls: ['./ui-alert.component.scss'],
})
export class UiAlertComponent {
  @Input() variant: UiAlertVariant = 'info';
  @Input() actionSlot = false;
}