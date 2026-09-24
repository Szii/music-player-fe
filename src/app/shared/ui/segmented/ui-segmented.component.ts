import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface UiSegmentedOption<T> {
  value: T;
  label: string;
  title?: string;
}

@Component({
  selector: 'ui-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-segmented" role="group" [attr.aria-label]="ariaLabel() || null">
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="ui-segmented__btn"
          [class.ui-segmented__btn--active]="option.value === value()"
          [attr.aria-pressed]="option.value === value()"
          [attr.title]="option.title || null"
          (click)="valueChange.emit(option.value)"
        >{{ option.label }}</button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }

    .ui-segmented {
      display: inline-flex;
      max-width: 100%;
      padding: 3px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-muted);
    }

    .ui-segmented__btn {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 0;
      background: transparent;
      color: var(--app-text-muted);
      padding: 6px 12px;
      border-radius: var(--app-radius-xs);
      font-family: var(--app-font-heading);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    }

    .ui-segmented__btn:focus-visible {
      outline: none;
      box-shadow: var(--app-focus-ring);
    }

    .ui-segmented__btn--active {
      background: var(--app-surface-elevated);
      color: var(--app-primary);
      box-shadow: 0 1px 3px rgba(88, 24, 13, 0.1);
    }
  `,
})
export class UiSegmentedComponent<T> {
  readonly options = input<readonly UiSegmentedOption<T>[]>([]);
  readonly value = input<T | null>(null);
  readonly ariaLabel = input('');

  readonly valueChange = output<T>();
}
