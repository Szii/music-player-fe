import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'ghost'
  | 'navbar';

export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'normal-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './normal-button.component.html',
  styleUrls: ['./normal-button.component.scss'],
  host: {
    '[class.normal-button--full]': 'fullWidth()',
  },
})
export class NormalButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Stretch to the container's width, for stacked full-bleed actions. */
  readonly fullWidth = input(false);

  readonly clicked = output<MouseEvent>();

  readonly classes = computed(() => {
    const base = `app-btn app-btn--${this.variant()} app-btn--${this.size()}`;
    return this.fullWidth() ? `${base} app-btn--full` : base;
  });
}
