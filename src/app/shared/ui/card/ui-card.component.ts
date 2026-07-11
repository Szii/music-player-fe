import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-card.component.html',
  styleUrls: ['./ui-card.component.scss'],
})
export class UiCardComponent {
  @Input() title = '';
  @Input() headerActions = false;
}