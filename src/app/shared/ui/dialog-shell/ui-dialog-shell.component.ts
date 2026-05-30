import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UiCloseButtonComponent } from '../buttons/ui-close-button.component';

@Component({
  selector: 'ui-dialog-shell',
  standalone: true,
  imports: [CommonModule, UiCloseButtonComponent],
  template: `
    <div class="ui-dialog-backdrop" (click)="onBackdropClick($event)">
      <div
        class="ui-dialog"
        [class.ui-dialog--wide]="wide"
        [class.ui-dialog--extra-wide]="extraWide"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
      >
        <div class="ui-dialog__header">
          <div class="ui-dialog__heading">
            <h2 class="ui-dialog__title" [id]="titleId">{{ title }}</h2>
            <p *ngIf="subtitle" class="ui-dialog__subtitle">{{ subtitle }}</p>
          </div>

          <ui-close-button
            ariaLabel="Close dialog"
            size="md"
            tone="danger"
            (clicked)="closed.emit()"
          ></ui-close-button>
        </div>

        <div class="ui-dialog__body">
          <ng-content></ng-content>
        </div>

        <div *ngIf="showFooter" class="ui-dialog__footer">
          <ng-content select="[dialog-footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./ui-dialog-shell.component.scss'],
})
export class UiDialogShellComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() titleId = 'dialog-title';
  @Input() wide = false;
  @Input() extraWide = false;
  @Input() showFooter = false;

  @Output() closed = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ui-dialog-backdrop')) {
      this.closed.emit();
    }
  }
}