import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { UiSearchBoxComponent } from '../search-box/ui-search-box.component';
import { UiSelectComponent, UiSelectOption } from '../select/ui-select.component';

@Component({
  selector: 'ui-list-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiSearchBoxComponent, UiSelectComponent],
  templateUrl: './ui-list-toolbar.component.html',
  styleUrl: './ui-list-toolbar.component.scss',
})
export class UiListToolbarComponent {
  readonly search = model('');
  readonly searchPlaceholder = input('Search');

  readonly filterValue = input<unknown>(null);
  readonly filterValueChange = output<unknown>();
  readonly filterOptions = input<UiSelectOption[] | null>(null);
  readonly filterLabel = input('Filter');

  readonly sortValue = input<unknown>(null);
  readonly sortValueChange = output<unknown>();
  readonly sortOptions = input<UiSelectOption[] | null>(null);
  readonly sortLabel = input('Sort');

  readonly filteredCount = input<number | null>(null);
  readonly totalCount = input<number | null>(null);
  readonly itemLabel = input('item');

  readonly showCount = computed(() =>
    this.filteredCount() !== null && this.totalCount() !== null,
  );

  readonly countText = computed(() => {
    const filtered = this.filteredCount();
    const total = this.totalCount();
    if (filtered === null || total === null) return '';
    const label = this.itemLabel();
    const plural = total === 1 ? label : `${label}s`;
    return `${filtered} / ${total} ${plural}`;
  });
}
