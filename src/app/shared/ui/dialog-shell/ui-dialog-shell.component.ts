import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'ui-dialog-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ui-dialog-backdrop" (click)="onBackdropClick($event)">
      <div
        class="ui-dialog"
        [class.ui-dialog--wide]="wide"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
      >
        <div class="ui-dialog__header">
          <div class="ui-dialog__heading">
            <h2 class="ui-dialog__title" [id]="titleId">{{ title }}</h2>
            <p *ngIf="subtitle" class="ui-dialog__subtitle">{{ subtitle }}</p>
          </div>

          <button
            type="button"
            class="ui-dialog__close"
            (click)="closed.emit()"
            aria-label="Close"
          >
            ✕
          </button>
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
  styles: [`
    :host {
      display: block;
    }

    .ui-dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
      animation: ui-dialog-fade-in 0.15s ease;
    }

    @keyframes ui-dialog-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .ui-dialog {
      width: min(100%, 560px);
      max-height: min(90vh, 900px);
      display: flex;
      flex-direction: column;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
      overflow: hidden;
      animation: ui-dialog-slide-in 0.18s ease;
    }

    .ui-dialog--wide {
      width: min(100%, 860px);
    }

    @keyframes ui-dialog-slide-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .ui-dialog__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: var(--app-border);
      flex-shrink: 0;
    }

    .ui-dialog__heading {
      min-width: 0;
    }

    .ui-dialog__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--app-text);
    }

    .ui-dialog__subtitle {
      margin: 4px 0 0;
      font-size: 0.92rem;
      color: var(--app-text-muted);
    }

    .ui-dialog__close {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .ui-dialog__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .ui-dialog__body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 20px;
    }

    .ui-dialog__footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px 20px;
      border-top: var(--app-border);
      flex-shrink: 0;
      background: var(--app-surface);
    }
  `],
})
export class UiDialogShellComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() titleId = 'dialog-title';
  @Input() wide = false;
  @Input() showFooter = false;

  @Output() closed = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ui-dialog-backdrop')) {
      this.closed.emit();
    }
  }
}