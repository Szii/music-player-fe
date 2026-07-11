import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-page-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-page-title.component.html',
  styleUrl: './ui-page-title.component.scss',
})
export class UiPageTitleComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
