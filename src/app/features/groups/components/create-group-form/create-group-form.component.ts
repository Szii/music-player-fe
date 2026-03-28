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
  ],
  template: `
    <normal-button (clicked)="open()">+ New group</normal-button>

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
      background: rgba(0, 0, 0, 0.45);
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
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
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
      padding: 18px 20px 14px;
      border-bottom: var(--app-border);
    }

    .modal__title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--app-text);
    }

    .modal__close {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }

    .modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
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