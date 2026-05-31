import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-text-input" [class.ui-text-input--password]="isPassword()">
      <input
        class="app-input"
        [type]="currentType()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="handleInput($event)"
        (blur)="handleBlur()"
      />

      @if (isPassword()) {
        <button
          type="button"
          class="ui-text-input__reveal"
          [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
          [attr.aria-pressed]="showPassword()"
          [disabled]="disabled()"
          (mousedown)="$event.preventDefault()"
          (click)="toggleReveal()"
        >
          <svg
            class="ui-text-input__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.9"
            aria-hidden="true"
          >
            @if (showPassword()) {
              <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.2 3.9" />
              <path d="M6.1 6.1A17.3 17.3 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4-0.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              <path d="M4 4l16 16" />
            } @else {
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            }
          </svg>
        </button>
      }
    </div>
  `,
  styleUrls: ['./ui-text-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: UiTextInputComponent,
      multi: true,
    },
  ],
})
export class UiTextInputComponent implements ControlValueAccessor {
  readonly type = input<'text' | 'email' | 'password' | 'url'>('text');
  readonly placeholder = input('');

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly showPassword = signal(false);

  readonly isPassword = computed(() => this.type() === 'password');
  readonly currentType = computed(() =>
    this.isPassword() && this.showPassword() ? 'text' : this.type(),
  );

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggleReveal(): void {
    this.showPassword.update(visible => !visible);
  }

  handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  handleBlur(): void {
    this.onTouched();
  }
}
