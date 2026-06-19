import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-form-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-form-field.component.html',
  styleUrls: ['./ui-form-field.component.scss'],
})
export class UiFormFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() error = '';
}