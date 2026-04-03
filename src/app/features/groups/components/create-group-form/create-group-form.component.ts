import {
  Component,
  EventEmitter,
  Output,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { GroupRequest } from '../../../../api/generated';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';

@Component({
  selector: 'app-create-group-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    IconButtonComponent,
  ],
  template: `
      <app-icon-button
        icon="plus"
        label="Add group"
        variant="primary"
        size="lg"
        (clicked)="open()"
      />

    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="group-modal-title">

        <div class="modal__header">
          <h2 class="modal__title" id="group-modal-title">Create group</h2>
          <button class="modal__close" (click)="close()" aria-label="Close">✕</button>
        </div>

        <form [formGroup]="createForm" (ngSubmit)="submit()" class="modal__body">

          <ui-form-field label="Group name">
            <ui-text-input
              formControlName="listName"
              placeholder="e.g. Combat Music"
            />
          </ui-form-field>

          <div class="modal__actions">
            <normal-button type="button" variant="secondary" (clicked)="close()">
              Cancel
            </normal-button>
            <normal-button
              type="submit"
              [disabled]="submitting || !createForm.value.listName?.trim()"
              [loading]="submitting"
            >
              Create group
            </normal-button>
          </div>

        </form>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse at center, rgba(88, 24, 13, 0.1), transparent 60%),
        linear-gradient(180deg, rgba(10, 5, 2, 0.6), rgba(10, 5, 2, 0.72));
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fade-in 0.15s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .modal {
      width: 100%;
      max-width: 400px;
      background: var(--app-parchment);
      border: 1px solid var(--app-border-color);
      border-top: 3px solid var(--app-primary);
      border-radius: var(--app-radius-lg);
      box-shadow:
        0 28px 72px rgba(8, 3, 1, 0.48),
        0 10px 30px rgba(8, 3, 1, 0.26),
        inset 0 0 0 3px rgba(201, 164, 76, 0.1);
      overflow: hidden;
      animation: slide-in 0.18s ease;
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)     scale(1);    }
    }

    .modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--app-border-color-soft);
      background: var(--app-header-surface);
      position: relative;
    }

    .modal__header::after {
      content: '';
      position: absolute;
      left: 20px; right: 20px; bottom: 0;
      height: 2px;
      border-radius: 999px;
      background: var(--app-divider-decor);
    }

    .modal__title {
      margin: 0;
      font-family: var(--app-font-heading);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--app-heading);
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.12);
    }

    .modal__close {
      width: 28px;
      height: 28px;
      border-radius: var(--app-radius-xs);
      border: 1px solid rgba(88, 24, 13, 0.12);
      background: transparent;
      color: var(--app-text-muted);
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.22);
    }

    .modal__body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
    }

    .modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }
  `],
})
export class CreateGroupFormComponent {
  @Output() groupCreateRequested = new EventEmitter<GroupRequest>();

  private fb = inject(FormBuilder);

  isOpen = false;
  submitting = false;

  createForm = this.fb.group({
    listName: [''],
  });

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.createForm.reset({ listName: '' });
    this.submitting = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  submit(): void {
    const listName = this.createForm.value.listName?.trim();
    if (!listName) return;
    this.submitting = true;
    this.groupCreateRequested.emit({ listName });
  }

  reset(): void {
    this.close();
  }
}