import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'ui-form-actions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-form-actions">
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./ui-form-actions.component.scss'],
})
export class UiFormActionsComponent {}