import {
  Component,
  HostBinding,
  Input,
  ViewEncapsulation,
} from '@angular/core';

@Component({
  selector: 'ui-table-shell',
  standalone: true,
  imports: [],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './ui-table-shell.component.html',
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