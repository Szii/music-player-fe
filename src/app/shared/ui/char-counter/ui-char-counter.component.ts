import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Small `current/max` character counter shown beneath a text field. Turns
 * amber as the value approaches the limit and red once it reaches it.
 * Decorative (aria-hidden) — the field itself enforces the limit via maxlength.
 */
@Component({
  selector: 'ui-char-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="ui-char-counter"
      [class.ui-char-counter--near]="state() === 'near'"
      [class.ui-char-counter--at]="state() === 'at'"
      aria-hidden="true"
    >
      {{ current() }}/{{ max() }}
    </span>
  `,
  styles: [`
    .ui-char-counter {
      display: block;
      margin-top: 4px;
      font-size: 0.72rem;
      line-height: 1;
      text-align: right;
      color: var(--app-text-soft);
      font-variant-numeric: tabular-nums;
      transition: color 0.15s ease;
    }

    .ui-char-counter--near {
      color: var(--app-warning);
    }

    .ui-char-counter--at {
      color: var(--app-danger);
      font-weight: 600;
    }
  `],
})
export class UiCharCounterComponent {
  readonly current = input.required<number>();
  readonly max = input.required<number>();

  readonly state = computed<'normal' | 'near' | 'at'>(() => {
    const max = this.max();
    const current = this.current();
    if (current >= max) return 'at';
    if (current >= max * 0.9) return 'near';
    return 'normal';
  });
}
