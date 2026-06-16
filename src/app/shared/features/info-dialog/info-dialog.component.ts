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
  template: `
    @if (dialog(); as dlg) {
      <ui-dialog-shell
        [title]="dlg.title"
        titleId="info-dialog-title"
        [showFooter]="true"
        (closed)="infoDialog.close()"
      >
        <p class="info-dialog__message">{{ dlg.message }}</p>

        <ng-container dialog-footer>
          <normal-button
            type="button"
            variant="secondary"
            size="md"
            (clicked)="infoDialog.close()"
          >
            {{ dlg.closeText }}
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    /* Layer above any underlying ui-dialog-shell (z-index 1000) — info dialogs
       are opened from inside other modals (e.g. the workshop). Skip the backdrop
       blur so the modal underneath doesn't visibly blur/unblur. */
    :host ::ng-deep .ui-dialog-backdrop {
      z-index: 1300;
      backdrop-filter: none;
    }

    .info-dialog__message {
      margin: 0;
      font-size: 0.96rem;
      line-height: 1.5;
      color: var(--app-text);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `],
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
