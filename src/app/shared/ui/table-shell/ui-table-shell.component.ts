import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  Input,
  ViewEncapsulation,
} from '@angular/core';

@Component({
  selector: 'ui-table-shell',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="app-table-wrap"
      [class.app-table-wrap--fill]="fill"
      [style.max-height]="maxHeight || null"
      [style.overflow-y]="maxHeight ? 'auto' : null"
    >
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./ui-table-shell.component.scss'],
})
export class UiTableShellComponent {
  @Input() maxHeight: string | null = null;
  @Input() fill = false;

  @HostBinding('class.app-table-shell')
  readonly hostClass = true;

  @HostBinding('class.app-table-shell--fill')
  get fillClass(): boolean {
    return this.fill;
  }
}