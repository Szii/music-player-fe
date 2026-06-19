import { Component } from '@angular/core';

@Component({
  selector: 'ui-form-actions',
  standalone: true,
  imports: [],
  template: `
    <div class="app-form-actions">
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./ui-form-actions.component.scss'],
})
export class UiFormActionsComponent {}