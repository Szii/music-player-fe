import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-section-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-section-header.component.html',
  styleUrls: ['./ui-section-header.component.scss'],
})
export class UiSectionHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
}