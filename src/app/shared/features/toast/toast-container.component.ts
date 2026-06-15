import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastItem, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" role="region" aria-label="Notifications">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--success]="toast.type === 'success'"
          [class.toast--error]="toast.type === 'error'"
          [class.toast--info]="toast.type === 'info'"
          [class.toast--warning]="toast.type === 'warning'"
          [class.toast--leaving]="toast.leaving"
          [attr.role]="isUrgent(toast) ? 'alert' : 'status'"
          [attr.aria-live]="isUrgent(toast) ? 'assertive' : 'polite'"
          aria-atomic="true"
          (pointerenter)="toastService.pause(toast.id)"
          (pointerleave)="toastService.resume(toast.id)"
          (focusin)="toastService.pause(toast.id)"
          (focusout)="toastService.resume(toast.id)"
        >
          <div class="toast__body">
            <div class="toast__icon" aria-hidden="true">{{ icon(toast) }}</div>

            <div class="toast__content">
              <div class="toast__title">{{ title(toast) }}</div>
              <div class="toast__message">{{ toast.message }}</div>
            </div>

            <button
              type="button"
              class="toast__close"
              (click)="toastService.dismiss(toast.id)"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      }
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

    .toast--leaving {
      animation: toast-out 160ms ease-in forwards;
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

    .toast__close:focus-visible {
      outline: 2px solid var(--app-primary);
      outline-offset: 2px;
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

    @keyframes toast-out {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
      }
    }

    @media (max-width: 640px) {
      :host {
        top: auto;
        right: 12px;
        left: 12px;
        /* Sit above the iOS home indicator / Android gesture bar. */
        bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }

      .toast-stack {
        width: 100%;
      }

      /* On mobile the stack lives at the bottom, so it should rise into view. */
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes toast-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast,
      .toast--leaving {
        animation-duration: 0.01ms;
      }
    }
  `],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  /** Errors and warnings interrupt the screen reader; info/success wait. */
  isUrgent(toast: ToastItem): boolean {
    return toast.type === 'error' || toast.type === 'warning';
  }

  icon(toast: ToastItem): string {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'info':
        return 'i';
      default:
        return '!';
    }
  }

  title(toast: ToastItem): string {
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
