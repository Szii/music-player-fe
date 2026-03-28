import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-form-field',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-form-field">
      <label *ngIf="label" class="app-form-field__label">
        {{ label }}
      </label>

      <div class="app-form-field__control">
        <ng-content></ng-content>
      </div>

      <div *ngIf="hint && !error" class="app-form-field__hint">
        {{ hint }}
      </div>

      <div *ngIf="error" class="app-form-field__error">
        {{ error }}
      </div>
    </div>
  `,
  styleUrls: ['./ui-form-field.component.scss'],
})
export class UiFormFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() error = '';
}