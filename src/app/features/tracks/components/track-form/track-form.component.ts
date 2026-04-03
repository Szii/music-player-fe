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
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';

export interface TrackFormEvent {
  trackName: string;
  trackLink: string;
}

@Component({
  selector: 'app-track-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NormalButtonComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    IconButtonComponent,
  ],
  template: `
    <app-icon-button
      icon="plus"
      label="Add track"
      variant="primary"
      size="lg"
      (clicked)="open()"
    />

    <div class="modal-backdrop" *ngIf="isOpen()" (click)="close()">
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-modal-title"
        (click)="$event.stopPropagation()"
      >
        <div class="modal__header">
          <h2 class="modal__title" id="track-modal-title">
            {{ isEditing() ? 'Edit track' : 'Add track' }}
          </h2>

          <button
            class="modal__close"
            type="button"
            (click)="close()"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="modal__body">
          <ui-form-field label="Track name">
            <ui-text-input
              formControlName="trackName"
              placeholder="e.g. Dark Forest Ambience"
            />
          </ui-form-field>

          <ui-form-field label="Track link" [error]="trackLinkError()">
            <ui-text-input
              formControlName="trackLink"
              type="url"
              placeholder="https://youtube.com/..."
            />
          </ui-form-field>

          <div class="modal__actions">
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
            >
              {{ isEditing() ? 'Save changes' : 'Add track' }}
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
      max-width: 460px;
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
      to   { opacity: 1; transform: translateY(0) scale(1); }
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
      left: 20px;
      right: 20px;
      bottom: 0;
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
export class TrackFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly editingTrackId = input<number | null>(null);
  readonly editTrackName = input('');
  readonly editTrackLink = input('');
  readonly submitting = input(false);

  readonly save = output<TrackFormEvent>();
  readonly cancel = output<void>();

  readonly isOpen = signal(false);

  readonly isEditing = computed(() => this.editingTrackId() != null);

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