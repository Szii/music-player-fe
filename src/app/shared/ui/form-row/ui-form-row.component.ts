import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'ui-form-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-form-row">
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./ui-form-row.component.scss'],
})
export class UiFormRowComponent {}