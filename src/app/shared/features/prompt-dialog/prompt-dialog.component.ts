import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PromptDialogService } from './prompt-dialog.service';
import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';

@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NormalButtonComponent],
  template: `
    <ng-container *ngIf="dialog() as dlg">
      <div class="prompt-dialog-backdrop" (click)="onBackdropClick()">
        <div
          class="prompt-dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="'prompt-dialog-title'"
          (click)="$event.stopPropagation()"
        >
          <div class="prompt-dialog__header">
            <h2 id="prompt-dialog-title" class="prompt-dialog__title">
              {{ dlg.title }}
            </h2>
          </div>

          <form class="prompt-dialog__form" (ngSubmit)="submit()">
            <label *ngIf="dlg.label" class="prompt-dialog__label" for="prompt-dialog-input">
              {{ dlg.label }}
            </label>
            <input
              #inputEl
              id="prompt-dialog-input"
              class="prompt-dialog__input"
              type="text"
              [ngModel]="value()"
              (ngModelChange)="value.set($event)"
              name="promptDialogValue"
              [placeholder]="dlg.placeholder"
              [maxlength]="dlg.maxLength"
              autocomplete="off"
            />

            <div class="prompt-dialog__actions">
              <normal-button
                type="button"
                variant="secondary"
                size="md"
                (clicked)="cancel()"
              >
                {{ dlg.cancelText }}
              </normal-button>

              <normal-button
                type="submit"
                variant="primary"
                size="md"
                [disabled]="!canSubmit()"
              >
                {{ dlg.confirmText }}
              </normal-button>
            </div>
          </form>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 1300;
      pointer-events: none;
    }

    .prompt-dialog-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(22, 16, 10, 0.42);
      backdrop-filter: blur(2px);
      pointer-events: auto;
    }

    .prompt-dialog {
      width: min(440px, calc(100vw - 24px));
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 18px;
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.18),
        0 4px 14px rgba(0, 0, 0, 0.08);
      padding: 18px;
      color: var(--app-text);
      animation: prompt-dialog-in 140ms ease-out;
    }

    .prompt-dialog__header {
      margin-bottom: 12px;
    }

    .prompt-dialog__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 800;
      line-height: 1.2;
      color: var(--app-text);
    }

    .prompt-dialog__form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .prompt-dialog__label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--app-text-muted);
    }

    .prompt-dialog__input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
      background: #fff8ec;
      color: var(--app-text);
      font-family: var(--app-font-body);
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.12s, box-shadow 0.12s;
    }

    .prompt-dialog__input:focus {
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .prompt-dialog__actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    @keyframes prompt-dialog-in {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 520px) {
      .prompt-dialog {
        padding: 16px;
        border-radius: 16px;
      }

      .prompt-dialog__actions {
        flex-direction: column-reverse;
      }
    }
  `],
})
export class PromptDialogComponent implements AfterViewChecked {
  readonly promptDialog = inject(PromptDialogService);
  readonly dialog = computed(() => this.promptDialog.dialog());
  readonly value = signal('');
  readonly canSubmit = computed(() => this.value().trim().length > 0);

  @ViewChild('inputEl') inputRef?: ElementRef<HTMLInputElement>;
  private lastDialogId: object | null = null;
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
    if (this.needsFocus && this.inputRef) {
      const input = this.inputRef.nativeElement;
      input.focus();
      input.select();
      this.needsFocus = false;
    }
  }

  submit(): void {
    const trimmed = this.value().trim();
    if (!trimmed) return;
    this.promptDialog.submit(trimmed);
  }

  cancel(): void {
    this.promptDialog.cancel();
  }

  onBackdropClick(): void {
    this.cancel();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog()) {
      this.cancel();
    }
  }
}
