import { Injectable, signal } from '@angular/core';

export interface InfoDialogOptions {
  title: string;
  message: string;
  closeText?: string;
}

export interface InfoDialogState {
  title: string;
  message: string;
  closeText: string;
}

/**
 * App-wide service for showing read-only text in a modal — e.g. a full
 * description that is truncated in a list/table.
 */
@Injectable({
  providedIn: 'root',
})
export class InfoDialogService {
  readonly dialog = signal<InfoDialogState | null>(null);

  open(options: InfoDialogOptions): void {
    this.dialog.set({
      title: options.title,
      message: options.message,
      closeText: options.closeText ?? 'Close',
    });
  }

  close(): void {
    this.dialog.set(null);
  }
}
