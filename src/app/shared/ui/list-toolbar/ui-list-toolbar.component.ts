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
  template: `
    <div class="ui-list-toolbar">
      <ui-search-box
        class="ui-list-toolbar__search"
        [value]="search()"
        [placeholder]="searchPlaceholder()"
        (valueChange)="search.set($event)"
      />

      @if (filterOptions(); as opts) {
        <label class="ui-list-toolbar__field">
          <span class="ui-list-toolbar__label">{{ filterLabel() }}</span>
          <ui-select
            [options]="opts"
            [ngModel]="filterValue()"
            [enableSearch]="false"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="filterValueChange.emit($event)"
          />
        </label>
      }

      @if (sortOptions(); as opts) {
        <label class="ui-list-toolbar__field">
          <span class="ui-list-toolbar__label">{{ sortLabel() }}</span>
          <ui-select
            [options]="opts"
            [ngModel]="sortValue()"
            [enableSearch]="false"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="sortValueChange.emit($event)"
          />
        </label>
      }
    </div>

    @if (showCount()) {
      <div class="ui-list-toolbar__count">{{ countText() }}</div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .ui-list-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
    }

    .ui-list-toolbar__search {
      min-width: 0;
    }

    .ui-list-toolbar:has(.ui-list-toolbar__field + .ui-list-toolbar__field) {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .ui-list-toolbar__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 160px;
    }

    .ui-list-toolbar__label {
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-heading);
    }

    .ui-list-toolbar__count {
      margin-top: 12px;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    @media (max-width: 860px) {
      .ui-list-toolbar,
      .ui-list-toolbar:has(.ui-list-toolbar__field + .ui-list-toolbar__field) {
        grid-template-columns: 1fr;
      }
    }
  `],
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
