import { Component, EventEmitter, Input, Output } from '@angular/core';

export type CloseButtonSize = 'sm' | 'md';
export type CloseButtonTone = 'default' | 'danger' | 'muted';

@Component({
  selector: 'ui-close-button',
  standalone: true,
  imports: [],
  templateUrl: './ui-close-button.component.html',
  styleUrls: ['./ui-close-button.component.scss'],
})
export class UiCloseButtonComponent {
  @Input() ariaLabel = 'Close';
  @Input() size: CloseButtonSize = 'md';
  @Input() tone: CloseButtonTone = 'default';
  @Input() disabled = false;

  @Output() clicked = new EventEmitter<void>();

  get classes(): string {
    return `ui-close-button ui-close-button--${this.size} ui-close-button--${this.tone}`;
  }
}