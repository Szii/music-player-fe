import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiCharCounterComponent } from '../char-counter/ui-char-counter.component';

@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCharCounterComponent],
  templateUrl: './ui-text-input.component.html',
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
  readonly autocomplete = input<string | null>(null);
  /** Field identity (`name`/`id`) — helps browser autofill categorise the field
      (e.g. a username field that would otherwise be guessed as email). */
  readonly name = input<string | null>(null);
  /** Max character length. When set, enforces the limit and shows a counter. */
  readonly maxLength = input<number | null>(null);

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly showPassword = signal(false);

  readonly isPassword = computed(() => this.type() === 'password');
  readonly currentType = computed(() =>
    this.isPassword() && this.showPassword() ? 'text' : this.type(),
  );

  readonly count = computed(() => this.value().length);
  /** Counter is hidden on passwords — surfacing length there is poor UX. */
  readonly showCounter = computed(
    () => this.maxLength() != null && !this.isPassword(),
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
