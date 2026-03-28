import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-empty-state">
      <div class="app-empty-state__title">{{ title }}</div>
      <div *ngIf="message" class="app-empty-state__message">{{ message }}</div>

      <div *ngIf="actions" class="app-empty-state__actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrls: ['./ui-empty-state.component.scss'],
})
export class UiEmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = '';
  @Input() actions = false;
}