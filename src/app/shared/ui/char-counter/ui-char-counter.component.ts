import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Small `current/max` character counter shown beneath a text field. Turns
 * amber as the value approaches the limit and red once it reaches it.
 * Decorative (aria-hidden) — the field itself enforces the limit via maxlength.
 */
@Component({
  selector: 'ui-char-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-char-counter.component.html',
  styleUrl: './ui-char-counter.component.scss',
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
