import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { GroupRequest } from '../../../../api/generated';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
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
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    IconButtonComponent,
    UiDialogShellComponent,
  ],
  template: `
    @if (showTrigger()) {
      <app-icon-button
        icon="plus"
        label="Add group"
        variant="primary"
        size="lg"
        (clicked)="open()"
      />
    }

    @if (isOpen()) {
      <ui-dialog-shell
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
              [maxLength]="nameMaxLength"
            />
          </ui-form-field>
        </form>

        <ng-container dialog-footer>
          <normal-button type="button" variant="secondary" (clicked)="close()">
            Cancel
          </normal-button>
          <normal-button
            type="submit"
            [disabled]="submitting() || !createForm.value.listName?.trim()"
            [loading]="submitting()"
            (clicked)="submit()"
          >
            Create group
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
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
  private readonly fb = inject(FormBuilder);

  readonly showTrigger = input(true);

  readonly groupCreateRequested = output<GroupRequest>();

  readonly isOpen = signal(false);
  readonly submitting = signal(false);
  readonly nameMaxLength = FIELD_LIMITS.group.name;

  readonly createForm = this.fb.group({
    listName: [''],
  });

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.createForm.reset({ listName: '' });
    this.submitting.set(false);
  }

  submit(): void {
    const listName = this.createForm.value.listName?.trim();
    if (!listName) return;
    this.submitting.set(true);
    this.groupCreateRequested.emit({ listName });
  }

  reset(): void {
    this.close();
  }
}
