import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Inline stroke icons (Lucide-style) for use inside text / chips / labels.
    Sized to 1em so it scales with the surrounding font-size. */
export type UiIconName =
  | 'single'
  | 'playlist'
  | 'loop'
  | 'shuffle'
  | 'ordered'
  | 'overlap'
  | 'keyboard';

@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-icon.component.html',
  styleUrl: './ui-icon.component.scss',
})
export class UiIconComponent {
  readonly name = input.required<UiIconName>();
}
