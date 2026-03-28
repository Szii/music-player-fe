import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-section-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-section-header">
      <div>
        <h3 class="app-section-header__title">{{ title }}</h3>
        <p *ngIf="subtitle" class="app-section-header__subtitle">{{ subtitle }}</p>
      </div>

      <div class="app-section-header__actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrls: ['./ui-section-header.component.scss'],
})
export class UiSectionHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
}