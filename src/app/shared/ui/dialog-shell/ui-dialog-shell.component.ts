import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UiCloseButtonComponent } from '../buttons/ui-close-button.component';

export type UiDialogShellSize = 'default' | 'wide' | 'extra-wide';

@Component({
  selector: 'ui-dialog-shell',
  imports: [UiCloseButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-dialog-backdrop" (click)="onBackdropClick($event)">
      <div
        class="ui-dialog"
        [class.ui-dialog--wide]="size() === 'wide'"
        [class.ui-dialog--extra-wide]="size() === 'extra-wide'"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId()"
      >
        <div class="ui-dialog__header">
          <div class="ui-dialog__heading">
            <h2 class="ui-dialog__title" [id]="titleId()">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="ui-dialog__subtitle">{{ subtitle() }}</p>
            }
          </div>

          <ui-close-button
            ariaLabel="Close dialog"
            size="md"
            tone="danger"
            (clicked)="closed.emit()"
          />
        </div>

        <div class="ui-dialog__body">
          <ng-content />
        </div>

        @if (showFooter()) {
          <div class="ui-dialog__footer">
            <ng-content select="[dialog-footer]" />
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./ui-dialog-shell.component.scss'],
})
export class UiDialogShellComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly titleId = input('dialog-title');
  readonly size = input<UiDialogShellSize>('default');
  readonly showFooter = input(false);

  readonly closed = output<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ui-dialog-backdrop')) {
      this.closed.emit();
    }
  }
}
