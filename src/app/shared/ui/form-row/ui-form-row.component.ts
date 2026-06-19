import { Component } from '@angular/core';

@Component({
  selector: 'ui-form-row',
  standalone: true,
  imports: [],
  template: `
    <div class="app-form-row">
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./ui-form-row.component.scss'],
})
export class UiFormRowComponent {}