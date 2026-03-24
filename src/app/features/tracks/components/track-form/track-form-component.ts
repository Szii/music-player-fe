import { Component, EventEmitter, inject, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface TrackFormEvent {
  trackName: string;
  trackLink: string;
}

@Component({
  selector: 'app-track-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="card mb-4">
      <div class="card-body">
        <h2 class="h4 mb-3">
          {{ editingTrackId ? 'Edit track' : 'Create track' }}
        </h2>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-3">
            <label class="form-label">Track name</label>
            <input class="form-control" formControlName="trackName" type="text" />
          </div>

          <div class="mb-3">
            <label class="form-label">Track link</label>
            <input class="form-control" formControlName="trackLink" type="text" />
            <div
              class="text-danger mt-1"
              *ngIf="form.controls.trackLink.touched && form.controls.trackLink.invalid"
            >
              Track link is required.
            </div>
          </div>

          <div class="d-flex gap-2">
            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="form.invalid || submitting"
            >
              {{
                submitting
                  ? (editingTrackId ? 'Saving...' : 'Creating...')
                  : (editingTrackId ? 'Save changes' : 'Create track')
              }}
            </button>

            <button
              *ngIf="editingTrackId"
              class="btn btn-outline-secondary"
              type="button"
              (click)="cancel.emit()"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TrackFormComponent implements OnChanges {
  private fb = inject(FormBuilder);

  @Input() editingTrackId: number | null = null;
  @Input() editTrackName: string = '';
  @Input() editTrackLink: string = '';
  @Input() submitting = false;

  @Output() save = new EventEmitter<TrackFormEvent>();
  @Output() cancel = new EventEmitter<void>();

  form = this.fb.group({
    trackName: [''],
    trackLink: ['', [Validators.required]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ('editingTrackId' in changes) {
      if (this.editingTrackId) {
        this.form.patchValue({
          trackName: this.editTrackName,
          trackLink: this.editTrackLink,
        });
      } else {
        this.form.reset({ trackName: '', trackLink: '' });
      }
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { trackName, trackLink } = this.form.getRawValue();
    this.save.emit({ trackName: trackName || '', trackLink: trackLink! });
  }

  resetForm(): void {
    this.form.reset({ trackName: '', trackLink: '' });
  }
}