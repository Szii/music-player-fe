import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';

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
  ],
  template: `
    <!-- Trigger — only shown when not editing (edit is triggered by parent) -->
    <normal-button (clicked)="open()">+ Add track</normal-button>

    <!-- Modal -->
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="track-modal-title">

        <div class="modal__header">
          <h2 class="modal__title" id="track-modal-title">
            {{ editingTrackId ? 'Edit track' : 'Add track' }}
          </h2>
          <button class="modal__close" (click)="close()" aria-label="Close">✕</button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="modal__body">

          <ui-form-field label="Track name">
            <ui-text-input
              formControlName="trackName"
              placeholder="e.g. Dark Forest Ambience"
            />
          </ui-form-field>

          <ui-form-field label="Track link" [error]="trackLinkError">
            <ui-text-input
              formControlName="trackLink"
              type="url"
              placeholder="https://youtube.com/..."
            />
          </ui-form-field>

          <div class="modal__actions">
            <normal-button type="button" variant="secondary" (clicked)="close()">
              Cancel
            </normal-button>
            <normal-button
              type="submit"
              [disabled]="form.invalid || submitting"
              [loading]="submitting"
            >
              {{ editingTrackId ? 'Save changes' : 'Add track' }}
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
      max-width: 460px;
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
export class TrackFormComponent implements OnChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  @Input() editingTrackId: number | null = null;
  @Input() editTrackName = '';
  @Input() editTrackLink = '';
  @Input() submitting = false;

  @Output() save = new EventEmitter<TrackFormEvent>();
  @Output() cancel = new EventEmitter<void>();

  isOpen = false;

  form = this.fb.group({
    trackName: [''],
    trackLink: ['', [Validators.required]],
  });

  get trackLinkError(): string {
    const c = this.form.controls.trackLink;
    if (!c.touched || !c.invalid) return '';
    if (c.hasError('required')) return 'Track link is required.';
    return 'Invalid value.';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('editingTrackId' in changes) {
      if (this.editingTrackId) {
        this.form.patchValue({
          trackName: this.editTrackName,
          trackLink: this.editTrackLink,
        });
        this.isOpen = true;
        this.cdr.markForCheck();
      } else {
        this.form.reset({ trackName: '', trackLink: '' });
        this.isOpen = false;
        this.cdr.markForCheck();
      }
    }
  }

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.form.reset({ trackName: '', trackLink: '' });
    // If we were editing, tell the parent to cancel so it clears editingTrackId.
    if (this.editingTrackId) {
      this.cancel.emit();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { trackName, trackLink } = this.form.getRawValue();
    this.save.emit({ trackName: trackName || '', trackLink: trackLink || '' });
    // Don't close here — wait for the parent to clear editingTrackId after save,
    // which will trigger ngOnChanges and close automatically.
  }

  resetForm(): void {
    this.form.reset({ trackName: '', trackLink: '' });
  }
}