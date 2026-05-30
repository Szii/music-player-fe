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
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';

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
    UiDialogShellComponent,
  ],
  template: `
    <app-icon-button
      icon="plus"
      label="Add group"
      variant="primary"
      size="lg"
      (clicked)="open()"
    />

    <ui-dialog-shell
      *ngIf="isOpen"
      title="Create group"
      titleId="create-group-title"
      [showFooter]="true"
      (closed)="close()"
    >
      <form [formGroup]="createForm" (ngSubmit)="submit()" class="create-group-form">
        <ui-form-field label="Group name">
          <ui-text-input
            formControlName="listName"
            placeholder="e.g. Combat Music"
          />
        </ui-form-field>
      </form>

      <ng-container dialog-footer>
        <normal-button type="button" variant="secondary" (clicked)="close()">
          Cancel
        </normal-button>
        <normal-button
          type="submit"
          [disabled]="submitting || !createForm.value.listName?.trim()"
          [loading]="submitting"
          (clicked)="submit()"
        >
          Create group
        </normal-button>
      </ng-container>
    </ui-dialog-shell>
  `,
  styles: [`
    .create-group-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
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
