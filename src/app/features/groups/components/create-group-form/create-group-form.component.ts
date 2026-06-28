import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { GroupRequest } from '../../../../api/generated';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  PROFANITY_ERROR,
  profanityValidator,
} from '../../../../shared/validators/profanity.validator';
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
  templateUrl: './create-group-form.component.html',
  styleUrl: './create-group-form.component.scss',
})
export class CreateGroupFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly showTrigger = input(true);

  readonly groupCreateRequested = output<GroupRequest>();

  readonly isOpen = signal(false);
  readonly submitting = signal(false);
  readonly nameMaxLength = FIELD_LIMITS.group.name;

  readonly createForm = this.fb.group({
    listName: ['', [profanityValidator]],
  });

  readonly nameError = computed(() => {
    const control = this.createForm.controls.listName;
    if (!control.touched || !control.hasError('profanity')) return '';
    return PROFANITY_ERROR;
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
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const listName = this.createForm.value.listName?.trim();
    if (!listName) return;
    this.submitting.set(true);
    this.groupCreateRequested.emit({ listName });
  }

  reset(): void {
    this.close();
  }
}
