import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../ui/dialog-shell/ui-dialog-shell.component';
import { InfoDialogService } from './info-dialog.service';

@Component({
  selector: 'app-info-dialog',
  imports: [NormalButtonComponent, UiDialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.scss',
})
export class InfoDialogComponent {
  readonly infoDialog = inject(InfoDialogService);
  readonly dialog = computed(() => this.infoDialog.dialog());

  onEscape(): void {
    if (this.dialog()) {
      this.infoDialog.close();
    }
  }
}
