import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  TemplateRef,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiTableShellComponent } from '../table-shell/ui-table-shell.component';

export interface UiDataTableColumn {
  label: string;
  className?: string;
  width?: string;
}

@Component({
  selector: 'ui-data-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, UiTableShellComponent],
  template: `
    <ui-table-shell [maxHeight]="maxHeight()">
      <table class="app-table" [ngClass]="tableClass()">
        <colgroup>
          <col
            *ngFor="let column of columns()"
            [class]="column.className || null"
            [style.width]="column.width || null"
          />
        </colgroup>

        <thead>
          <tr>
            <th
              *ngFor="let column of columns()"
              [class]="column.className || null"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>

        <tbody>
          <ng-container
            *ngFor="let row of rows(); let i = index; trackBy: trackByInternal"
          >
            <ng-container
              *ngTemplateOutlet="
                rowTemplate || defaultRowTemplate;
                context: { $implicit: row, index: i }
              "
            />
          </ng-container>
        </tbody>
      </table>
    </ui-table-shell>

    <ng-template #defaultRowTemplate let-row>
      <tr>
        <td [attr.colspan]="columns().length">
          {{ row | json }}
        </td>
      </tr>
    </ng-template>
  `,
})
export class UiDataTableComponent {
  readonly rows = input<any[]>([]);
  readonly columns = input<UiDataTableColumn[]>([]);
  readonly tableClass = input<string>('');
  readonly maxHeight = input<string | null>(null);
  readonly trackBy = input<((index: number, row: any) => unknown) | null>(null);

  @ContentChild(TemplateRef) rowTemplate?: TemplateRef<any>;

  trackByInternal = (index: number, row: any): unknown => {
    const fn = this.trackBy();
    return fn ? fn(index, row) : index;
  };
}