import { Injectable, signal } from '@angular/core';

export interface PromptDialogOptions {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  maxLength?: number;
}

export interface PromptDialogState {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  initialValue: string;
  confirmText: string;
  cancelText: string;
  maxLength: number;
}

@Injectable({ providedIn: 'root' })
export class PromptDialogService {
  readonly dialog = signal<PromptDialogState | null>(null);

  private resolver: ((value: string | null) => void) | null = null;

  prompt(options: PromptDialogOptions): Promise<string | null> {
    if (this.resolver) {
      this.resolver(null);
      this.resolver = null;
    }

    this.dialog.set({
      open: true,
      title: options.title,
      label: options.label ?? '',
      placeholder: options.placeholder ?? '',
      initialValue: options.initialValue ?? '',
      confirmText: options.confirmText ?? 'OK',
      cancelText: options.cancelText ?? 'Cancel',
      maxLength: options.maxLength ?? 120,
    });

    return new Promise<string | null>((resolve) => {
      this.resolver = resolve;
    });
  }

  submit(value: string): void {
    this.resolveAndClose(value);
  }

  cancel(): void {
    this.resolveAndClose(null);
  }

  private resolveAndClose(result: string | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.dialog.set(null);
    resolve?.(result);
  }
}
