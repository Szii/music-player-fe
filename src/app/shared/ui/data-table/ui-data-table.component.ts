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
  templateUrl: './ui-data-table.component.html',
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