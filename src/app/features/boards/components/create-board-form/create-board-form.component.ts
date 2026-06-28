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
import { toSignal } from '@angular/core/rxjs-interop';
import { Track } from '../../../../api/generated';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  PROFANITY_ERROR,
  hasProfanity,
  profanityValidator,
} from '../../../../shared/validators/profanity.validator';

export interface CreateBoardEvent {
  name: string;
  selectedTrackId: number | null;
}

@Component({
  selector: 'app-create-board-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    IconButtonComponent,
    UiSelectComponent,
    UiDialogShellComponent,
  ],
  templateUrl: './create-board-form.component.html',
  styleUrl: './create-board-form.component.scss',
})
export class CreateBoardFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly tracks = input<Track[]>([]);
  readonly submitting = input(false);
  readonly showTrigger = input(true);

  readonly create = output<CreateBoardEvent>();

  readonly isOpen = signal(false);
  readonly nameMaxLength = FIELD_LIMITS.board.name;

  readonly trackOptions = computed(() =>
    this.tracks().map(t => ({
      label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
      value: t.id,
    })),
  );

  readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [profanityValidator]),
    selectedTrackId: this.fb.control<number | null>(null),
  });

  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, {
    initialValue: '',
  });
  readonly nameError = computed(() =>
    hasProfanity(this.nameValue()) ? PROFANITY_ERROR : '',
  );

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.form.reset({
      name: '',
      selectedTrackId: null,
    });
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { name, selectedTrackId } = this.form.getRawValue();

    this.create.emit({
      name: name || '',
      selectedTrackId: selectedTrackId ?? null,
    });

    this.close();
  }
}
