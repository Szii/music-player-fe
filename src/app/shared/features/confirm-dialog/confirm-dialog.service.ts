import { Injectable, signal } from '@angular/core';

export type ConfirmDialogVariant = 'default' | 'danger';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: ConfirmDialogVariant;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  readonly dialog = signal<ConfirmDialogState | null>(null);

  private resolver: ((value: boolean) => void) | null = null;

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    if (this.resolver) {
      this.resolver(false);
      this.resolver = null;
    }

    this.dialog.set({
      open: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? 'Confirm',
      cancelText: options.cancelText ?? 'Cancel',
      variant: options.variant ?? 'default',
    });

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  accept(): void {
    this.resolveAndClose(true);
  }

  cancel(): void {
    this.resolveAndClose(false);
  }

  private resolveAndClose(result: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.dialog.set(null);
    resolve?.(result);
  }
}