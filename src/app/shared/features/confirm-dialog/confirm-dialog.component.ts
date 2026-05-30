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
  template: `
    @if (dialog(); as dlg) {
      <ui-dialog-shell
        [title]="dlg.title"
        titleId="confirm-dialog-title"
        [showFooter]="true"
        (closed)="confirmDialog.cancel()"
      >
        <p class="confirm-dialog__message">{{ dlg.message }}</p>

        <ng-container dialog-footer>
          <normal-button
            type="button"
            variant="secondary"
            size="md"
            (clicked)="confirmDialog.cancel()"
          >
            {{ dlg.cancelText }}
          </normal-button>

          <normal-button
            type="button"
            [variant]="dlg.variant === 'danger' ? 'danger' : 'primary'"
            size="md"
            (clicked)="confirmDialog.accept()"
          >
            {{ dlg.confirmText }}
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    /* Layer above any underlying ui-dialog-shell (z-index 1000) — confirm dialogs
       are routinely opened from inside other modals. Skip the backdrop blur so
       the modal underneath doesn't visibly blur/unblur when the confirm opens. */
    :host ::ng-deep .ui-dialog-backdrop {
      z-index: 1300;
      backdrop-filter: none;
    }

    .confirm-dialog__message {
      margin: 0;
      font-size: 0.96rem;
      line-height: 1.5;
      color: var(--app-text);
      white-space: pre-wrap;
    }
  `],
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
