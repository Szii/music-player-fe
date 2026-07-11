import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-empty-state.component.html',
  styleUrls: ['./ui-empty-state.component.scss'],
})
export class UiEmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = '';
  @Input() actions = false;
}