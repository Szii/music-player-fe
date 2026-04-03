import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject } from '@angular/core';
import { ConfirmDialogService } from './confirm-dialog.service';
import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, NormalButtonComponent],
  template: `
    <ng-container *ngIf="dialog() as dlg">
      <div class="confirm-dialog-backdrop" (click)="onBackdropClick()">
        <div
          class="confirm-dialog"
          [class.confirm-dialog--danger]="dlg.variant === 'danger'"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="'confirm-dialog-title'"
          [attr.aria-describedby]="'confirm-dialog-message'"
          (click)="$event.stopPropagation()">

          <div class="confirm-dialog__header">
            <h2 id="confirm-dialog-title" class="confirm-dialog__title">
              {{ dlg.title }}
            </h2>
          </div>

          <div id="confirm-dialog-message" class="confirm-dialog__message">
            {{ dlg.message }}
          </div>

          <div class="confirm-dialog__actions">
            <normal-button
              type="button"
              variant="secondary"
              size="md"
              (clicked)="confirmDialog.cancel()">
              {{ dlg.cancelText }}
            </normal-button>

            <normal-button
              type="button"
              [variant]="dlg.variant === 'danger' ? 'danger' : 'primary'"
              size="md"
              (clicked)="confirmDialog.accept()">
              {{ dlg.confirmText }}
            </normal-button>
          </div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 1300;
      pointer-events: none;
    }

    .confirm-dialog-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(22, 16, 10, 0.42);
      backdrop-filter: blur(2px);
      pointer-events: auto;
    }

    .confirm-dialog {
      width: min(440px, calc(100vw - 24px));
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 18px;
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.18),
        0 4px 14px rgba(0, 0, 0, 0.08);
      padding: 18px;
      color: var(--app-text);
      animation: confirm-dialog-in 140ms ease-out;
    }

    .confirm-dialog--danger {
      border-color: color-mix(in srgb, var(--app-danger) 28%, var(--app-border-color));
    }

    .confirm-dialog__header {
      margin-bottom: 8px;
    }

    .confirm-dialog__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 800;
      line-height: 1.2;
      color: var(--app-text);
    }

    .confirm-dialog__message {
      font-size: 0.96rem;
      line-height: 1.5;
      color: var(--app-text-muted);
      margin-bottom: 18px;
      white-space: pre-wrap;
    }

    .confirm-dialog__actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    @keyframes confirm-dialog-in {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 520px) {
      .confirm-dialog {
        padding: 16px;
        border-radius: 16px;
      }

      .confirm-dialog__actions {
        flex-direction: column-reverse;
      }
    }
  `],
})
export class ConfirmDialogComponent {
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly dialog = computed(() => this.confirmDialog.dialog());

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog()) {
      this.confirmDialog.cancel();
    }
  }

  onBackdropClick(): void {
    this.confirmDialog.cancel();
  }
}