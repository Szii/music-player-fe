import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

import { UiSearchBoxComponent } from '../search-box/ui-search-box.component';
import { UiSelectComponent, UiSelectOption } from '../select/ui-select.component';

@Component({
  selector: 'ui-list-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiSearchBoxComponent, UiSelectComponent, TranslocoPipe],
  templateUrl: './ui-list-toolbar.component.html',
  styleUrl: './ui-list-toolbar.component.scss',
})
export class UiListToolbarComponent {
  readonly search = model('');
  /** Empty falls back to the translated default. */
  readonly searchPlaceholder = input('');

  readonly filterValue = input<unknown>(null);
  readonly filterValueChange = output<unknown>();
  readonly filterOptions = input<UiSelectOption[] | null>(null);
  readonly filterLabel = input('');

  readonly sortValue = input<unknown>(null);
  readonly sortValueChange = output<unknown>();
  readonly sortOptions = input<UiSelectOption[] | null>(null);
  readonly sortLabel = input('');

  readonly filteredCount = input<number | null>(null);
  readonly totalCount = input<number | null>(null);

  readonly showCount = computed(() =>
    this.filteredCount() !== null && this.totalCount() !== null,
  );
}
