import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ChipVariant =
  | 'primary'
  | 'crimson'
  | 'gold'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'neutral';

export type ChipSize = 'sm' | 'md';

export type ChipShape = 'pill' | 'hex';

@Component({
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-chip.component.html',
  styleUrl: './ui-chip.component.scss',
})
export class UiChipComponent {
  readonly variant = input<ChipVariant>('neutral');
  readonly size = input<ChipSize>('md');
  readonly shape = input<ChipShape>('pill');
  readonly dot = input<boolean>(false);
  readonly keyLabel = input<string | null>(null);
  readonly tooltip = input<string | null>(null);

  readonly classList = computed(
    () => `ui-chip--${this.variant()} ui-chip--${this.size()} ui-chip--${this.shape()}`,
  );
}
