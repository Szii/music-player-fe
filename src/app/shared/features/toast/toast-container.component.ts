import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastItem, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
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
