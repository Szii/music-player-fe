import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../ui/dialog-shell/ui-dialog-shell.component';
import { ConfirmDialogService } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  imports: [NormalButtonComponent, UiDialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly dialog = computed(() => this.confirmDialog.dialog());

  onEscape(): void {
    if (this.dialog()) {
      this.confirmDialog.cancel();
    }
  }
}
