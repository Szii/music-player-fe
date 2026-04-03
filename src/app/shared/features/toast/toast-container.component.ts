import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastItem, ToastService } from './toast.service'

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <div
        *ngFor="let toast of toastService.toasts(); trackBy: trackByToastId"
        class="toast"
        [class.toast--success]="toast.type === 'success'"
        [class.toast--error]="toast.type === 'error'"
        [class.toast--info]="toast.type === 'info'"
        [class.toast--warning]="toast.type === 'warning'"
        role="status">
        <div class="toast__body">
          <div class="toast__icon" aria-hidden="true">
            <span *ngIf="toast.type === 'success'">✓</span>
            <span *ngIf="toast.type === 'error'">!</span>
            <span *ngIf="toast.type === 'info'">i</span>
            <span *ngIf="toast.type === 'warning'">!</span>
          </div>

          <div class="toast__content">
            <div class="toast__title">
              {{ getTitle(toast) }}
            </div>
            <div class="toast__message">
              {{ toast.message }}
            </div>
          </div>

          <button
            type="button"
            class="toast__close"
            (click)="toastService.dismiss(toast.id)"
            aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      pointer-events: none;
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 1200;
    }

    .toast-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(380px, calc(100vw - 24px));
    }

    .toast {
      pointer-events: auto;
      border-radius: 16px;
      background: var(--app-surface);
      border: var(--app-border);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      animation: toast-in 180ms ease-out;
    }

    .toast__body {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: start;
      padding: 12px 14px;
    }

    .toast__icon {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .toast__content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .toast__title {
      font-size: 13px;
      font-weight: 800;
      color: var(--app-text);
      line-height: 1.2;
    }

    .toast__message {
      font-size: 14px;
      color: var(--app-text);
      line-height: 1.35;
      word-break: break-word;
    }

    .toast__close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--app-text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      flex-shrink: 0;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .toast__close:hover {
      background: color-mix(in srgb, var(--app-surface) 92%, black 8%);
      color: var(--app-text);
    }

    .toast--success {
      border-color: color-mix(in srgb, var(--app-success) 22%, transparent);
    }

    .toast--success .toast__icon {
      background: var(--app-success-soft);
      color: var(--app-success);
    }

    .toast--error {
      border-color: color-mix(in srgb, var(--app-danger) 22%, transparent);
    }

    .toast--error .toast__icon {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .toast--info {
      border-color: color-mix(in srgb, var(--app-primary) 22%, transparent);
    }

    .toast--info .toast__icon {
      background: var(--app-primary-soft);
      color: var(--app-primary);
    }

    .toast--warning {
      border-color: color-mix(in srgb, var(--app-warning) 22%, transparent);
    }

    .toast--warning .toast__icon {
      background: var(--app-warning-soft);
      color: var(--app-warning);
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 640px) {
      :host {
        top: auto;
        right: 12px;
        left: 12px;
        bottom: 12px;
      }

      .toast-stack {
        width: 100%;
      }
    }
  `],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  trackByToastId(_index: number, toast: ToastItem): number {
    return toast.id;
  }

  getTitle(toast: ToastItem): string {
    switch (toast.type) {
      case 'success':
        return 'Success';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      default:
        return 'Info';
    }
  }
}