import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  PROFANITY_ERROR,
  profanityValidator,
} from '../../../../shared/validators/profanity.validator';

export interface TrackFormEvent {
  trackName: string;
  trackLink: string;
}

@Component({
  selector: 'app-track-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NormalButtonComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    IconButtonComponent,
    UiDialogShellComponent,
  ],
  templateUrl: './track-form.component.html',
  styleUrl: './track-form.component.scss',
})
export class TrackFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly editingTrackId = input<number | null>(null);
  readonly editTrackName = input('');
  readonly editTrackLink = input('');
  /** Disallow changing the link (track has windows or is published). */
  readonly lockTrackLink = input(false);
  readonly submitting = input(false);
  readonly showTrigger = input(true);

  readonly save = output<TrackFormEvent>();
  readonly cancel = output<void>();

  readonly isOpen = signal(false);

  readonly limits = FIELD_LIMITS.track;

  readonly isEditing = computed(() => this.editingTrackId() != null);
  readonly linkLocked = computed(() => this.isEditing() && this.lockTrackLink());
  readonly trackLinkMaxLength = computed(() =>
    this.isEditing() ? this.limits.linkUpdate : this.limits.linkCreate,
  );

  readonly form = this.fb.group({
    trackName: this.fb.nonNullable.control('', [profanityValidator]),
    trackLink: this.fb.nonNullable.control('', [Validators.required]),
  });

  readonly trackNameError = computed(() => {
    const control = this.form.controls.trackName;
    if (!control.touched || !control.hasError('profanity')) return '';
    return PROFANITY_ERROR;
  });

  readonly trackLinkError = computed(() => {
    const control = this.form.controls.trackLink;
    if (!control.touched || !control.invalid) return '';
    if (control.hasError('required')) return 'Track link is required.';
    return 'Invalid value.';
  });

  constructor() {
    let previousEditingId: number | null | undefined = undefined;

    effect(() => {
      const currentEditingId = this.editingTrackId();

      if (currentEditingId != null && currentEditingId !== previousEditingId) {
        this.form.reset({
          trackName: this.editTrackName(),
          trackLink: this.editTrackLink(),
        });
        this.isOpen.set(true);
      }

      if (currentEditingId == null && previousEditingId != null) {
        this.form.reset({
          trackName: '',
          trackLink: '',
        });
        this.isOpen.set(false);
      }

      previousEditingId = currentEditingId;
    });

    // Lock/unlock the link control. A disabled control is excluded from
    // validation but still returned by getRawValue(), so the unchanged link is
    // submitted on save.
    effect(() => {
      const control = this.form.controls.trackLink;
      if (this.linkLocked()) {
        if (control.enabled) control.disable({ emitEvent: false });
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    });
  }

  open(): void {
    if (this.isEditing()) return;
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);

    this.form.reset({
      trackName: '',
      trackLink: '',
    });

    if (this.isEditing()) {
      this.cancel.emit();
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { trackName, trackLink } = this.form.getRawValue();

    this.save.emit({
      trackName: trackName || '',
      trackLink: trackLink || '',
    });
  }

  resetForm(): void {
    this.form.reset({
      trackName: '',
      trackLink: '',
    });
  }
}