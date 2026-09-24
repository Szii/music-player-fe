import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToastAction, ToastItem, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  runAction(id: number, action: ToastAction): void {
    action.run();
    this.toastService.dismiss(id);
  }

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

  /** Returns a translation key; the template resolves it. */
  title(toast: ToastItem): string {
    switch (toast.type) {
      case 'success':
        return 'toast.success';
      case 'error':
        return 'toast.error';
      case 'warning':
        return 'toast.warning';
      default:
        return 'toast.info';
    }
  }
}
