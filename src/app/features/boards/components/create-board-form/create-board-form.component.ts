import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';

export interface CreateBoardEvent {
  name: string;
  selectedTrackId: number | null;
}

@Component({
  selector: 'app-create-board-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    IconButtonComponent,
    UiSelectComponent,
    UiDialogShellComponent,
  ],
  template: `
    <app-icon-button
      icon="plus"
      label="Add board"
      variant="primary"
      size="lg"
      (clicked)="open()"
    />

    <ui-dialog-shell
      *ngIf="isOpen()"
      title="Create board"
      titleId="create-board-title"
      [showFooter]="true"
      (closed)="close()"
    >
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="create-board-form">
        <ui-form-field label="Board name">
          <ui-text-input
            formControlName="name"
            placeholder="e.g. Tavern Ambience"
          />
        </ui-form-field>

        <div class="create-board-form__field">
          <label class="app-form-label">Track</label>
          <ui-select
            [options]="trackOptions()"
            nullOption="— no track selected —"
            formControlName="selectedTrackId"
          />
        </div>
      </form>

      <ng-container dialog-footer>
        <normal-button type="button" variant="secondary" (clicked)="close()">
          Cancel
        </normal-button>

        <normal-button
          type="submit"
          [disabled]="submitting()"
          [loading]="submitting()"
          (clicked)="onSubmit()"
        >
          Create board
        </normal-button>
      </ng-container>
    </ui-dialog-shell>
  `,
  styles: [`
    .create-board-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .create-board-form__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `],
})
export class CreateBoardFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly tracks = input<Track[]>([]);
  readonly submitting = input(false);

  readonly create = output<CreateBoardEvent>();

  readonly isOpen = signal(false);

  readonly trackOptions = computed(() =>
    this.tracks().map(t => ({
      label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
      value: t.id,
    })),
  );

  readonly form = this.fb.group({
    name: this.fb.nonNullable.control(''),
    selectedTrackId: this.fb.control<number | null>(null),
  });

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
    const { name, selectedTrackId } = this.form.getRawValue();

    this.create.emit({
      name: name || '',
      selectedTrackId: selectedTrackId ?? null,
    });

    this.close();
  }
}
