import { CommonModule } from '@angular/common';
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'ui-number-input',
  standalone: true,
  imports: [CommonModule],
  template: `
    <input
      class="app-input app-input--number"
      type="number"
      [attr.min]="min"
      [attr.max]="max"
      [attr.step]="step"
      [placeholder]="placeholder"
      [disabled]="disabled"
      [value]="value ?? ''"
      (input)="handleInput($event)"
      (blur)="handleBlur()"
    />
  `,
  styleUrls: ['./ui-number-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiNumberInputComponent),
      multi: true,
    },
  ],
})
export class UiNumberInputComponent implements ControlValueAccessor {
  @Input() min: number | null = null;
  @Input() max: number | null = null;
  @Input() step: number | null = null;
  @Input() placeholder = '';

  value: number | null = null;
  disabled = false;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.value = value;
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const nextValue = raw === '' ? null : Number(raw);
    this.value = nextValue;
    this.onChange(nextValue);
  }

  handleBlur(): void {
    this.onTouched();
  }
}