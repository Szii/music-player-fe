import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

export type AppIconName =
  | 'edit'
  | 'delete'
  | 'tracks'
  | 'windows'
  | 'close'
  | 'play'
  | 'pause'
  | 'save'
  | 'plus'
  | 'copy'
  | 'bookmark'
  | 'bookmark-remove'
  | 'more';

export type AppIconButtonVariant =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost';

export type AppIconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-icon-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-icon-button.component.html',
  styleUrl: './ui-icon-button.component.scss',
})
export class IconButtonComponent {
  readonly icon = input<AppIconName>('edit');
  readonly label = input('Action');
  readonly variant = input<AppIconButtonVariant>('neutral');
  readonly size = input<AppIconButtonSize>('md');
  readonly disabled = input(false);

  readonly clicked = output<void>();

  readonly classList = computed(
    () => `app-icon-btn--${this.size()} app-icon-btn--${this.variant()}`,
  );
}
