import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-empty-state',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-empty-state.component.html',
  styleUrls: ['./ui-empty-state.component.scss'],
})
export class UiEmptyStateComponent {
  readonly title = input('');
  readonly message = input('');
  readonly actions = input(false);
}
