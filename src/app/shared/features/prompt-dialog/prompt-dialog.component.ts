import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../ui/dialog-shell/ui-dialog-shell.component';
import { PromptDialogService } from './prompt-dialog.service';

@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule, NormalButtonComponent, UiDialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (dialog(); as dlg) {
      <ui-dialog-shell
        [title]="dlg.title"
        titleId="prompt-dialog-title"
        [showFooter]="true"
        (closed)="cancel()"
      >
        <form class="prompt-dialog__form" (ngSubmit)="submit()">
          @if (dlg.label) {
            <label class="prompt-dialog__label" for="prompt-dialog-input">
              {{ dlg.label }}
            </label>
          }
          <input
            #inputEl
            id="prompt-dialog-input"
            class="app-input"
            type="text"
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
            name="promptDialogValue"
            [placeholder]="dlg.placeholder"
            [maxlength]="dlg.maxLength"
            autocomplete="off"
          />
        </form>

        <ng-container dialog-footer>
          <normal-button
            type="button"
            variant="secondary"
            size="md"
            (clicked)="cancel()"
          >
            {{ dlg.cancelText }}
          </normal-button>

          <normal-button
            type="button"
            variant="primary"
            size="md"
            [disabled]="!canSubmit()"
            (clicked)="submit()"
          >
            {{ dlg.confirmText }}
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    /* Layer above any underlying ui-dialog-shell (z-index 1000) — prompt dialogs
       are routinely opened from inside other modals. Skip the backdrop blur so
       the modal underneath doesn't visibly blur/unblur when the prompt opens. */
    :host ::ng-deep .ui-dialog-backdrop {
      z-index: 1300;
      backdrop-filter: none;
    }

    .prompt-dialog__form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .prompt-dialog__label {
      font-family: var(--app-font-heading);
      font-weight: 600;
      font-size: 0.82rem;
      color: var(--app-heading);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  `],
})
export class PromptDialogComponent implements AfterViewChecked {
  readonly promptDialog = inject(PromptDialogService);
  readonly dialog = computed(() => this.promptDialog.dialog());
  readonly value = signal('');
  readonly canSubmit = computed(() => this.value().trim().length > 0);

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  private needsFocus = false;

  constructor() {
    effect(() => {
      const dlg = this.promptDialog.dialog();
      if (dlg) {
        this.value.set(dlg.initialValue ?? '');
        this.needsFocus = true;
      } else {
        this.value.set('');
      }
    });
  }

  ngAfterViewChecked(): void {
    if (!this.needsFocus) return;
    const input = this.inputRef()?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
    this.needsFocus = false;
  }

  submit(): void {
    const trimmed = this.value().trim();
    if (!trimmed) return;
    this.promptDialog.submit(trimmed);
  }

  cancel(): void {
    this.promptDialog.cancel();
  }

  onEscape(): void {
    if (this.dialog()) {
      this.cancel();
    }
  }
}
