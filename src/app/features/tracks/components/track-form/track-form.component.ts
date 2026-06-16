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
  template: `
    @if (showTrigger()) {
      <app-icon-button
        icon="plus"
        label="Add track"
        variant="primary"
        size="lg"
        (clicked)="open()"
      />
    }

    @if (isOpen()) {
      <ui-dialog-shell
        [title]="isEditing() ? 'Edit track' : 'Add track'"
        titleId="track-modal-title"
        [showFooter]="true"
        (closed)="close()"
      >
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="track-form">
          <ui-form-field label="Track name">
            <ui-text-input
              formControlName="trackName"
              placeholder="e.g. Dark Forest Ambience"
              [maxLength]="limits.name"
            />
          </ui-form-field>

          <ui-form-field label="Track link" [error]="trackLinkError()">
            <ui-text-input
              formControlName="trackLink"
              type="url"
              placeholder="https://youtube.com/..."
              [maxLength]="trackLinkMaxLength()"
            />
            @if (linkLocked()) {
              <span class="track-form__hint">
                The link can't be changed once a track has windows or is published.
              </span>
            }
          </ui-form-field>
        </form>

        <ng-container dialog-footer>
          <normal-button
            type="button"
            variant="secondary"
            (clicked)="close()"
          >
            Cancel
          </normal-button>

          <normal-button
            type="submit"
            [disabled]="form.invalid || submitting()"
            [loading]="submitting()"
            (clicked)="onSubmit()"
          >
            {{ isEditing() ? 'Save changes' : 'Add track' }}
          </normal-button>
        </ng-container>
      </ui-dialog-shell>
    }
  `,
  styles: [`
    .track-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .track-form__hint {
      display: block;
      margin-top: 4px;
      font-size: 0.8rem;
      color: var(--app-text-muted);
    }
  `],
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
    trackName: this.fb.nonNullable.control(''),
    trackLink: this.fb.nonNullable.control('', [Validators.required]),
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