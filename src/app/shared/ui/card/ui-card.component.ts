import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="app-card">
      <div *ngIf="title || headerActions" class="app-card__header">
        <div class="app-card__title-wrap">
          <h2 *ngIf="title" class="app-card__title">{{ title }}</h2>
          <ng-content select="[card-subtitle]"></ng-content>
        </div>

        <div *ngIf="headerActions" class="app-card__actions">
          <ng-content select="[card-actions]"></ng-content>
        </div>
      </div>

      <div class="app-card__body">
        <ng-content></ng-content>
      </div>
    </section>
  `,
  styleUrls: ['./ui-card.component.scss'],
})
export class UiCardComponent {
  @Input() title = '';
  @Input() headerActions = false;
}