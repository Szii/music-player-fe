import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
} from '@angular/core';
import { UiCloseButtonComponent } from '../buttons/ui-close-button.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

export type UiDialogShellSize = 'default' | 'wide' | 'extra-wide';

@Component({
  selector: 'ui-dialog-shell',
  imports: [UiCloseButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-dialog-shell.component.html',
  styleUrls: ['./ui-dialog-shell.component.scss'],
})
export class UiDialogShellComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly titleId = input('dialog-title');
  readonly size = input<UiDialogShellSize>('default');
  readonly showFooter = input(false);
  /** When true the body becomes a non-scrolling flex column so projected
      content (e.g. a list) can fill the height and own its own scroll —
      avoids a nested "scroll in scroll". */
  readonly bodyFill = input(false);

  readonly closed = output<void>();

  private readonly scrollLock = inject(ScrollLockService);

  constructor() {
    // Lock background scroll for the lifetime of the dialog so the page (and
    // navbar) can't travel behind the backdrop.
    this.scrollLock.lock();
    inject(DestroyRef).onDestroy(() => this.scrollLock.unlock());
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ui-dialog-backdrop')) {
      this.closed.emit();
    }
  }
}
