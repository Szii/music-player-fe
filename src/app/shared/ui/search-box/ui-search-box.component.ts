import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'ui-search-box',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-search-box.component.html',
  styleUrl: './ui-search-box.component.scss',
})
export class UiSearchBoxComponent {
  readonly value = input('');
  /** Empty falls back to the translated default. */
  readonly placeholder = input('');

  readonly valueChange = output<string>();

  clear(): void {
    this.valueChange.emit('');
  }
}
